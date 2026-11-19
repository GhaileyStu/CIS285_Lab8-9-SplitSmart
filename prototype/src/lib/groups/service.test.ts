import Database from "better-sqlite3";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createExpense } from "../expenses/create-expense";
import { listGroupExpenses } from "../expenses/history";
import { authenticateAccount, registerAccount } from "../auth/accounts";
import {
  addGroupMember,
  createGroup,
  deactivateGroupMember,
  listGroupsForUser,
  updateGroup,
} from "./service";

let prisma: PrismaClient;
let testDirectory: string;
let sequence = 0;

function tag() { sequence += 1; return `grouptest${sequence}`; }

async function makeUser(username: string) {
  return prisma.user.create({ data: {
    username,
    email: `${username}@example.test`,
    displayName: username.replace(/^[a-z]/, (value) => value.toUpperCase()),
    passwordHash: "test-only-hash",
  } });
}

beforeAll(async () => {
  testDirectory = mkdtempSync(join(tmpdir(), "splitsmart-phase5b-"));
  const dbPath = join(testDirectory, "phase5b-test.db");
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

describe("group service and expense history", () => {
  it("registers normalized accounts, authenticates passwords, and throttles repeated failures", async () => {
    const account = await registerAccount({
      username: "  Test_Roomie ", email: " TEST_ROOMIE@example.test ",
      displayName: " Test Roomie ", password: "a-safe-test-password",
    }, prisma);
    expect(account).toMatchObject({ username: "test_roomie", email: "test_roomie@example.test", displayName: "Test Roomie" });
    expect((await authenticateAccount("TEST_ROOMIE", "a-safe-test-password", prisma)).id).toBe(account.id);
    await expect(authenticateAccount("test_roomie", "wrong-password", prisma)).rejects.toThrow("Username or password is incorrect");
    const bucket = await prisma.loginThrottleBucket.findFirst({ where: { kind: "account" } });
    expect(bucket?.failureCount).toBe(1);
    await expect(authenticateAccount("missing_user", "wrong-password", prisma)).rejects.toThrow("Username or password is incorrect");
    await expect(registerAccount({
      username: "TEST_ROOMIE", email: "another@example.test", displayName: "Duplicate", password: "a-safe-test-password",
    }, prisma)).rejects.toThrow("already registered");
  });

  it("creates a group with its owner membership and membership period", async () => {
    const owner = await makeUser(tag());
    const group = await createGroup(owner.id, "Maple House", "usd", prisma);
    const membership = await prisma.groupMembership.findUnique({
      where: { groupId_userId: { groupId: group.id, userId: owner.id } },
      include: { periods: true },
    });
    expect(group.currencyCode).toBe("USD");
    expect(membership?.role).toBe("OWNER");
    expect(membership?.status).toBe("ACTIVE");
    expect(membership?.periods).toHaveLength(1);
  });

  it("allows the owner to add and deactivate registered members", async () => {
    const owner = await makeUser(tag());
    const member = await makeUser(tag());
    const group = await createGroup(owner.id, "Trip Crew", "USD", prisma);
    await addGroupMember(owner.id, group.id, member.username.toUpperCase(), prisma);
    expect((await listGroupsForUser(member.id, prisma)).map((item) => item.id)).toContain(group.id);
    await deactivateGroupMember(owner.id, group.id, member.id, prisma);
    expect(await listGroupsForUser(member.id, prisma)).toHaveLength(0);
    const history = await prisma.membershipPeriod.findMany({ where: { membership: { groupId: group.id, userId: member.id } } });
    expect(history).toHaveLength(1);
    expect(history[0].leftAt).toBeInstanceOf(Date);
  });

  it("rejects a non-owner, an unknown username, duplicate active members, and removing the owner", async () => {
    const owner = await makeUser(tag());
    const other = await makeUser(tag());
    const member = await makeUser(tag());
    const group = await createGroup(owner.id, "Dinner Group", "USD", prisma);
    await addGroupMember(owner.id, group.id, member.username, prisma);
    await expect(addGroupMember(other.id, group.id, member.username, prisma)).rejects.toThrow("Only the group owner");
    await expect(addGroupMember(owner.id, group.id, "missing-account", prisma)).rejects.toThrow("No registered account");
    await expect(addGroupMember(owner.id, group.id, member.username, prisma)).rejects.toThrow("already an active member");
    await expect(deactivateGroupMember(owner.id, group.id, owner.id, prisma)).rejects.toThrow("owner cannot be removed");
  });

  it("lets the owner edit group settings and locks currency after an expense exists", async () => {
    const owner = await makeUser(tag());
    const member = await makeUser(tag());
    const group = await createGroup(owner.id, "Starting Name", "USD", prisma);
    await addGroupMember(owner.id, group.id, member.username, prisma);
    const changed = await updateGroup(owner.id, group.id, "New Name", "CAD", prisma);
    expect(changed).toMatchObject({ name: "New Name", currencyCode: "CAD" });
    await expect(updateGroup(member.id, group.id, "Intrusion", "CAD", prisma)).rejects.toThrow("Only the group owner");
    await createExpense({
      kind: "GROUP", actorUserId: owner.id, groupId: group.id, payerUserId: owner.id,
      amount: "2.00", expenseDate: "2026-11-19", description: "Coffee", splitMethod: "EQUAL",
      participants: [{ userId: owner.id }, { userId: member.id }],
    }, prisma);
    await expect(updateGroup(owner.id, group.id, "Renamed Again", "USD", prisma)).rejects.toThrow("currency is locked");
    const renamed = await updateGroup(owner.id, group.id, "Renamed Again", "CAD", prisma);
    expect(renamed.name).toBe("Renamed Again");
  });

  it("persists group expenses through Phase 5A and returns their saved participant shares", async () => {
    const owner = await makeUser(tag());
    const member = await makeUser(tag());
    const group = await createGroup(owner.id, "Weekend Away", "USD", prisma);
    await addGroupMember(owner.id, group.id, member.username, prisma);
    const created = await createExpense({
      kind: "GROUP",
      actorUserId: owner.id,
      groupId: group.id,
      payerUserId: owner.id,
      amount: "25.00",
      expenseDate: "2026-11-19",
      description: "Groceries",
      splitMethod: "EQUAL",
      participants: [{ userId: owner.id }, { userId: member.id }],
    }, prisma);
    const result = await listGroupExpenses(owner.id, group.id, prisma);
    expect(created.status).toBe("PENDING");
    expect(result.expenses).toHaveLength(1);
    expect(result.expenses[0].revision.description).toBe("Groceries");
    expect(result.expenses[0].revision.shares.map((share) => share.shareCents)).toEqual([BigInt(1250), BigInt(1250)]);
  });

  it("does not show group history to a nonmember", async () => {
    const owner = await makeUser(tag());
    const stranger = await makeUser(tag());
    const group = await createGroup(owner.id, "Private House", "USD", prisma);
    await expect(listGroupExpenses(stranger.id, group.id, prisma)).rejects.toThrow("not an active member");
  });
});
