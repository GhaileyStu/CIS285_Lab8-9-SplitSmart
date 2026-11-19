"use server";

import { redirect } from "next/navigation";
import { requireUser } from "../auth/session";
import { createExpense } from "../../phase5a/expenses/create-expense";
import { requireActiveGroupMember } from "../groups/service";
import type { ExpenseSplitMethod } from "../../phase5a/expenses/allocation";
import { decideGroupExpense, type ExpenseDecisionResult } from "../expenses/approvals";

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export async function createGroupExpenseAction(formData: FormData) {
  const user = await requireUser();
  const groupId = text(formData, "groupId");
  let message: string | null = null;
  try {
    await requireActiveGroupMember(user.id, groupId);
    const payerUserId = text(formData, "payerUserId");
    const participantIds = formData.getAll("participantUserIds").filter((item): item is string => typeof item === "string");
    if (participantIds.length === 0 || participantIds.length > 100) throw new Error("Select between 1 and 100 participants.");
    const splitMethod = text(formData, "splitMethod");
    if (splitMethod !== "EQUAL" && splitMethod !== "PERCENTAGE") throw new Error("Choose an equal or percentage split.");
    const participants = participantIds.map((userId) => {
      if (splitMethod === "EQUAL") return { userId };
      const raw = text(formData, `percentage-${userId}`).trim();
      if (!/^\d{1,3}(?:\.\d{1,2})?$/.test(raw)) throw new Error("Enter each participant’s percentage to two decimal places.");
      const [whole, fraction = ""] = raw.split(".");
      const basisPoints = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
      if (!Number.isSafeInteger(basisPoints) || basisPoints < 0 || basisPoints > 10_000) throw new Error("Each percentage must be between 0 and 100.");
      return { userId, percentageBasisPoints: basisPoints };
    });
    await createExpense({
      kind: "GROUP",
      actorUserId: user.id,
      groupId,
      payerUserId,
      amount: text(formData, "amount").trim(),
      expenseDate: text(formData, "expenseDate"),
      description: text(formData, "description"),
      splitMethod: splitMethod as ExpenseSplitMethod,
      participants,
    });
  } catch (error) {
    message = error instanceof Error ? error.message : "Could not save the expense.";
  }
  if (message) redirect(`/?group=${encodeURIComponent(groupId)}&error=${encodeURIComponent(message)}`);
  redirect(`/?group=${encodeURIComponent(groupId)}&notice=Expense%20saved%20to%20history.`);
}

async function submitExpenseDecision(formData: FormData, decision: "APPROVE" | "REJECT") {
  const user = await requireUser();
  const expenseId = text(formData, "expenseId");
  let result: ExpenseDecisionResult | undefined;
  let message: string | null = null;
  try {
    result = await decideGroupExpense(user.id, expenseId, decision);
  } catch (error) {
    message = error instanceof Error ? error.message : "Could not record your decision.";
  }

  if (message || !result) redirect(`/?error=${encodeURIComponent(message ?? "Could not record your decision.")}`);

  if (result.repeated) {
    message = result.status === "REJECTED"
      ? "Your decision was already recorded. This expense is rejected."
      : result.status === "APPROVED"
        ? "Your decision was already recorded. This expense is approved."
        : "Your decision was already recorded; no additional approval was added.";
  } else if (result.status === "REJECTED") {
    message = "Expense rejected. It will not affect group balances.";
  } else if (result.status === "APPROVED") {
    message = "Expense approved. Group balances have been updated.";
  } else {
    message = `Decision recorded. ${result.approvalCount} of ${result.requiredApprovals} participants have approved.`;
  }

  redirect(`/?group=${encodeURIComponent(result.groupId)}&notice=${encodeURIComponent(message)}`);
}

export async function approveGroupExpenseAction(formData: FormData) {
  await submitExpenseDecision(formData, "APPROVE");
}

export async function rejectGroupExpenseAction(formData: FormData) {
  await submitExpenseDecision(formData, "REJECT");
}
