import { PrismaClient } from "@prisma/client";
import {
  allocateExpense,
  type ExpenseSplitMethod,
} from "./allocation";
import { prisma } from "../../../lib/prisma";
import { applyExpenseObligations, BalanceProjectionError } from "./balance-projection";

export type ExpenseCreationErrorCode =
  | "INVALID_INPUT"
  | "ACTOR_NOT_FOUND"
  | "PAYER_NOT_FOUND"
  | "PARTICIPANT_NOT_FOUND"
  | "GROUP_NOT_FOUND"
  | "GROUP_MEMBERSHIP_REQUIRED"
  | "DIRECT_PARTICIPANTS_INVALID"
  | "DIRECT_ACTOR_NOT_INVOLVED"
  | "BALANCE_OVERFLOW"
  | "SCOPE_INVARIANT";

export class ExpenseCreationError extends Error {
  constructor(
    public readonly code: ExpenseCreationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ExpenseCreationError";
  }
}

interface CommonExpenseInput {
  actorUserId: string;
  payerUserId: string;
  amount: string;
  expenseDate: Date | string;
  description: string;
  splitMethod: ExpenseSplitMethod;
  participants: readonly {
    userId: string;
    percentageBasisPoints?: number | null;
  }[];
}

export interface CreateGroupExpenseInput extends CommonExpenseInput {
  kind: "GROUP";
  groupId: string;
}

export interface CreateDirectExpenseInput extends CommonExpenseInput {
  kind: "DIRECT";
  currencyCode: string;
}

export type CreateExpenseInput = CreateGroupExpenseInput | CreateDirectExpenseInput;
export type ExpenseTransactionClient = Pick<PrismaClient, "$transaction">;

export interface ExpenseCreationResult {
  expenseId: string;
  revisionId: string;
  kind: "GROUP" | "DIRECT";
  status: "PENDING" | "APPROVED";
  currencyCode: string;
  amountCents: string;
  shares: {
    participantUserId: string;
    shareCents: string;
    percentageBasisPoints: number | null;
    allocationOrder: number;
  }[];
}

function requireText(value: string, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ExpenseCreationError("INVALID_INPUT", `${field} is required.`);
  }
  return value.trim();
}

function parseExpenseDate(value: Date | string): Date {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  const isCalendarDate = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
  if (!Number.isFinite(date.getTime()) || (isCalendarDate && date.toISOString().slice(0, 10) !== value)) {
    throw new ExpenseCreationError("INVALID_INPUT", "Expense date is invalid.");
  }
  return date;
}

function validateDescription(description: string): string {
  return requireText(description, "Description");
}

function validateCurrencyCode(currencyCode: string): string {
  const value = requireText(currencyCode, "Currency code");
  if (!/^[A-Z]{3}$/.test(value)) {
    throw new ExpenseCreationError("INVALID_INPUT", "Currency code must be a three-letter uppercase code.");
  }
  return value;
}

function validateDirectPair(input: CreateDirectExpenseInput): { low: string; high: string } {
  const participants = new Set(input.participants.map((participant) => participant.userId));
  const people = new Set([...participants, input.payerUserId]);
  if (people.size !== 2 || participants.size === 0) {
    throw new ExpenseCreationError(
      "DIRECT_PARTICIPANTS_INVALID",
      "A direct expense must involve exactly two distinct users across its payer and participants.",
    );
  }
  if (!people.has(input.actorUserId)) {
    throw new ExpenseCreationError(
      "DIRECT_ACTOR_NOT_INVOLVED",
      "The direct expense creator must be the payer or a participant.",
    );
  }
  const [low, high] = [...people].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  return { low, high };
}

export async function createExpense(
  input: CreateExpenseInput,
  client: ExpenseTransactionClient = prisma,
): Promise<ExpenseCreationResult> {
  if (input.kind !== "GROUP" && input.kind !== "DIRECT") {
    throw new ExpenseCreationError("INVALID_INPUT", "Expense kind must be GROUP or DIRECT.");
  }
  const actorUserId = requireText(input.actorUserId, "Authenticated actor");
  const payerUserId = requireText(input.payerUserId, "Payer");
  const description = validateDescription(input.description);
  const expenseDate = parseExpenseDate(input.expenseDate);
  const allocation = allocateExpense({
    amount: input.amount,
    splitMethod: input.splitMethod,
    payerUserId,
    participants: input.participants,
  });
  const directPair = input.kind === "DIRECT" ? validateDirectPair(input) : null;
  const groupId = input.kind === "GROUP" ? requireText(input.groupId, "Group ID") : null;
  const directCurrencyCode = input.kind === "DIRECT" ? validateCurrencyCode(input.currencyCode) : null;

  return client.$transaction(async (tx) => {
    const involvedUserIds = [...new Set([
      actorUserId,
      payerUserId,
      ...allocation.shares.map((share) => share.participantUserId),
    ])];
    const users = await tx.user.findMany({
      where: { id: { in: involvedUserIds } },
      select: { id: true },
    });
    const existingUserIds = new Set(users.map((user) => user.id));
    if (!existingUserIds.has(actorUserId)) {
      throw new ExpenseCreationError("ACTOR_NOT_FOUND", "Authenticated actor does not exist.");
    }
    if (!existingUserIds.has(payerUserId)) {
      throw new ExpenseCreationError("PAYER_NOT_FOUND", "Payer does not exist.");
    }
    if (allocation.shares.some((share) => !existingUserIds.has(share.participantUserId))) {
      throw new ExpenseCreationError("PARTICIPANT_NOT_FOUND", "One or more participants do not exist.");
    }

    let currencyCode: string;
    let balanceScopeId: string;
    if (input.kind === "GROUP") {
      const group = await tx.group.findUnique({
        where: { id: groupId as string },
        select: { id: true, currencyCode: true },
      });
      if (!group) {
        throw new ExpenseCreationError("GROUP_NOT_FOUND", "Group does not exist.");
      }
      const requiredMembers = [...new Set([
        actorUserId,
        payerUserId,
        ...allocation.shares.map((share) => share.participantUserId),
      ])];
      const memberships = await tx.groupMembership.findMany({
        where: { groupId: group.id, userId: { in: requiredMembers }, status: "ACTIVE" },
        select: { userId: true },
      });
      const activeMemberIds = new Set(memberships.map((membership) => membership.userId));
      if (requiredMembers.some((userId) => !activeMemberIds.has(userId))) {
        throw new ExpenseCreationError(
          "GROUP_MEMBERSHIP_REQUIRED",
          "The creator, payer, and every group participant must be active members.",
        );
      }
      currencyCode = group.currencyCode;
      const scope = await tx.balanceScope.upsert({
        where: { groupId: group.id },
        update: {},
        create: { kind: "GROUP", groupId: group.id, currencyCode },
        select: { id: true, kind: true, currencyCode: true },
      });
      if (scope.kind !== "GROUP" || scope.currencyCode !== currencyCode) {
        throw new ExpenseCreationError("SCOPE_INVARIANT", "Group balance scope does not match its currency.");
      }
      balanceScopeId = scope.id;
    } else {
      const pair = directPair as { low: string; high: string };
      currencyCode = directCurrencyCode as string;
      let scope = await tx.balanceScope.findFirst({
        where: {
          kind: "DIRECT",
          directLowUserId: pair.low,
          directHighUserId: pair.high,
          currencyCode,
        },
        select: { id: true, kind: true, currencyCode: true },
      });
      if (!scope) {
        scope = await tx.balanceScope.create({
          data: {
            kind: "DIRECT",
            directLowUserId: pair.low,
            directHighUserId: pair.high,
            currencyCode,
          },
          select: { id: true, kind: true, currencyCode: true },
        });
      }
      if (scope.kind !== "DIRECT" || scope.currencyCode !== currencyCode) {
        throw new ExpenseCreationError("SCOPE_INVARIANT", "Direct balance scope does not match the pair and currency.");
      }
      balanceScopeId = scope.id;
    }

    const expense = await tx.expense.create({
      data: {
        kind: input.kind,
        groupId,
        createdByUserId: actorUserId,
        currentRevisionNumber: 1,
        status: "PENDING",
      },
      select: { id: true },
    });
    const revision = await tx.expenseRevision.create({
      data: {
        expenseId: expense.id,
        revisionNumber: 1,
        createdByUserId: actorUserId,
        payerUserId,
        balanceScopeId,
        amountCents: allocation.amountCents,
        currencyCode,
        expenseDate,
        description,
        splitMethod: input.splitMethod,
      },
      select: { id: true },
    });
    await tx.expenseShare.createMany({
      data: allocation.shares.map((share) => ({
        revisionId: revision.id,
        participantUserId: share.participantUserId,
        shareCents: share.shareCents,
        percentageBasisPoints: share.percentageBasisPoints,
        allocationOrder: share.allocationOrder,
      })),
    });
    await tx.expense.update({
      where: { id: expense.id },
      data: { currentBalanceScopeId: balanceScopeId },
    });

    let status: "PENDING" | "APPROVED" = "PENDING";
    if (input.kind === "DIRECT") {
      await tx.expense.update({
        where: { id: expense.id },
        data: { status: "APPROVED" },
      });
      try {
        await applyExpenseObligations(tx, balanceScopeId, payerUserId, allocation.shares);
      } catch (error) {
        if (error instanceof BalanceProjectionError) {
          throw new ExpenseCreationError("BALANCE_OVERFLOW", "The direct expense would exceed the supported signed balance range.");
        }
        throw error;
      }
      status = "APPROVED";
    }

    return {
      expenseId: expense.id,
      revisionId: revision.id,
      kind: input.kind,
      status,
      currencyCode,
      amountCents: allocation.amountCents.toString(),
      shares: allocation.shares.map((share) => ({
        participantUserId: share.participantUserId,
        shareCents: share.shareCents.toString(),
        percentageBasisPoints: share.percentageBasisPoints,
        allocationOrder: share.allocationOrder,
      })),
    };
  });
}
