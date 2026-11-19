import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), recordPayment: vi.fn() }));

vi.mock("../../../src/features/phase5b/auth/session", () => ({ requireUser: mocks.requireUser }));
vi.mock("../../../src/features/phase5b/expenses/payments", () => ({ recordPayment: mocks.recordPayment }));
vi.mock("next/navigation", () => ({ redirect: (destination: string): never => { throw new Error(`REDIRECT:${destination}`); } }));

import { recordPaymentAction } from "../../../src/features/phase5b/actions/payments";

function paymentForm(groupId = "group-1") {
  const form = new FormData();
  form.set("scopeId", "scope-1");
  form.set("groupId", groupId);
  form.set("creditorUserId", "creditor-1");
  form.set("amount", "12.34");
  form.set("paymentDate", "2026-11-19");
  form.set("idempotencyKey", "stable-key-1234567890");
  return form;
}

describe("payment Server Action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "authenticated-debtor" });
    mocks.recordPayment.mockResolvedValue({
      groupId: "group-1",
      payment: { id: "payment-1", amount: "USD 12.34", paymentDate: "2026-11-19", repeated: false },
    });
  });

  it("requires authentication before calling the payment service", async () => {
    mocks.requireUser.mockRejectedValue(new Error("REDIRECT:/login"));
    await expect(recordPaymentAction(paymentForm())).rejects.toThrow("REDIRECT:/login");
    expect(mocks.recordPayment).not.toHaveBeenCalled();
  });

  it("uses the session actor and ignores submitted debtor or recorder identities", async () => {
    const form = paymentForm();
    form.set("debtorUserId", "forged-debtor");
    form.set("recordedByUserId", "forged-recorder");
    form.set("actorUserId", "forged-actor");
    await expect(recordPaymentAction(form)).rejects.toThrow("REDIRECT:/?group=group-1&notice=");
    expect(mocks.recordPayment).toHaveBeenCalledWith("authenticated-debtor", {
      scopeId: "scope-1",
      groupId: "group-1",
      creditorUserId: "creditor-1",
      amount: "12.34",
      paymentDate: "2026-11-19",
      idempotencyKey: "stable-key-1234567890",
    });
  });

  it("redirects service validation failures with an actionable message", async () => {
    mocks.recordPayment.mockRejectedValue(new Error("Payment amount cannot exceed the current outstanding amount."));
    await expect(recordPaymentAction(paymentForm())).rejects.toThrow("outstanding%20amount");
    expect(mocks.recordPayment).toHaveBeenCalledTimes(1);
  });

  it("records direct-payment feedback at the overview route", async () => {
    mocks.recordPayment.mockResolvedValue({
      groupId: null,
      payment: { id: "direct-payment", amount: "CAD 2.00", paymentDate: "2026-11-19", repeated: false },
    });
    await expect(recordPaymentAction(paymentForm(""))).rejects.toThrow("REDIRECT:/?notice=");
    expect(mocks.recordPayment).toHaveBeenCalledWith("authenticated-debtor", expect.objectContaining({ groupId: undefined }));
  });
});
