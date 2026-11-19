import type { PrismaClient } from "@prisma/client";
import { prisma } from "../../../lib/prisma";

export type ReportContext = { kind: "GROUP"; groupId: string } | { kind: "DIRECT" };
type DateInput = string | string[] | undefined;

export class ReportInputError extends Error {}

function utcDay(value: DateInput) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000-")) {
    throw new ReportInputError("Enter both dates in YYYY-MM-DD format.");
  }
  const date = new Date(value + "T00:00:00.000Z");
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new ReportInputError("Enter valid calendar dates.");
  }
  return date;
}

export function parseReportRange(start: DateInput, end: DateInput) {
  const gte = utcDay(start);
  const lt = utcDay(end);
  if (gte > lt) throw new ReportInputError("The end date must be on or after the start date.");
  lt.setUTCDate(lt.getUTCDate() + 1);
  return { gte, lt };
}

const person = { select: { displayName: true } } as const;
const zero = BigInt(0);

export function listReportGroups(userId: string, client: PrismaClient = prisma) {
  return client.group.findMany({
    where: { memberships: { some: { userId, status: "ACTIVE" } } },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    select: { id: true, name: true, currencyCode: true },
  });
}

export async function getActivityReport(
  userId: string,
  context: ReportContext,
  dates: { start: DateInput; end: DateInput },
  client: PrismaClient = prisma,
) {
  const range = parseReportRange(dates.start, dates.end);
  return client.$transaction(async (tx) => {
    const group = context.kind === "GROUP"
      ? await tx.group.findFirst({
        where: { id: context.groupId, memberships: { some: { userId, status: "ACTIVE" } } },
        select: { id: true, name: true, currencyCode: true },
      })
      : null;
    if (context.kind === "GROUP" && !group) {
      throw new ReportInputError("This report context is unavailable. Choose one of your groups or personal direct activity.");
    }

    const scopes = await tx.balanceScope.findMany({
      where: group
        ? { kind: "GROUP", groupId: group.id }
        : { kind: "DIRECT", OR: [{ directLowUserId: userId }, { directHighUserId: userId }] },
      orderBy: [{ currencyCode: "asc" }, { id: "asc" }],
      select: {
        id: true,
        currencyCode: true,
        directLowUserId: true,
        directLowUser: person,
        directHighUser: person,
        revisions: {
          where: {
            expenseDate: range,
            expense: group ? { kind: "GROUP", groupId: group.id } : { kind: "DIRECT", groupId: null },
            ...(group ? {} : { OR: [{ payerUserId: userId }, { shares: { some: { participantUserId: userId } } }] }),
          },
          orderBy: [{ expenseDate: "desc" }, { createdAt: "desc" }, { id: "asc" }],
          select: {
            id: true,
            revisionNumber: true,
            expenseDate: true,
            description: true,
            amountCents: true,
            payer: person,
            reversal: { select: { id: true } },
            expense: { select: {
              status: true,
              currentRevisionNumber: true,
              currentBalanceScopeId: true,
              replacementFor: { select: { id: true } },
            } },
          },
        },
        payments: {
          where: {
            paymentDate: range,
            ...(group ? {} : { OR: [{ debtorUserId: userId }, { creditorUserId: userId }] }),
          },
          orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }, { id: "asc" }],
          select: { id: true, paymentDate: true, amountCents: true, debtor: person, creditor: person },
        },
        obligations: {
          where: {
            signedBalanceCents: { not: zero },
            ...(group ? {} : { OR: [{ userLowId: userId }, { userHighId: userId }] }),
          },
          orderBy: [{ userLowId: "asc" }, { userHighId: "asc" }],
          select: { id: true, signedBalanceCents: true, userLow: person, userHigh: person },
        },
      },
    });

    const sections = scopes.map((scope) => {
      // Apply the current pointer before exposing rows or calculating totals.
      const expenses = scope.revisions
        .filter((row) => row.expense.currentRevisionNumber === row.revisionNumber
          && row.expense.currentBalanceScopeId === scope.id)
        .map((row) => ({
          id: row.id,
          date: row.expenseDate,
          description: row.description,
          payer: row.payer.displayName,
          status: row.expense.status,
          amountCents: row.amountCents,
          reversed: Boolean(row.reversal),
          replacement: Boolean(row.expense.replacementFor),
        }));
      const balances = scope.obligations.map((row) => {
        const lowOwes = row.signedBalanceCents > zero;
        return {
          id: row.id,
          debtor: (lowOwes ? row.userLow : row.userHigh).displayName,
          creditor: (lowOwes ? row.userHigh : row.userLow).displayName,
          amountCents: lowOwes ? row.signedBalanceCents : -row.signedBalanceCents,
        };
      });
      const counterparty = scope.directLowUserId === userId ? scope.directHighUser : scope.directLowUser;
      return {
        scopeId: scope.id,
        label: group?.name ?? counterparty?.displayName ?? "Direct activity",
        currencyCode: scope.currencyCode,
        expenses,
        payments: scope.payments,
        balances,
        approvedCents: expenses.reduce((total, row) => row.status === "APPROVED" ? total + row.amountCents : total, zero),
        paymentCents: scope.payments.reduce((total, row) => total + row.amountCents, zero),
        outstandingCents: balances.reduce((total, row) => total + row.amountCents, zero),
      };
    });
    if (group && sections.length === 0) {
      sections.push({
        scopeId: "",
        label: group.name,
        currencyCode: group.currencyCode,
        expenses: [],
        payments: [],
        balances: [],
        approvedCents: zero,
        paymentCents: zero,
        outstandingCents: zero,
      });
    }
    return { sections };
  });
}

export type ActivityReport = Awaited<ReturnType<typeof getActivityReport>>;
