import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "../../../lib/prisma";
import { requireActiveGroupMember } from "../groups/service";

const ZERO = BigInt(0);
const HUNDRED = BigInt(100);
export const MAX_PAYMENT_CENTS = BigInt("9223372036854775807");

export class PaymentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentError";
  }
}

export function parsePaymentAmount(raw: string) {
  const value = raw.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) {
    throw new PaymentError("Enter a positive amount with no more than two decimal places.");
  }
  const [whole, fraction = ""] = value.split(".");
  const significantWhole = whole.replace(/^0+(?=\d)/, "");
  if (significantWhole.length > 17) throw new PaymentError("Payment amount exceeds the supported limit.");
  const cents = BigInt(significantWhole) * HUNDRED + BigInt(fraction.padEnd(2, "0"));
  if (cents <= ZERO) throw new PaymentError("Payment amount must be greater than zero.");
  if (cents > MAX_PAYMENT_CENTS) throw new PaymentError("Payment amount exceeds the supported limit.");
  return cents;
}

function parsePaymentDate(raw: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw new PaymentError("Choose a valid payment date.");
  const date = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== raw) {
    throw new PaymentError("Choose a valid payment date.");
  }
  return date;
}

function validateIdempotencyKey(raw: string) {
  const key = raw.trim();
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(key)) throw new PaymentError("This payment form has expired. Refresh the page and try again.");
  return key;
}

function money(cents: bigint, currencyCode: string) {
  const absolute = cents < ZERO ? -cents : cents;
  return `${currencyCode} ${(absolute / HUNDRED).toLocaleString("en-US")}.${(absolute % HUNDRED).toString().padStart(2, "0")}`;
}

function decimal(cents: bigint) {
  return `${cents / HUNDRED}.${(cents % HUNDRED).toString().padStart(2, "0")}`;
}

function hashRequest(input: { scopeId: string; debtorUserId: string; creditorUserId: string; amountCents: bigint; currencyCode: string; paymentDate: Date }) {
  const canonical = JSON.stringify([
    input.scopeId,
    input.debtorUserId,
    input.creditorUserId,
    input.amountCents.toString(),
    input.currencyCode,
    input.paymentDate.toISOString(),
  ]);
  return createHash("sha256").update(canonical).digest("hex");
}

type PaymentClient = PrismaClient | Prisma.TransactionClient;

async function authorizeGroupPayment(actorUserId: string, groupId: string, client: PaymentClient) {
  const membership = await client.groupMembership.findUnique({
    where: { groupId_userId: { groupId, userId: actorUserId } },
    include: { periods: { select: { leftAt: true } } },
  });
  if (membership?.status === "ACTIVE") return;
  if (membership?.status === "INACTIVE" && membership.periods.some((period) => period.leftAt !== null)) return;
  throw new PaymentError("You are not authorized to settle this group obligation.");
}

async function loadAuthorizedScope(actorUserId: string, input: { scopeId: string; groupId?: string; creditorUserId: string }, client: PaymentClient) {
  const scope = await client.balanceScope.findUnique({
    where: { id: input.scopeId },
    select: {
      id: true,
      kind: true,
      groupId: true,
      currencyCode: true,
      directLowUserId: true,
      directHighUserId: true,
    },
  });
  if (!scope) throw new PaymentError("The balance scope was not found. Refresh the page and try again.");
  if (scope.kind === "GROUP") {
    if (!scope.groupId || scope.groupId !== input.groupId) throw new PaymentError("This payment does not match the selected group.");
    await authorizeGroupPayment(actorUserId, scope.groupId, client);
  } else if (scope.kind === "DIRECT") {
    if (input.groupId) throw new PaymentError("A direct payment cannot be submitted as a group payment.");
    const isScopePair = [scope.directLowUserId, scope.directHighUserId].includes(actorUserId)
      && [scope.directLowUserId, scope.directHighUserId].includes(input.creditorUserId)
      && actorUserId !== input.creditorUserId;
    if (!isScopePair) throw new PaymentError("You are not authorized to settle this direct obligation.");
  } else {
    throw new PaymentError("This balance scope cannot accept payments.");
  }

  if (actorUserId === input.creditorUserId) throw new PaymentError("A payment must be made by the debtor to another user.");
  return scope;
}

function shapePayment(payment: {
  id: string;
  balanceScopeId: string;
  debtorUserId: string;
  creditorUserId: string;
  amountCents: bigint;
  paymentDate: Date;
  createdAt: Date;
  debtor: { displayName: string; username: string };
  creditor: { displayName: string; username: string };
}, currencyCode: string, repeated: boolean) {
  return {
    id: payment.id,
    balanceScopeId: payment.balanceScopeId,
    debtorUserId: payment.debtorUserId,
    creditorUserId: payment.creditorUserId,
    debtorName: payment.debtor.displayName || payment.debtor.username,
    creditorName: payment.creditor.displayName || payment.creditor.username,
    amountCents: payment.amountCents.toString(),
    amount: money(payment.amountCents, currencyCode),
    currencyCode,
    paymentDate: payment.paymentDate.toISOString().slice(0, 10),
    createdAt: payment.createdAt.toISOString(),
    repeated,
  };
}

function isUniqueConflict(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function translatePaymentDatabaseError(error: unknown): never {
  const message = error instanceof Error ? error.message : "";
  if (/payment must settle an outstanding authorized obligation within its scope/i.test(message)) {
    throw new PaymentError("This obligation was settled or changed, or the amount exceeds what is currently owed. Refresh balances and try again.");
  }
  if (/Payment_amount_check|amountCents.*constraint|CHECK constraint failed/i.test(message)) {
    throw new PaymentError("Payment amount must be positive and within the supported limit.");
  }
  if (/Payment_users_check/i.test(message)) throw new PaymentError("A payment must be recorded by its debtor and sent to another user.");
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2004") {
    throw new PaymentError("This obligation is no longer available for payment. Refresh balances and try again.");
  }
  throw error instanceof PaymentError ? error : new PaymentError("The payment could not be recorded. Refresh balances and try again.");
}

export type RecordPaymentInput = {
  scopeId: string;
  groupId?: string;
  creditorUserId: string;
  amount: string;
  paymentDate: string;
  idempotencyKey: string;
};

export async function recordPayment(actorUserId: string, input: RecordPaymentInput, client: PrismaClient = prisma) {
  const amountCents = parsePaymentAmount(input.amount);
  const paymentDate = parsePaymentDate(input.paymentDate);
  const idempotencyKey = validateIdempotencyKey(input.idempotencyKey);

  try {
    const result = await client.$transaction(async (tx) => {
      const scope = await loadAuthorizedScope(actorUserId, input, tx);
      const requestHash = hashRequest({
        scopeId: scope.id,
        debtorUserId: actorUserId,
        creditorUserId: input.creditorUserId,
        amountCents,
        currencyCode: scope.currencyCode,
        paymentDate,
      });
      const existing = await tx.payment.findUnique({ where: { idempotencyKey }, include: { debtor: true, creditor: true } });
      if (existing) {
        if (existing.requestHash !== requestHash) throw new PaymentError("This payment key was already used for a different request.");
        return { payment: shapePayment(existing, scope.currencyCode, true), groupId: scope.groupId };
      }

      const lowUserId = actorUserId < input.creditorUserId ? actorUserId : input.creditorUserId;
      const highUserId = actorUserId < input.creditorUserId ? input.creditorUserId : actorUserId;
      const pair = await tx.pairwiseObligation.findUnique({
        where: { balanceScopeId_userLowId_userHighId: { balanceScopeId: scope.id, userLowId: lowUserId, userHighId: highUserId } },
        select: { signedBalanceCents: true },
      });
      const signed = pair?.signedBalanceCents;
      const actorIsDebtor = signed !== undefined && signed !== ZERO && (actorUserId === lowUserId ? signed > ZERO : signed < ZERO);
      if (!actorIsDebtor) throw new PaymentError("You do not currently owe this user in this scope.");
      const outstanding = signed < ZERO ? -signed : signed;
      if (amountCents > outstanding) throw new PaymentError("Payment amount cannot exceed the current outstanding amount.");

      const payment = await tx.payment.create({
        data: {
          balanceScopeId: scope.id,
          debtorUserId: actorUserId,
          creditorUserId: input.creditorUserId,
          recordedByUserId: actorUserId,
          amountCents,
          idempotencyKey,
          requestHash,
          paymentDate,
        },
        include: { debtor: true, creditor: true },
      });
      // Payment_apply_to_pairwise_projection is the sole projection update for this write.
      return { payment: shapePayment(payment, scope.currencyCode, false), groupId: scope.groupId };
    });
    return result;
  } catch (error) {
    if (isUniqueConflict(error)) {
      const existing = await client.payment.findUnique({ where: { idempotencyKey }, include: { debtor: true, creditor: true, balanceScope: { select: { currencyCode: true, kind: true, groupId: true } } } });
      if (existing) {
        try {
          const scope = await loadAuthorizedScope(actorUserId, input, client);
          const expectedHash = hashRequest({ scopeId: scope.id, debtorUserId: actorUserId, creditorUserId: input.creditorUserId, amountCents, currencyCode: scope.currencyCode, paymentDate });
          if (existing.requestHash === expectedHash) return { payment: shapePayment(existing, existing.balanceScope.currencyCode, true), groupId: existing.balanceScope.groupId };
          throw new PaymentError("This payment key was already used for a different request.");
        } catch (authorizationOrReplayError) {
          throw authorizationOrReplayError;
        }
      }
    }
    translatePaymentDatabaseError(error);
  }
}

function shapeHistoryRow(payment: {
  id: string;
  amountCents: bigint;
  paymentDate: Date;
  createdAt: Date;
  debtor: { id: string; displayName: string; username: string };
  creditor: { id: string; displayName: string; username: string };
}, currencyCode: string) {
  return {
    id: payment.id,
    amount: money(payment.amountCents, currencyCode),
    currencyCode,
    paymentDate: payment.paymentDate,
    createdAt: payment.createdAt,
    debtorUserId: payment.debtor.id,
    creditorUserId: payment.creditor.id,
    debtorName: payment.debtor.displayName || payment.debtor.username,
    creditorName: payment.creditor.displayName || payment.creditor.username,
  };
}

export async function listGroupPayments(userId: string, groupId: string, client: PrismaClient = prisma) {
  await requireActiveGroupMember(userId, groupId, client);
  const scope = await client.balanceScope.findFirst({ where: { kind: "GROUP", groupId }, select: { id: true, currencyCode: true } });
  if (!scope) return [];
  const payments = await client.payment.findMany({
    where: { balanceScopeId: scope.id },
    orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }],
    include: { debtor: { select: { id: true, displayName: true, username: true } }, creditor: { select: { id: true, displayName: true, username: true } } },
  });
  return payments.map((payment) => shapeHistoryRow(payment, scope.currencyCode));
}

export async function listDirectBalancesForUser(userId: string, client: PrismaClient = prisma) {
  const scopes = await client.balanceScope.findMany({
    where: { kind: "DIRECT", OR: [{ directLowUserId: userId }, { directHighUserId: userId }] },
    include: {
      obligations: {
        where: { signedBalanceCents: { not: ZERO } },
        include: { userLow: { select: { id: true, displayName: true, username: true } }, userHigh: { select: { id: true, displayName: true, username: true } } },
      },
    },
    orderBy: [{ currencyCode: "asc" }, { createdAt: "desc" }],
  });
  return scopes.flatMap((scope) => scope.obligations.map((row) => {
    const lowOwes = row.signedBalanceCents > ZERO;
    const debtor = lowOwes ? row.userLow : row.userHigh;
    const creditor = lowOwes ? row.userHigh : row.userLow;
    return {
      scopeId: scope.id,
      currencyCode: scope.currencyCode,
      counterpartyUserId: debtor.id === userId ? creditor.id : debtor.id,
      debtorUserId: debtor.id,
      creditorUserId: creditor.id,
      debtorName: debtor.displayName || debtor.username,
      creditorName: creditor.displayName || creditor.username,
      amount: money(row.signedBalanceCents, scope.currencyCode),
      amountInput: decimal(row.signedBalanceCents < ZERO ? -row.signedBalanceCents : row.signedBalanceCents),
      isCurrentUserDebtor: debtor.id === userId,
    };
  }));
}

export async function listDirectPaymentsForUser(userId: string, client: PrismaClient = prisma) {
  const scopes = await client.balanceScope.findMany({
    where: { kind: "DIRECT", OR: [{ directLowUserId: userId }, { directHighUserId: userId }] },
    select: { id: true, currencyCode: true },
  });
  if (scopes.length === 0) return [];
  const currencyByScope = new Map(scopes.map((scope) => [scope.id, scope.currencyCode]));
  const payments = await client.payment.findMany({
    where: { balanceScopeId: { in: scopes.map((scope) => scope.id) }, OR: [{ debtorUserId: userId }, { creditorUserId: userId }] },
    orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }],
    include: { debtor: { select: { id: true, displayName: true, username: true } }, creditor: { select: { id: true, displayName: true, username: true } } },
  });
  return payments.map((payment) => shapeHistoryRow(payment, currencyByScope.get(payment.balanceScopeId) ?? ""));
}

export async function listFormerGroupPayments(userId: string, client: PrismaClient = prisma) {
  const memberships = await client.groupMembership.findMany({
    where: { userId, status: "INACTIVE", periods: { some: { leftAt: { not: null } } } },
    select: { groupId: true },
  });
  if (memberships.length === 0) return [];
  const scopes = await client.balanceScope.findMany({
    where: { kind: "GROUP", groupId: { in: memberships.map((membership) => membership.groupId) } },
    select: { id: true, currencyCode: true, groupId: true },
  });
  if (scopes.length === 0) return [];
  const scopeById = new Map(scopes.map((scope) => [scope.id, scope]));
  const payments = await client.payment.findMany({
    where: { balanceScopeId: { in: scopes.map((scope) => scope.id) }, OR: [{ debtorUserId: userId }, { creditorUserId: userId }] },
    orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }],
    include: {
      debtor: { select: { id: true, displayName: true, username: true } },
      creditor: { select: { id: true, displayName: true, username: true } },
      balanceScope: { select: { group: { select: { id: true, name: true } } } },
    },
  });
  return payments.map((payment) => {
    const scope = scopeById.get(payment.balanceScopeId);
    return { ...shapeHistoryRow(payment, scope?.currencyCode ?? ""), groupId: payment.balanceScope.group?.id, groupName: payment.balanceScope.group?.name };
  });
}

