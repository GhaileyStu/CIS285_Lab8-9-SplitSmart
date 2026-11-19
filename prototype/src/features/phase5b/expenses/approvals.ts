import { Prisma, type PrismaClient } from "@prisma/client";
import { applyExpenseObligations } from "../../phase5a/expenses/balance-projection";
import { prisma } from "../../../lib/prisma";

export type ExpenseDecision = "APPROVE" | "REJECT";
export type GroupExpenseStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface ExpenseDecisionResult {
  expenseId: string;
  groupId: string;
  status: GroupExpenseStatus;
  decision: ExpenseDecision;
  approvalCount: number;
  requiredApprovals: number;
  repeated: boolean;
}

function approvalResult(
  expenseId: string,
  groupId: string,
  status: string,
  decision: ExpenseDecision,
  approvalCount: number,
  requiredApprovals: number,
  repeated: boolean,
): ExpenseDecisionResult {
  return {
    expenseId,
    groupId,
    status: status as GroupExpenseStatus,
    decision,
    approvalCount,
    requiredApprovals,
    repeated,
  };
}

function isUniqueConstraintError(error: unknown): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function decideGroupExpense(
  actorUserId: string,
  expenseId: string,
  decision: ExpenseDecision,
  client: PrismaClient = prisma,
): Promise<ExpenseDecisionResult> {
  if (decision !== "APPROVE" && decision !== "REJECT") {
    throw new Error("Choose approve or reject.");
  }
  if (!actorUserId || !expenseId) throw new Error("This expense is not available for your decision.");

  try {
    return await client.$transaction(async (tx) => {
      const expense = await tx.expense.findUnique({
        where: { id: expenseId },
        select: {
          id: true,
          kind: true,
          groupId: true,
          status: true,
          currentRevisionNumber: true,
        },
      });
      if (!expense || expense.kind !== "GROUP" || !expense.groupId) {
        throw new Error("This expense is not available for your decision.");
      }

      const revision = await tx.expenseRevision.findUnique({
        where: {
          expenseId_revisionNumber: {
            expenseId: expense.id,
            revisionNumber: expense.currentRevisionNumber,
          },
        },
        include: {
          shares: { select: { participantUserId: true, shareCents: true } },
          approvals: { select: { participantUserId: true, decision: true } },
        },
      });
      if (!revision || !revision.shares.some((share) => share.participantUserId === actorUserId)) {
        throw new Error("This expense is not available for your decision.");
      }

      const membershipPeriod = await tx.membershipPeriod.findFirst({
        where: {
          membership: { groupId: expense.groupId, userId: actorUserId },
        },
        select: { id: true },
      });
      if (!membershipPeriod) throw new Error("This expense is not available for your decision.");

      const existingDecision = revision.approvals.find((approval) => approval.participantUserId === actorUserId);
      if (existingDecision) {
        if (existingDecision.decision !== decision) {
          throw new Error("You already submitted the opposite decision for this expense.");
        }
        return approvalResult(
          expense.id,
          expense.groupId,
          expense.status,
          decision,
          revision.approvals.filter((approval) => approval.decision === "APPROVE").length,
          revision.shares.length,
          true,
        );
      }

      if (expense.status !== "PENDING") throw new Error("This expense has already been finalized.");
      if (revision.shares.length === 0) throw new Error("This expense has no participants to review it.");

      await tx.approval.create({
        data: {
          revisionId: revision.id,
          participantUserId: actorUserId,
          decision,
        },
      });

      if (decision === "REJECT") {
        const transition = await tx.expense.updateMany({
          where: { id: expense.id, status: "PENDING" },
          data: { status: "REJECTED" },
        });
        if (transition.count !== 1) throw new Error("This expense has already been finalized.");
        return approvalResult(expense.id, expense.groupId, "REJECTED", decision,
          revision.approvals.filter((approval) => approval.decision === "APPROVE").length,
          revision.shares.length, false);
      }

      const approvalCount = revision.approvals.filter((approval) => approval.decision === "APPROVE").length + 1;
      if (approvalCount !== revision.shares.length) {
        return approvalResult(expense.id, expense.groupId, "PENDING", decision, approvalCount, revision.shares.length, false);
      }

      const transition = await tx.expense.updateMany({
        where: { id: expense.id, status: "PENDING" },
        data: { status: "APPROVED" },
      });
      if (transition.count !== 1) throw new Error("This expense has already been finalized.");

      await applyExpenseObligations(
        tx,
        revision.balanceScopeId,
        revision.payerUserId,
        revision.shares,
      );

      return approvalResult(expense.id, expense.groupId, "APPROVED", decision, approvalCount, revision.shares.length, false);
    }, { maxWait: 10_000, timeout: 15_000 });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const expense = await client.expense.findUnique({
        where: { id: expenseId },
        select: { id: true, groupId: true, status: true, currentRevisionNumber: true },
      });
      if (expense?.groupId) {
        const revision = await client.expenseRevision.findUnique({
          where: { expenseId_revisionNumber: { expenseId, revisionNumber: expense.currentRevisionNumber } },
          include: { approvals: { select: { participantUserId: true, decision: true } }, shares: { select: { participantUserId: true } } },
        });
        const winner = revision?.approvals.find((approval) => approval.participantUserId === actorUserId);
        if (winner?.decision === decision) {
          return approvalResult(expense.id, expense.groupId, expense.status, decision,
            revision!.approvals.filter((approval) => approval.decision === "APPROVE").length,
            revision!.shares.length, true);
        }
        if (winner && winner.decision !== decision) throw new Error("You already submitted the opposite decision for this expense.");
      }
    }
    throw error;
  }
}
