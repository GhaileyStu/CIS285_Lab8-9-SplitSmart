import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  decideGroupExpense: vi.fn(),
}));

vi.mock("../../../src/features/phase5b/auth/session", () => ({ requireUser: mocks.requireUser }));
vi.mock("../../../src/features/phase5b/expenses/approvals", () => ({ decideGroupExpense: mocks.decideGroupExpense }));
vi.mock("next/navigation", () => ({
  redirect: (destination: string): never => { throw new Error(`REDIRECT:${destination}`); },
}));

import { approveGroupExpenseAction } from "../../../src/features/phase5b/actions/expenses";

describe("group expense approval actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "authenticated-user" });
    mocks.decideGroupExpense.mockResolvedValue({
      expenseId: "expense-1",
      groupId: "group-1",
      status: "PENDING",
      decision: "APPROVE",
      approvalCount: 1,
      requiredApprovals: 2,
      repeated: false,
    });
  });

  it("requires the existing authenticated session before calling the approval service", async () => {
    mocks.requireUser.mockRejectedValue(new Error("REDIRECT:/login"));
    const form = new FormData();
    form.set("expenseId", "expense-1");

    await expect(approveGroupExpenseAction(form)).rejects.toThrow("REDIRECT:/login");
    expect(mocks.decideGroupExpense).not.toHaveBeenCalled();
  });

  it("uses the session user and ignores any submitted actor identity", async () => {
    const form = new FormData();
    form.set("expenseId", "expense-1");
    form.set("actorUserId", "forged-user");

    await expect(approveGroupExpenseAction(form)).rejects.toThrow("REDIRECT:/?group=group-1&notice=");
    expect(mocks.decideGroupExpense).toHaveBeenCalledWith("authenticated-user", "expense-1", "APPROVE");
  });
});
