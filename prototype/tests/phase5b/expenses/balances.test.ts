import Database from "better-sqlite3";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createExpense } from "../../../src/features/phase5a/expenses/create-expense";
import { decideGroupExpense } from "../../../src/features/phase5b/expenses/approvals";
import { getGroupBalanceDetails, listBalanceSummariesForUser, listFormerPersonalBalances } from "../../../src/features/phase5b/expenses/balances";
import { listGroupExpenses } from "../../../src/features/phase5b/expenses/history";
import { createGroup, deactivateGroupMember, addGroupMember } from "../../../src/features/phase5b/groups/service";

let prisma: PrismaClient;
let testDirectory: string;
let sequence = 0;

function tag() { sequence += 1; return `balancetest${sequence}`; }

function netPositionCents(label: string) {
  const match = label.match(/^USD (\d+)\.(\d{2})/);
  if (!match) throw new Error(`Unexpected net position: ${label}`);
  const cents = BigInt(match[1]) * BigInt(100) + BigInt(match[2]);
  return label.includes("you owe") ? -cents : cents;
}

async function makeUser() {
  const username = tag();
  return prisma.user.create({ data: { username, email: `${username}@example.test`, displayName: username, passwordHash: "test-only-hash" } });
}

async function makeGroupFixture(currency = "USD") {
  const owner = await makeUser();
  const member = await makeUser();
  const other = await makeUser();
  const outsider = await makeUser();
  const group = await createGroup(owner.id, "Balance Test Group", currency, prisma);
  await addGroupMember(owner.id, group.id, member.username, prisma);
  await addGroupMember(owner.id, group.id, other.username, prisma);
  return { owner, member, other, outsider, group };
}

async function createGroupExpense(fixture: Awaited<ReturnType<typeof makeGroupFixture>>, payerUserId: string, participants: string[], amount: string, description: string) {
  return createExpense({
    kind: "GROUP", actorUserId: fixture.owner.id, groupId: fixture.group.id, payerUserId, amount,
    expenseDate: "2026-11-19", description, splitMethod: "EQUAL",
    participants: participants.map((userId) => ({ userId })),
  }, prisma);
}

async function approveAll(expenseId: string, participantIds: string[]) {
  for (const userId of participantIds) await decideGroupExpense(userId, expenseId, "APPROVE", prisma);
}

beforeAll(async () => {
  testDirectory = mkdtempSync(join(tmpdir(), "splitsmart-phase5d-"));
  const dbPath = join(testDirectory, "phase5d-test.db");
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

describe("Phase 5D balance queries", () => {
  it("interprets positive and negative signed rows correctly for both user ID positions", async () => {
    const fixture = await makeGroupFixture();
    const scope = await prisma.balanceScope.create({ data: { kind: "GROUP", groupId: fixture.group.id, currencyCode: "USD" } });
    const low = fixture.owner.id < fixture.member.id ? fixture.owner : fixture.member;
    const high = low.id === fixture.owner.id ? fixture.member : fixture.owner;
    await prisma.pairwiseObligation.create({ data: { balanceScopeId: scope.id, userLowId: low.id, userHighId: high.id, signedBalanceCents: BigInt(1250) } });

    const lowView = await getGroupBalanceDetails(low.id, fixture.group.id, prisma);
    const highView = await getGroupBalanceDetails(high.id, fixture.group.id, prisma);
    const uninvolvedView = await getGroupBalanceDetails(fixture.other.id, fixture.group.id, prisma);
    expect(lowView).toMatchObject({ iOwe: "USD 12.50", owedToMe: "USD 0.00", netPosition: "USD 12.50 you owe" });
    expect(highView).toMatchObject({ owedToMe: "USD 12.50", iOwe: "USD 0.00", netPosition: "USD 12.50 owed to you" });
    expect(uninvolvedView).toMatchObject({ owedToMe: "USD 0.00", iOwe: "USD 0.00", netPosition: "USD 0.00 · settled" });
    expect(lowView.outstandingTotal).toBe("USD 12.50");
    expect(netPositionCents(lowView.netPosition) + netPositionCents(highView.netPosition) + netPositionCents(uninvolvedView.netPosition)).toBe(BigInt(0));
    expect(lowView.pairwise[0]).toMatchObject({ debtorName: low.displayName, creditorName: high.displayName, amount: "USD 12.50" });

    await prisma.pairwiseObligation.updateMany({ where: { balanceScopeId: scope.id }, data: { signedBalanceCents: -BigInt(700) } });
    const reversedLow = await getGroupBalanceDetails(low.id, fixture.group.id, prisma);
    const reversedHigh = await getGroupBalanceDetails(high.id, fixture.group.id, prisma);
    expect(reversedLow).toMatchObject({ owedToMe: "USD 7.00", netPosition: "USD 7.00 owed to you" });
    expect(reversedHigh).toMatchObject({ iOwe: "USD 7.00", netPosition: "USD 7.00 you owe" });
    expect(reversedLow.pairwise[0]).toMatchObject({ debtorName: high.displayName, creditorName: low.displayName, amount: "USD 7.00" });
    const positions = [lowView, highView].map((view) => view.netPosition);
    expect(positions).toHaveLength(2);
  });

  it("shows only approved projection amounts; pending and rejected expenses have no balance effect", async () => {
    const fixture = await makeGroupFixture();
    const participants = [fixture.owner.id, fixture.member.id];
    const approved = await createGroupExpense(fixture, fixture.owner.id, participants, "20.00", "Approved");
    await approveAll(approved.expenseId, participants);
    const pending = await createGroupExpense(fixture, fixture.owner.id, participants, "10.00", "Pending");
    await decideGroupExpense(fixture.owner.id, pending.expenseId, "APPROVE", prisma);
    const rejected = await createGroupExpense(fixture, fixture.owner.id, participants, "6.00", "Rejected");
    await decideGroupExpense(fixture.owner.id, rejected.expenseId, "APPROVE", prisma);
    await decideGroupExpense(fixture.member.id, rejected.expenseId, "REJECT", prisma);

    const view = await getGroupBalanceDetails(fixture.member.id, fixture.group.id, prisma);
    expect(view.outstandingTotal).toBe("USD 10.00");
    expect(view.pairwise).toHaveLength(1);
    expect(view.pairwise[0]).toMatchObject({ debtorName: fixture.member.displayName, creditorName: fixture.owner.displayName, amount: "USD 10.00" });
  });

  it("nets opposing approved expenses once and treats zero balances as settled", async () => {
    const fixture = await makeGroupFixture();
    const participants = [fixture.owner.id, fixture.member.id];
    const first = await createGroupExpense(fixture, fixture.owner.id, participants, "20.00", "First direction");
    const second = await createGroupExpense(fixture, fixture.member.id, participants, "20.00", "Reverse direction");
    await approveAll(first.expenseId, participants);
    await approveAll(second.expenseId, participants);
    const view = await getGroupBalanceDetails(fixture.owner.id, fixture.group.id, prisma);
    expect(view.outstandingTotal).toBe("USD 0.00");
    expect(view.netPosition).toBe("USD 0.00 · settled");
    expect(view.pairwise).toHaveLength(0);
  });

  it("keeps currencies and group scopes separate and excludes direct scopes", async () => {
    const usd = await makeGroupFixture("USD");
    const cadGroup = await createGroup(usd.owner.id, "Canadian Group", "CAD", prisma);
    await addGroupMember(usd.owner.id, cadGroup.id, usd.member.username, prisma);
    const participants = [usd.owner.id, usd.member.id];
    const usdExpense = await createGroupExpense(usd, usd.owner.id, participants, "12.00", "USD expense");
    await approveAll(usdExpense.expenseId, participants);
    const cadExpense = await createExpense({
      kind: "GROUP", actorUserId: usd.owner.id, groupId: cadGroup.id, payerUserId: usd.owner.id,
      amount: "3.00", expenseDate: "2026-11-19", description: "CAD expense", splitMethod: "EQUAL",
      participants: [{ userId: usd.owner.id }, { userId: usd.member.id }],
    }, prisma);
    await approveAll(cadExpense.expenseId, participants);
    const direct = await prisma.balanceScope.create({ data: {
      kind: "DIRECT", directLowUserId: usd.owner.id < usd.member.id ? usd.owner.id : usd.member.id,
      directHighUserId: usd.owner.id < usd.member.id ? usd.member.id : usd.owner.id, currencyCode: "USD",
    } });
    await prisma.pairwiseObligation.create({ data: {
      balanceScopeId: direct.id, userLowId: usd.owner.id < usd.member.id ? usd.owner.id : usd.member.id,
      userHighId: usd.owner.id < usd.member.id ? usd.member.id : usd.owner.id, signedBalanceCents: BigInt(9900),
    } });

    const overview = await listBalanceSummariesForUser(usd.member.id, prisma);
    expect(overview.map((row) => [row.currencyCode, row.outstandingTotal]).sort()).toEqual([["CAD", "CAD 1.50"], ["USD", "USD 6.00"]]);
    expect(overview.find((row) => row.currencyCode === "USD")?.netPosition).toBe("USD 6.00 you owe");
  });

  it("denies nonmembers and limits former participants to their own historical pair rows", async () => {
    const fixture = await makeGroupFixture();
    const scope = await prisma.balanceScope.create({ data: { kind: "GROUP", groupId: fixture.group.id, currencyCode: "USD" } });
    const low = [fixture.member.id, fixture.owner.id].sort()[0];
    const high = [fixture.member.id, fixture.owner.id].sort()[1];
    await prisma.pairwiseObligation.create({ data: { balanceScopeId: scope.id, userLowId: low, userHighId: high, signedBalanceCents: BigInt(500) } });
    const otherLow = [fixture.owner.id, fixture.other.id].sort()[0];
    const otherHigh = [fixture.owner.id, fixture.other.id].sort()[1];
    await prisma.pairwiseObligation.create({ data: { balanceScopeId: scope.id, userLowId: otherLow, userHighId: otherHigh, signedBalanceCents: BigInt(300) } });

    await expect(getGroupBalanceDetails(fixture.outsider.id, fixture.group.id, prisma)).rejects.toThrow("not an active member");
    await deactivateGroupMember(fixture.owner.id, fixture.group.id, fixture.member.id, prisma);
    const activeMemberView = await getGroupBalanceDetails(fixture.owner.id, fixture.group.id, prisma);
    expect(activeMemberView.pairwise).toHaveLength(2);
    expect(activeMemberView.pairwise.some((row) => row.debtorName === fixture.member.displayName || row.creditorName === fixture.member.displayName)).toBe(true);
    const personal = await listFormerPersonalBalances(fixture.member.id, prisma);
    expect(personal).toHaveLength(1);
    expect(personal[0].pairwise).toHaveLength(1);
    expect(personal[0].pairwise[0].amount).toBe("USD 5.00");
    expect(personal[0]).not.toHaveProperty("outstandingTotal");
    await expect(listGroupExpenses(fixture.member.id, fixture.group.id, prisma)).rejects.toThrow("not an active member");
  });

  it("returns a zero settled view for an empty group without creating scopes or obligations", async () => {
    const fixture = await makeGroupFixture();
    const existingObligations = await prisma.pairwiseObligation.count();
    const view = await getGroupBalanceDetails(fixture.owner.id, fixture.group.id, prisma);
    expect(view).toMatchObject({ owedToMe: "USD 0.00", iOwe: "USD 0.00", netPosition: "USD 0.00 · settled", outstandingTotal: "USD 0.00", pairwise: [] });
    expect(await prisma.balanceScope.count({ where: { groupId: fixture.group.id } })).toBe(0);
    expect(await prisma.pairwiseObligation.count()).toBe(existingObligations);
  });
});
