import Database from "better-sqlite3";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createExpense } from "../../../src/features/phase5a/expenses/create-expense";
import { decideGroupExpense } from "../../../src/features/phase5b/expenses/approvals";
import { listFormerParticipantPendingDecisions, listGroupExpenses } from "../../../src/features/phase5b/expenses/history";
import { addGroupMember, createGroup, deactivateGroupMember } from "../../../src/features/phase5b/groups/service";

let prisma: PrismaClient;
let testDirectory: string;
let sequence = 0;

function tag() { sequence += 1; return `approvaltest${sequence}`; }

async function makeUser(username = tag()) {
  return prisma.user.create({ data: {
    username,
    email: `${username}@example.test`,
    displayName: username,
    passwordHash: "test-only-hash",
  } });
}

async function makeGroupFixture() {
  const owner = await makeUser();
  const member = await makeUser();
  const otherMember = await makeUser();
  const outsider = await makeUser();
  const group = await createGroup(owner.id, "Approval Test Group", "USD", prisma);
  await addGroupMember(owner.id, group.id, member.username, prisma);
  await addGroupMember(owner.id, group.id, otherMember.username, prisma);
  return { owner, member, otherMember, outsider, group };
}

async function makeGroupExpense(
  fixture: Awaited<ReturnType<typeof makeGroupFixture>>,
  participants: { id: string; username: string }[] = [fixture.owner, fixture.member],
  amount = "20.00",
) {
  const result = await createExpense({
    kind: "GROUP",
    actorUserId: fixture.owner.id,
    groupId: fixture.group.id,
    payerUserId: fixture.owner.id,
    amount,
    expenseDate: "2026-11-19",
    description: "Approval test expense",
    splitMethod: "EQUAL",
    participants: participants.map(({ id }) => ({ userId: id })),
  }, prisma);
  return result;
}

async function groupObligations(groupId: string) {
  const scope = await prisma.balanceScope.findUnique({ where: { groupId } });
  if (!scope) return [];
  return prisma.pairwiseObligation.findMany({ where: { balanceScopeId: scope.id } });
}

beforeAll(async () => {
  testDirectory = mkdtempSync(join(tmpdir(), "splitsmart-phase5c-"));
  const dbPath = join(testDirectory, "phase5c-test.db");
  const migrationPath = resolve(process.cwd(), "prisma/migrations/20261119000000_init/migration.sql");
  const sqlite = new Database(dbPath);
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(readFileSync(migrationPath, "utf8"));
  sqlite.close();
  prisma = new PrismaClient({ datasources: { db: { url: `file:${dbPath}` } } });
  await prisma.$connect();
});

afterAll(async () => {
  await prisma?.$disconnect();
  if (testDirectory) rmSync(testDirectory, { recursive: true, force: true });
});

describe("group expense approvals", () => {
  it("keeps the expense pending and creates no obligations until every participant approves", async () => {
    const fixture = await makeGroupFixture();
    const expense = await makeGroupExpense(fixture);

    const first = await decideGroupExpense(fixture.owner.id, expense.expenseId, "APPROVE", prisma);
    expect(first).toMatchObject({ status: "PENDING", approvalCount: 1, requiredApprovals: 2, repeated: false });
    expect(await groupObligations(fixture.group.id)).toHaveLength(0);

    const history = await listGroupExpenses(fixture.owner.id, fixture.group.id, prisma);
    expect(history.expenses[0].revision.approvals).toHaveLength(1);
  });

  it("approves on the final vote and applies the saved shares once to the group scope", async () => {
    const fixture = await makeGroupFixture();
    const expense = await makeGroupExpense(fixture, [fixture.owner, fixture.member, fixture.otherMember], "30.00");
    const saved = await prisma.expenseShare.findMany({ where: { revisionId: expense.revisionId } });

    await decideGroupExpense(fixture.owner.id, expense.expenseId, "APPROVE", prisma);
    const result = await decideGroupExpense(fixture.member.id, expense.expenseId, "APPROVE", prisma);
    expect(result).toMatchObject({ status: "PENDING", approvalCount: 2, requiredApprovals: 3 });
    expect(await groupObligations(fixture.group.id)).toHaveLength(0);

    const final = await decideGroupExpense(fixture.otherMember.id, expense.expenseId, "APPROVE", prisma);
    expect(final).toMatchObject({ status: "APPROVED", approvalCount: 3, requiredApprovals: 3 });
    const obligations = await groupObligations(fixture.group.id);
    const expectedDebts = saved.filter((share) => share.participantUserId !== fixture.owner.id && share.shareCents > BigInt(0));
    expect(obligations).toHaveLength(expectedDebts.length);
    for (const share of expectedDebts) {
      const low = share.participantUserId < fixture.owner.id ? share.participantUserId : fixture.owner.id;
      const high = share.participantUserId < fixture.owner.id ? fixture.owner.id : share.participantUserId;
      const row = obligations.find((item) => item.userLowId === low && item.userHighId === high);
      expect(row?.signedBalanceCents).toBe(share.participantUserId < fixture.owner.id ? share.shareCents : -share.shareCents);
    }

    const repeat = await decideGroupExpense(fixture.otherMember.id, expense.expenseId, "APPROVE", prisma);
    expect(repeat.repeated).toBe(true);
    expect(await groupObligations(fixture.group.id)).toHaveLength(expectedDebts.length);
  });

  it("lets the creator approve as a participant but grants no creator-only approval privilege", async () => {
    const participantFixture = await makeGroupFixture();
    const participantExpense = await makeGroupExpense(participantFixture);
    await expect(decideGroupExpense(participantFixture.owner.id, participantExpense.expenseId, "APPROVE", prisma))
      .resolves.toMatchObject({ status: "PENDING", approvalCount: 1 });

    const nonparticipantFixture = await makeGroupFixture();
    const nonparticipantExpense = await makeGroupExpense(nonparticipantFixture, [nonparticipantFixture.member, nonparticipantFixture.otherMember]);
    await expect(decideGroupExpense(nonparticipantFixture.owner.id, nonparticipantExpense.expenseId, "APPROVE", prisma))
      .rejects.toThrow("not available for your decision");
  });

  it("rejects immediately, preserves prior approvals, and never applies balance obligations", async () => {
    const fixture = await makeGroupFixture();
    const expense = await makeGroupExpense(fixture, [fixture.owner, fixture.member, fixture.otherMember]);
    await decideGroupExpense(fixture.owner.id, expense.expenseId, "APPROVE", prisma);

    const result = await decideGroupExpense(fixture.member.id, expense.expenseId, "REJECT", prisma);
    expect(result.status).toBe("REJECTED");
    expect(await prisma.expense.findUnique({ where: { id: expense.expenseId }, select: { status: true } })).toEqual({ status: "REJECTED" });
    expect(await groupObligations(fixture.group.id)).toHaveLength(0);
    await expect(decideGroupExpense(fixture.otherMember.id, expense.expenseId, "APPROVE", prisma))
      .rejects.toThrow("already been finalized");
  });

  it("makes identical decisions idempotent and rejects an opposite second decision", async () => {
    const fixture = await makeGroupFixture();
    const expense = await makeGroupExpense(fixture);
    await decideGroupExpense(fixture.owner.id, expense.expenseId, "APPROVE", prisma);

    const repeat = await decideGroupExpense(fixture.owner.id, expense.expenseId, "APPROVE", prisma);
    expect(repeat.repeated).toBe(true);
    expect(await prisma.approval.count({ where: { revisionId: expense.revisionId, participantUserId: fixture.owner.id } })).toBe(1);
    await expect(decideGroupExpense(fixture.owner.id, expense.expenseId, "REJECT", prisma))
      .rejects.toThrow("opposite decision");
  });

  it("serializes concurrent duplicate submissions without duplicate approvals or projections", async () => {
    const fixture = await makeGroupFixture();
    const expense = await makeGroupExpense(fixture);

    const results = await Promise.all([
      decideGroupExpense(fixture.owner.id, expense.expenseId, "APPROVE", prisma),
      decideGroupExpense(fixture.owner.id, expense.expenseId, "APPROVE", prisma),
    ]);
    expect(results.filter((result) => result.repeated)).toHaveLength(1);
    expect(await prisma.approval.count({ where: { revisionId: expense.revisionId, participantUserId: fixture.owner.id } })).toBe(1);
    await decideGroupExpense(fixture.member.id, expense.expenseId, "APPROVE", prisma);
    expect(await groupObligations(fixture.group.id)).toHaveLength(1);
  });

  it("finalizes concurrent last-participant approvals exactly once", async () => {
    const fixture = await makeGroupFixture();
    const expense = await makeGroupExpense(fixture);

    const results = await Promise.all([
      decideGroupExpense(fixture.owner.id, expense.expenseId, "APPROVE", prisma),
      decideGroupExpense(fixture.member.id, expense.expenseId, "APPROVE", prisma),
    ]);
    expect(results.some((result) => result.status === "APPROVED")).toBe(true);
    expect(await prisma.approval.count({ where: { revisionId: expense.revisionId, decision: "APPROVE" } })).toBe(2);
    expect(await prisma.expense.findUnique({ where: { id: expense.expenseId }, select: { status: true } })).toEqual({ status: "APPROVED" });
    expect(await groupObligations(fixture.group.id)).toHaveLength(1);
  });

  it("allows a former participant to decide only their own pending revision without group-history access", async () => {
    const fixture = await makeGroupFixture();
    const eligibleExpense = await makeGroupExpense(fixture);
    const otherExpense = await makeGroupExpense(fixture, [fixture.owner, fixture.otherMember]);
    await deactivateGroupMember(fixture.owner.id, fixture.group.id, fixture.member.id, prisma);

    const inbox = await listFormerParticipantPendingDecisions(fixture.member.id, prisma);
    expect(inbox.map((item) => item.id)).toEqual([eligibleExpense.expenseId]);
    await expect(listGroupExpenses(fixture.member.id, fixture.group.id, prisma)).rejects.toThrow("not an active member");
    await expect(decideGroupExpense(fixture.member.id, otherExpense.expenseId, "APPROVE", prisma))
      .rejects.toThrow("not available for your decision");
    await expect(decideGroupExpense(fixture.member.id, eligibleExpense.expenseId, "APPROVE", prisma))
      .resolves.toMatchObject({ status: "PENDING", approvalCount: 1 });
  });

  it("denies nonparticipant members and unrelated users", async () => {
    const fixture = await makeGroupFixture();
    const expense = await makeGroupExpense(fixture, [fixture.owner, fixture.member]);
    await expect(decideGroupExpense(fixture.otherMember.id, expense.expenseId, "APPROVE", prisma))
      .rejects.toThrow("not available for your decision");
    await expect(decideGroupExpense(fixture.outsider.id, expense.expenseId, "REJECT", prisma))
      .rejects.toThrow("not available for your decision");
  });

  it("rejects direct expenses and unknown IDs from the group decision service", async () => {
    const fixture = await makeGroupFixture();
    const direct = await createExpense({
      kind: "DIRECT",
      actorUserId: fixture.owner.id,
      payerUserId: fixture.owner.id,
      currencyCode: "USD",
      amount: "10.00",
      expenseDate: "2026-11-19",
      description: "Direct expense",
      splitMethod: "EQUAL",
      participants: [{ userId: fixture.member.id }],
    }, prisma);
    await expect(decideGroupExpense(fixture.member.id, direct.expenseId, "APPROVE", prisma))
      .rejects.toThrow("not available for your decision");
    await expect(decideGroupExpense(fixture.member.id, "missing-expense", "APPROVE", prisma))
      .rejects.toThrow("not available for your decision");
  });

  it("uses only the current revision's participant set", async () => {
    const fixture = await makeGroupFixture();
    const expense = await makeGroupExpense(fixture);
    const original = await prisma.expenseRevision.findUniqueOrThrow({ where: { id: expense.revisionId } });
    const revision = await prisma.expenseRevision.create({
      data: {
        expenseId: expense.expenseId,
        revisionNumber: 2,
        createdByUserId: fixture.owner.id,
        payerUserId: fixture.owner.id,
        balanceScopeId: original.balanceScopeId,
        amountCents: original.amountCents,
        currencyCode: original.currencyCode,
        expenseDate: original.expenseDate,
        description: "Corrected revision",
        splitMethod: original.splitMethod,
      },
    });
    await prisma.expenseShare.create({ data: {
      revisionId: revision.id,
      participantUserId: fixture.member.id,
      shareCents: original.amountCents,
      percentageBasisPoints: null,
      allocationOrder: 0,
    } });
    await prisma.expense.update({ where: { id: expense.expenseId }, data: { currentRevisionNumber: 2 } });

    await expect(decideGroupExpense(fixture.owner.id, expense.expenseId, "APPROVE", prisma))
      .rejects.toThrow("not available for your decision");
    await expect(decideGroupExpense(fixture.member.id, expense.expenseId, "APPROVE", prisma))
      .resolves.toMatchObject({ requiredApprovals: 1, status: "APPROVED" });
    expect(await prisma.approval.findMany({ where: { revisionId: expense.revisionId } })).toHaveLength(0);
  });

  it("rolls back the final decision and status when the balance projection overflows", async () => {
    const fixture = await makeGroupFixture();
    const expense = await makeGroupExpense(fixture);
    const scope = await prisma.balanceScope.findUniqueOrThrow({ where: { groupId: fixture.group.id } });
    await decideGroupExpense(fixture.owner.id, expense.expenseId, "APPROVE", prisma);

    const debtorIsLow = fixture.member.id < fixture.owner.id;
    const low = debtorIsLow ? fixture.member.id : fixture.owner.id;
    const high = debtorIsLow ? fixture.owner.id : fixture.member.id;
    const boundary = debtorIsLow ? BigInt("9223372036854775807") : -BigInt("9223372036854775808");
    const existing = await prisma.pairwiseObligation.create({
      data: { balanceScopeId: scope.id, userLowId: low, userHighId: high, signedBalanceCents: boundary },
    });

    await expect(decideGroupExpense(fixture.member.id, expense.expenseId, "APPROVE", prisma))
      .rejects.toThrow("supported signed balance range");
    expect(await prisma.expense.findUnique({ where: { id: expense.expenseId }, select: { status: true } })).toEqual({ status: "PENDING" });
    expect(await prisma.approval.count({ where: { revisionId: expense.revisionId } })).toBe(1);
    expect((await prisma.pairwiseObligation.findUniqueOrThrow({ where: { id: existing.id } })).signedBalanceCents).toBe(boundary);
  });

  it("does not create obligations for a payer-only cent share or zero-cent participant shares", async () => {
    const fixture = await makeGroupFixture();
    const expense = await makeGroupExpense(fixture, [fixture.owner, fixture.member, fixture.otherMember], "0.01");
    const shares = await prisma.expenseShare.findMany({ where: { revisionId: expense.revisionId } });
    expect(shares.filter((share) => share.shareCents === BigInt(0)).length).toBeGreaterThan(0);
    await decideGroupExpense(fixture.owner.id, expense.expenseId, "APPROVE", prisma);
    await decideGroupExpense(fixture.member.id, expense.expenseId, "APPROVE", prisma);
    await decideGroupExpense(fixture.otherMember.id, expense.expenseId, "APPROVE", prisma);
    expect(await groupObligations(fixture.group.id)).toHaveLength(0);
  });

  it("does not allow a participant to repeat a prior approval as a rejection after finalization", async () => {
    const fixture = await makeGroupFixture();
    const expense = await makeGroupExpense(fixture);
    await decideGroupExpense(fixture.owner.id, expense.expenseId, "APPROVE", prisma);
    await decideGroupExpense(fixture.member.id, expense.expenseId, "APPROVE", prisma);
    await expect(decideGroupExpense(fixture.member.id, expense.expenseId, "REJECT", prisma))
      .rejects.toThrow("opposite decision");
  });
});
