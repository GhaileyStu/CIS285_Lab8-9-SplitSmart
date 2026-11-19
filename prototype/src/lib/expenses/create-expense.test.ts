import Database from "better-sqlite3";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  createExpense,
  ExpenseCreationError,
  type CreateDirectExpenseInput,
  type CreateGroupExpenseInput,
} from "./create-expense";

let prisma: PrismaClient;
let testDirectory: string;
let counter = 0;

function nextTag() {
  counter += 1;
  return `case${counter}`;
}

async function createUser(id: string) {
  return prisma.user.create({
    data: {
      id,
      username: id,
      email: `${id}@example.test`,
      passwordHash: "test-only-hash",
      displayName: id,
    },
  });
}

async function createGroupFixture() {
  const tag = nextTag();
  const actorId = `${tag}-actor`;
  const payerId = `${tag}-payer`;
  const participantId = `${tag}-participant`;
  const anotherParticipantId = `${tag}-participant2`;
  await Promise.all([
    createUser(actorId),
    createUser(payerId),
    createUser(participantId),
    createUser(anotherParticipantId),
  ]);
  const group = await prisma.group.create({
    data: { ownerId: actorId, name: `${tag}-group`, currencyCode: "USD" },
  });
  await prisma.groupMembership.createMany({
    data: [actorId, payerId, participantId, anotherParticipantId].map((userId, index) => ({
      groupId: group.id,
      userId,
      role: index === 0 ? "OWNER" : "MEMBER",
      status: "ACTIVE",
    })),
  });
  return { actorId, payerId, participantId, anotherParticipantId, group };
}

function groupInput(
  fixture: Awaited<ReturnType<typeof createGroupFixture>>,
  overrides: Partial<CreateGroupExpenseInput> = {},
): CreateGroupExpenseInput {
  return {
    kind: "GROUP",
    actorUserId: fixture.actorId,
    payerUserId: fixture.payerId,
    groupId: fixture.group.id,
    amount: "60.00",
    expenseDate: new Date("2026-11-19T12:00:00.000Z"),
    description: "Shared meal",
    splitMethod: "EQUAL",
    participants: [
      { userId: fixture.actorId },
      { userId: fixture.participantId },
      { userId: fixture.anotherParticipantId },
    ],
    ...overrides,
  };
}

function directInput(
  payerUserId: string,
  participantUserId: string,
  overrides: Partial<CreateDirectExpenseInput> = {},
): CreateDirectExpenseInput {
  return {
    kind: "DIRECT",
    actorUserId: participantUserId,
    payerUserId,
    currencyCode: "USD",
    amount: "10.00",
    expenseDate: new Date("2026-11-19T12:00:00.000Z"),
    description: "Direct share",
    splitMethod: "EQUAL",
    participants: [{ userId: participantUserId }],
    ...overrides,
  };
}

beforeAll(async () => {
  testDirectory = mkdtempSync(join(tmpdir(), "splitsmart-phase5a-"));
  const dbPath = join(testDirectory, "phase5a-test.db");
  const migrationPath = resolve(
    process.cwd(),
    "prisma/migrations/20261119000000_init/migration.sql",
  );
  const sqlite = new Database(dbPath);
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(readFileSync(migrationPath, "utf8"));
  sqlite.close();
  prisma = new PrismaClient({ datasources: { db: { url: `file:${dbPath}` } } });
  await prisma.$connect();
});

afterAll(async () => {
  await prisma?.$disconnect();
  if (testDirectory) {
    rmSync(testDirectory, { recursive: true, force: true });
  }
});

describe("expense creation service", () => {
  it("creates a valid group expense pending approval with ordered revision shares", async () => {
    const fixture = await createGroupFixture();
    const result = await createExpense(groupInput(fixture), prisma);

    expect(result.status).toBe("PENDING");
    expect(result.currencyCode).toBe("USD");
    expect(result.amountCents).toBe("6000");
    expect(result.shares.map((share) => share.participantUserId)).toEqual([
      fixture.actorId,
      fixture.participantId,
      fixture.anotherParticipantId,
    ]);
    expect(result.shares.map((share) => share.shareCents)).toEqual(["2000", "2000", "2000"]);

    const expense = await prisma.expense.findUniqueOrThrow({
      where: { id: result.expenseId },
      include: { revisions: { include: { shares: true } } },
    });
    expect(expense.status).toBe("PENDING");
    expect(expense.revisions[0].revisionNumber).toBe(1);
    expect(expense.revisions[0].amountCents).toBe(BigInt(6000));
    expect(expense.revisions[0].shares.map((share) => share.allocationOrder)).toEqual([0, 1, 2]);
    expect(expense.revisions[0].shares.every((share) => share.percentageBasisPoints === null)).toBe(true);
    expect(await prisma.pairwiseObligation.count()).toBe(0);
  });

  it("rejects an inactive group payer or participant without creating an expense", async () => {
    const fixture = await createGroupFixture();
    await prisma.groupMembership.update({
      where: { groupId_userId: { groupId: fixture.group.id, userId: fixture.participantId } },
      data: { status: "INACTIVE" },
    });
    const before = await prisma.expense.count();

    await expect(createExpense(groupInput(fixture), prisma)).rejects.toMatchObject({
      code: "GROUP_MEMBERSHIP_REQUIRED",
    });
    expect(await prisma.expense.count()).toBe(before);

    await prisma.groupMembership.update({
      where: { groupId_userId: { groupId: fixture.group.id, userId: fixture.participantId } },
      data: { status: "ACTIVE" },
    });
    await prisma.groupMembership.update({
      where: { groupId_userId: { groupId: fixture.group.id, userId: fixture.payerId } },
      data: { status: "INACTIVE" },
    });
    await expect(createExpense(groupInput(fixture), prisma)).rejects.toMatchObject({
      code: "GROUP_MEMBERSHIP_REQUIRED",
    });
  });

  it("rejects nonexistent group payers and participants", async () => {
    const fixture = await createGroupFixture();
    await expect(
      createExpense(groupInput(fixture, { payerUserId: `${fixture.payerId}-missing` }), prisma),
    ).rejects.toMatchObject({ code: "PAYER_NOT_FOUND" });
    await expect(
      createExpense(
        groupInput(fixture, { participants: [{ userId: `${fixture.participantId}-missing` }] }),
        prisma,
      ),
    ).rejects.toMatchObject({ code: "PARTICIPANT_NOT_FOUND" });
  });

  it("creates a direct expense approved immediately and updates its currency-specific balance", async () => {
    const tag = nextTag();
    const lowUserId = `${tag}-a`;
    const highUserId = `${tag}-z`;
    await Promise.all([createUser(lowUserId), createUser(highUserId)]);
    const result = await createExpense(directInput(highUserId, lowUserId), prisma);

    expect(result.status).toBe("APPROVED");
    expect(result.currencyCode).toBe("USD");
    const expense = await prisma.expense.findUniqueOrThrow({
      where: { id: result.expenseId },
      include: { revisions: { include: { approvals: true, shares: true } } },
    });
    expect(expense.status).toBe("APPROVED");
    expect(expense.revisions[0].approvals).toHaveLength(0);

    const usdScope = await prisma.balanceScope.findFirstOrThrow({
      where: { kind: "DIRECT", directLowUserId: lowUserId, directHighUserId: highUserId, currencyCode: "USD" },
    });
    const usdBalance = await prisma.pairwiseObligation.findUniqueOrThrow({
      where: {
        balanceScopeId_userLowId_userHighId: {
          balanceScopeId: usdScope.id,
          userLowId: lowUserId,
          userHighId: highUserId,
        },
      },
    });
    expect(usdBalance.signedBalanceCents).toBe(BigInt(1000));

    const cadResult = await createExpense(
      directInput(highUserId, lowUserId, { currencyCode: "CAD", amount: "5.00", description: "CAD expense" }),
      prisma,
    );
    expect(cadResult.status).toBe("APPROVED");
    const cadScope = await prisma.balanceScope.findFirstOrThrow({
      where: { kind: "DIRECT", directLowUserId: lowUserId, directHighUserId: highUserId, currencyCode: "CAD" },
    });
    expect(cadScope.id).not.toBe(usdScope.id);
    expect(
      await prisma.pairwiseObligation.findUniqueOrThrow({
        where: {
          balanceScopeId_userLowId_userHighId: {
            balanceScopeId: cadScope.id,
            userLowId: lowUserId,
            userHighId: highUserId,
          },
        },
        select: { signedBalanceCents: true },
      }),
    ).toEqual({ signedBalanceCents: BigInt(500) });
  });

  it("rejects a direct creator who is neither payer nor participant", async () => {
    const tag = nextTag();
    const payerId = `${tag}-a`;
    const participantId = `${tag}-b`;
    const actorId = `${tag}-c`;
    await Promise.all([createUser(payerId), createUser(participantId), createUser(actorId)]);
    const before = await prisma.expense.count();

    await expect(
      createExpense(
        directInput(payerId, participantId, { actorUserId: actorId }),
        prisma,
      ),
    ).rejects.toMatchObject({ code: "DIRECT_ACTOR_NOT_INVOLVED" });
    expect(await prisma.expense.count()).toBe(before);
  });

  it("allows the payer to participate without creating a self-obligation", async () => {
    const tag = nextTag();
    const lowUserId = `${tag}-a`;
    const highUserId = `${tag}-z`;
    await Promise.all([createUser(lowUserId), createUser(highUserId)]);
    const result = await createExpense(
      directInput(highUserId, lowUserId, {
        amount: "10.00",
        actorUserId: highUserId,
        participants: [{ userId: highUserId }, { userId: lowUserId }],
      }),
      prisma,
    );

    expect(result.shares.map((share) => share.shareCents)).toEqual(["500", "500"]);
    const scope = await prisma.balanceScope.findFirstOrThrow({
      where: { kind: "DIRECT", directLowUserId: lowUserId, directHighUserId: highUserId, currencyCode: "USD" },
    });
    const obligations = await prisma.pairwiseObligation.findMany({
      where: { balanceScopeId: scope.id },
    });
    expect(obligations).toHaveLength(1);
    expect(obligations[0].signedBalanceCents).toBe(BigInt(500));
  });

  it("rejects a direct expense whose payer and participants involve more than two users", async () => {
    const tag = nextTag();
    const ids = [`${tag}-a`, `${tag}-b`, `${tag}-c`];
    await Promise.all(ids.map(createUser));
    const before = await prisma.expense.count();

    await expect(
      createExpense(
        directInput(ids[0], ids[1], {
          participants: [{ userId: ids[1] }, { userId: ids[2] }],
        }),
        prisma,
      ),
    ).rejects.toMatchObject({ code: "DIRECT_PARTICIPANTS_INVALID" });
    expect(await prisma.expense.count()).toBe(before);
  });

  it("rejects a missing direct participant", async () => {
    const tag = nextTag();
    const payerId = `${tag}-a`;
    const participantId = `${tag}-z`;
    await createUser(payerId);
    await expect(
      createExpense(directInput(payerId, participantId, { actorUserId: payerId }), prisma),
    ).rejects.toMatchObject({ code: "PARTICIPANT_NOT_FOUND" });
  });

  it("rolls back all expense rows when a direct balance update would overflow", async () => {
    const tag = nextTag();
    const lowUserId = `${tag}-a`;
    const highUserId = `${tag}-z`;
    await Promise.all([createUser(lowUserId), createUser(highUserId)]);
    const scope = await prisma.balanceScope.create({
      data: {
        kind: "DIRECT",
        directLowUserId: lowUserId,
        directHighUserId: highUserId,
        currencyCode: "USD",
      },
    });
    await prisma.pairwiseObligation.create({
      data: {
        balanceScopeId: scope.id,
        userLowId: lowUserId,
        userHighId: highUserId,
        signedBalanceCents: BigInt("9223372036854775807"),
      },
    });
    const before = {
      expenses: await prisma.expense.count(),
      revisions: await prisma.expenseRevision.count(),
      shares: await prisma.expenseShare.count(),
    };

    await expect(
      createExpense(directInput(highUserId, lowUserId, { description: "Overflow rollback" }), prisma),
    ).rejects.toMatchObject({ code: "BALANCE_OVERFLOW" });
    expect(await prisma.expense.count()).toBe(before.expenses);
    expect(await prisma.expenseRevision.count()).toBe(before.revisions);
    expect(await prisma.expenseShare.count()).toBe(before.shares);
  });

  it("rejects invalid date, description, and currency before writes", async () => {
    const tag = nextTag();
    const lowUserId = `${tag}-a`;
    const highUserId = `${tag}-z`;
    await Promise.all([createUser(lowUserId), createUser(highUserId)]);
    const before = await prisma.expense.count();

    await expect(
      createExpense(directInput(highUserId, lowUserId, { expenseDate: "not-a-date" }), prisma),
    ).rejects.toBeInstanceOf(ExpenseCreationError);
    await expect(
      createExpense(directInput(highUserId, lowUserId, { description: " " }), prisma),
    ).rejects.toBeInstanceOf(ExpenseCreationError);
    await expect(
      createExpense(directInput(highUserId, lowUserId, { currencyCode: "usd" }), prisma),
    ).rejects.toBeInstanceOf(ExpenseCreationError);
    expect(await prisma.expense.count()).toBe(before);
  });
});
