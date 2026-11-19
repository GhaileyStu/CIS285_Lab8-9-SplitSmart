"use server";

import { redirect } from "next/navigation";
import { requireUser } from "../auth/session";
import { recordPayment } from "../expenses/payments";

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export async function recordPaymentAction(formData: FormData) {
  const user = await requireUser();
  const rawGroupId = text(formData, "groupId");
  let result: Awaited<ReturnType<typeof recordPayment>> | undefined;
  let message: string | null = null;

  try {
    result = await recordPayment(user.id, {
      scopeId: text(formData, "scopeId"),
      groupId: rawGroupId || undefined,
      creditorUserId: text(formData, "creditorUserId"),
      amount: text(formData, "amount"),
      paymentDate: text(formData, "paymentDate"),
      idempotencyKey: text(formData, "idempotencyKey"),
    });
  } catch (error) {
    message = error instanceof Error ? error.message : "The payment could not be recorded. Refresh balances and try again.";
  }

  if (message) {
    redirect(rawGroupId
      ? `/?group=${encodeURIComponent(rawGroupId)}&error=${encodeURIComponent(message)}`
      : `/?error=${encodeURIComponent(message)}`);
  }
  if (!result) redirect("/?error=The%20payment%20could%20not%20be%20recorded.");

  const notice = result.payment.repeated
    ? "This payment was already recorded; the original payment is unchanged."
    : `${result.payment.amount} payment recorded on ${result.payment.paymentDate}.`;
  // Payment insertion already updated PairwiseObligation via the migration trigger.
  redirect(result.groupId
    ? `/?group=${encodeURIComponent(result.groupId)}&notice=${encodeURIComponent(notice)}`
    : `/?notice=${encodeURIComponent(notice)}`);
}
