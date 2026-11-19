import Database from "better-sqlite3";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { addGroupMember, createGroup, deactivateGroupMember } from "../../../src/features/phase5b/groups/service";
import {
  listDirectBalancesForUser,
  listDirectPaymentsForUser,
  listFormerGroupPayments,
  listGroupPayments,
  parsePaymentAmount,
  PaymentError,
  recordPayment,
} from "../../../src/features/phase5b/expenses/payments";

let prisma: PrismaClient;
let testDirectory: string;
let sequence = 0;

function tag() { sequence += 1; return `paymenttest${sequence}`; }
function idempotencyKey() { return `${tag()}-stable-key-0000000000`; }

async function makeUser() {
  const username = tag();
  return prisma.user.create({ data: { username, email: `${username}@example.test`, displayName: username, passwordHash: "test-only-hash" } });
}

async function makeFixture() {
  const owner = await makeUser();
  const member = await makeUser();
  const outsider = await makeUser();
  const group = await createGroup(owner.id, "Payment Test Group", "USD", prisma);
  await addGroupMember(owner.id, group.id, member.username, prisma);
  const groupScope = await prisma.balanceScope.create({ data: { kind: "GROUP", groupId: group.id, currencyCode: "USD" } });
  const directScope = await makeDirectScope(owner.id, member.id, "USD");
  return { owner, member, outsider, group, groupScope, directScope };
}

async function makeDirectScope(userA: string, userB: string, currencyCode: string) {
  const low = userA < userB ? userA : userB;
  const high = userA < userB ? userB : userA;
  return prisma.balanceScope.create({ data: { kind: "DIRECT", directLowUserId: low, directHighUserId: high, currencyCode } });
}

async function setObligation(scopeId: string, userA: string, userB: string, signedBalanceCents: bigint) {
  const userLowId = userA < userB ? userA : userB;
  const userHighId = userA < userB ? userB : userA;
  return prisma.pairwiseObligation.create({ data: { balanceScopeId: scopeId, userLowId, userHighId, signedBalanceCents } });
}

function obligationForDebtor(debtorUserId: string, creditorUserId: string, cents: bigint) {
  return debtorUserId < creditorUserId ? cents : -cents;
}

function input(scopeId: string, groupId: string | undefined, creditorUserId: string, amount: string, key = idempotencyKey()) {
  return { scopeId, groupId, creditorUserId, amount, paymentDate: "2026-11-19", idempotencyKey: key };
}

beforeAll(async () => {
  testDirectory = mkdtempSync(join(tmpdir(), "splitsmart-phase5e-"));
  const dbPath = join(testDirectory, "phase5e-test.db");
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

describe("payment amounts and settlement", () => {
  it("parses positive decimal amounts exactly into cents", () => {
    expect(parsePaymentAmount("19")).toBe(BigInt(1900));
    expect(parsePaymentAmount("19.2")).toBe(BigInt(1920));
    expect(parsePaymentAmount("0.01")).toBe(BigInt(1));
    expect(parsePaymentAmount("92233720368547758.07")).toBe(BigInt("9223372036854775807"));
  });

  it.each(["0", "0.00", "-1.00", ".50", "1.", "1.001", "1e2", "abc", "92233720368547758.08"]) (
    "rejects invalid amount %s", (value) => {
      expect(() => parsePaymentAmount(value)).toThrow(PaymentError);
    },
  );

  it("records a partial and then full low-ID debtor payment and applies each trigger delta exactly once", async () => {
    const fixture = await makeFixture();
    const low = fixture.owner.id < fixture.member.id ? fixture.owner : fixture.member;
    const high = low.id === fixture.owner.id ? fixture.member : fixture.owner;
    const row = await setObligation(fixture.groupScope.id, low.id, high.id, BigInt(10000));

    const partial = await recordPayment(low.id, input(fixture.groupScope.id, fixture.group.id, high.id, "25.50"), prisma);
    expect(partial.payment).toMatchObject({ debtorUserId: low.id, creditorUserId: high.id, amountCents: "2550", repeated: false });
    expect((await prisma.pairwiseObligation.findUniqueOrThrow({ where: { id: row.id } })).signedBalanceCents).toBe(BigInt(7450));

    const full = await recordPayment(low.id, input(fixture.groupScope.id, fixture.group.id, high.id, "74.50"), prisma);
    expect(full.payment.repeated).toBe(false);
    expect((await prisma.pairwiseObligation.findUniqueOrThrow({ where: { id: row.id } })).signedBalanceCents).toBe(BigInt(0));
    expect(await prisma.payment.count({ where: { balanceScopeId: fixture.groupScope.id } })).toBe(2);
  });

  it("records a high-ID debtor payment by adding toward zero", async () => {
    const fixture = await makeFixture();
    const low = fixture.owner.id < fixture.member.id ? fixture.owner : fixture.member;
    const high = low.id === fixture.owner.id ? fixture.member : fixture.owner;
    const row = await setObligation(fixture.directScope.id, low.id, high.id, -BigInt(9000));
    await recordPayment(high.id, input(fixture.directScope.id, undefined, low.id, "20.00"), prisma);
    expect((await prisma.pairwiseObligation.findUniqueOrThrow({ where: { id: row.id } })).signedBalanceCents).toBe(-BigInt(7000));
  });

  it("rejects overpayment, settled pairs, wrong group, wrong pair, creditor, and unrelated actor", async () => {
    const fixture = await makeFixture();
    const low = fixture.owner.id < fixture.member.id ? fixture.owner : fixture.member;
    const high = low.id === fixture.owner.id ? fixture.member : fixture.owner;
    const row = await setObligation(fixture.groupScope.id, low.id, high.id, BigInt(5000));
    await expect(recordPayment(low.id, input(fixture.groupScope.id, fixture.group.id, high.id, "50.01"), prisma)).rejects.toThrow("cannot exceed");
    await expect(recordPayment(low.id, input(fixture.groupScope.id, "different-group", high.id, "1.00"), prisma)).rejects.toThrow("selected group");
    await expect(recordPayment(high.id, input(fixture.groupScope.id, fixture.group.id, low.id, "1.00"), prisma)).rejects.toThrow("do not currently owe");
    await expect(recordPayment(fixture.outsider.id, input(fixture.groupScope.id, fixture.group.id, high.id, "1.00"), prisma)).rejects.toThrow("not authorized");
    await expect(recordPayment(low.id, input(fixture.groupScope.id, fixture.group.id, fixture.outsider.id, "1.00"), prisma)).rejects.toThrow("do not currently owe");
    await expect(prisma.payment.create({ data: {
      balanceScopeId: fixture.groupScope.id,
      debtorUserId: low.id,
      creditorUserId: high.id,
      recordedByUserId: low.id,
      amountCents: BigInt(5001),
      idempotencyKey: idempotencyKey(),
      requestHash: "trigger-overpayment-test",
      paymentDate: new Date("2026-11-19T00:00:00.000Z"),
    } })).rejects.toThrow();
    expect((await prisma.pairwiseObligation.findUniqueOrThrow({ where: { id: row.id } })).signedBalanceCents).toBe(BigInt(5000));
    expect(await prisma.payment.count({ where: { balanceScopeId: fixture.groupScope.id } })).toBe(0);
  });

  it("rejects a direct payment submitted with a group ID and wrong direct scope pair", async () => {
    const fixture = await makeFixture();
    const row = await setObligation(fixture.directScope.id, fixture.owner.id, fixture.member.id, obligationForDebtor(fixture.owner.id, fixture.member.id, BigInt(1000)));
    await expect(recordPayment(fixture.owner.id, input(fixture.directScope.id, fixture.group.id, fixture.member.id, "1.00"), prisma)).rejects.toThrow("direct payment cannot be submitted as a group");
    await expect(recordPayment(fixture.owner.id, input(fixture.directScope.id, undefined, fixture.outsider.id, "1.00"), prisma)).rejects.toThrow("direct obligation");
    expect((await prisma.pairwiseObligation.findUniqueOrThrow({ where: { id: row.id } })).signedBalanceCents).toBe(obligationForDebtor(fixture.owner.id, fixture.member.id, BigInt(1000)));
  });

  it("keeps group, direct, and currency projections separate", async () => {
    const fixture = await makeFixture();
    const groupRow = await setObligation(fixture.groupScope.id, fixture.owner.id, fixture.member.id, obligationForDebtor(fixture.owner.id, fixture.member.id, BigInt(8000)));
    const directRow = await setObligation(fixture.directScope.id, fixture.owner.id, fixture.member.id, obligationForDebtor(fixture.owner.id, fixture.member.id, BigInt(6000)));
    const cadScope = await makeDirectScope(fixture.owner.id, fixture.member.id, "CAD");
    const cadRow = await setObligation(cadScope.id, fixture.owner.id, fixture.member.id, obligationForDebtor(fixture.owner.id, fixture.member.id, BigInt(4000)));

    await recordPayment(fixture.owner.id, input(fixture.groupScope.id, fixture.group.id, fixture.member.id, "10.00"), prisma);
    await recordPayment(fixture.owner.id, input(fixture.directScope.id, undefined, fixture.member.id, "15.00"), prisma);
    const directBalances = await listDirectBalancesForUser(fixture.owner.id, prisma);
    expect(directBalances.find((balance) => balance.currencyCode === "USD")?.amount).toBe("USD 45.00");
    expect(directBalances.find((balance) => balance.currencyCode === "CAD")?.amount).toBe("CAD 40.00");
    expect((await prisma.pairwiseObligation.findUniqueOrThrow({ where: { id: groupRow.id } })).signedBalanceCents).toBe(obligationForDebtor(fixture.owner.id, fixture.member.id, BigInt(7000)));
    expect((await prisma.pairwiseObligation.findUniqueOrThrow({ where: { id: directRow.id } })).signedBalanceCents).toBe(obligationForDebtor(fixture.owner.id, fixture.member.id, BigInt(4500)));
    expect((await prisma.pairwiseObligation.findUniqueOrThrow({ where: { id: cadRow.id } })).signedBalanceCents).toBe(obligationForDebtor(fixture.owner.id, fixture.member.id, BigInt(4000)));
  });

  it("returns the original payment for same-key retries and rejects different request hashes", async () => {
    const fixture = await makeFixture();
    const row = await setObligation(fixture.groupScope.id, fixture.owner.id, fixture.member.id, obligationForDebtor(fixture.owner.id, fixture.member.id, BigInt(10000)));
    const key = idempotencyKey();
    const request = input(fixture.groupScope.id, fixture.group.id, fixture.member.id, "12.00", key);
    const first = await recordPayment(fixture.owner.id, request, prisma);
    const retry = await recordPayment(fixture.owner.id, request, prisma);
    expect(retry.payment.id).toBe(first.payment.id);
    expect(retry.payment.repeated).toBe(true);
    await expect(recordPayment(fixture.owner.id, { ...request, amount: "13.00" }, prisma)).rejects.toThrow("different request");
    expect(await prisma.payment.count({ where: { balanceScopeId: fixture.groupScope.id } })).toBe(1);
    expect((await prisma.pairwiseObligation.findUniqueOrThrow({ where: { id: row.id } })).signedBalanceCents).toBe(obligationForDebtor(fixture.owner.id, fixture.member.id, BigInt(8800)));
  });

  it("handles concurrent duplicate requests without duplicate ledger rows or projection effects", async () => {
    const fixture = await makeFixture();
    const row = await setObligation(fixture.groupScope.id, fixture.owner.id, fixture.member.id, obligationForDebtor(fixture.owner.id, fixture.member.id, BigInt(5000)));
    const request = input(fixture.groupScope.id, fixture.group.id, fixture.member.id, "10.00");
    const results = await Promise.all([
      recordPayment(fixture.owner.id, request, prisma),
      recordPayment(fixture.owner.id, request, prisma),
    ]);
    expect(new Set(results.map((result) => result.payment.id)).size).toBe(1);
    expect(await prisma.payment.count({ where: { balanceScopeId: fixture.groupScope.id } })).toBe(1);
    expect((await prisma.pairwiseObligation.findUniqueOrThrow({ where: { id: row.id } })).signedBalanceCents).toBe(obligationForDebtor(fixture.owner.id, fixture.member.id, BigInt(4000)));
  });

  it("cannot overpay with concurrent distinct idempotency keys", async () => {
    const fixture = await makeFixture();
    const row = await setObligation(fixture.groupScope.id, fixture.owner.id, fixture.member.id, obligationForDebtor(fixture.owner.id, fixture.member.id, BigInt(1000)));
    const requests = ["7.00", "7.00"].map((amount) => input(fixture.groupScope.id, fixture.group.id, fixture.member.id, amount));
    const results = await Promise.allSettled(requests.map((request) => recordPayment(fixture.owner.id, request, prisma)));
    const finalRow = await prisma.pairwiseObligation.findUniqueOrThrow({ where: { id: row.id } });
    expect(finalRow.signedBalanceCents).toBe(obligationForDebtor(fixture.owner.id, fixture.member.id, BigInt(300)));
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.payment.count({ where: { balanceScopeId: fixture.groupScope.id } })).toBe(1);
  });

  it("rolls back the Payment row and trigger projection if the enclosing transaction fails", async () => {
    const fixture = await makeFixture();
    const row = await setObligation(fixture.groupScope.id, fixture.owner.id, fixture.member.id, obligationForDebtor(fixture.owner.id, fixture.member.id, BigInt(3000)));
    const beforeCount = await prisma.payment.count();
    await expect(prisma.$transaction(async (tx) => {
      await tx.payment.create({ data: {
        balanceScopeId: fixture.groupScope.id,
        debtorUserId: fixture.owner.id,
        creditorUserId: fixture.member.id,
        recordedByUserId: fixture.owner.id,
        amountCents: BigInt(500),
        idempotencyKey: idempotencyKey(),
        requestHash: "rollback-test-hash",
        paymentDate: new Date("2026-11-19T00:00:00.000Z"),
      } });
      throw new Error("forced rollback after trigger");
    })).rejects.toThrow("forced rollback after trigger");
    expect(await prisma.payment.count()).toBe(beforeCount);
    expect((await prisma.pairwiseObligation.findUniqueOrThrow({ where: { id: row.id } })).signedBalanceCents).toBe(obligationForDebtor(fixture.owner.id, fixture.member.id, BigInt(3000)));
  });

  it("keeps payment rows immutable and exposes authorized payment histories", async () => {
    const fixture = await makeFixture();
    await setObligation(fixture.groupScope.id, fixture.owner.id, fixture.member.id, obligationForDebtor(fixture.owner.id, fixture.member.id, BigInt(4000)));
    await recordPayment(fixture.owner.id, input(fixture.groupScope.id, fixture.group.id, fixture.member.id, "5.00"), prisma);
    expect(await listGroupPayments(fixture.member.id, fixture.group.id, prisma)).toHaveLength(1);
    await expect(listGroupPayments(fixture.outsider.id, fixture.group.id, prisma)).rejects.toThrow("not an active member");
    await expect(prisma.payment.updateMany({ where: { balanceScopeId: fixture.groupScope.id }, data: { paymentDate: new Date() } })).rejects.toThrow();
    await expect(prisma.payment.deleteMany({ where: { balanceScopeId: fixture.groupScope.id } })).rejects.toThrow();
    expect(await listDirectPaymentsForUser(fixture.outsider.id, prisma)).toHaveLength(0);
  });

  it("limits former-member settlement and history to that member's own historical group pair", async () => {
    const fixture = await makeFixture();
    const row = await setObligation(fixture.groupScope.id, fixture.member.id, fixture.owner.id, obligationForDebtor(fixture.member.id, fixture.owner.id, BigInt(5000)));
    await deactivateGroupMember(fixture.owner.id, fixture.group.id, fixture.member.id, prisma);
    const payment = await recordPayment(fixture.member.id, input(fixture.groupScope.id, fixture.group.id, fixture.owner.id, "10.00"), prisma);
    expect(payment.payment.debtorUserId).toBe(fixture.member.id);
    expect(await listFormerGroupPayments(fixture.member.id, prisma)).toHaveLength(1);
    await expect(listGroupPayments(fixture.member.id, fixture.group.id, prisma)).rejects.toThrow("not an active member");
    expect((await prisma.pairwiseObligation.findUniqueOrThrow({ where: { id: row.id } })).signedBalanceCents).toBe(obligationForDebtor(fixture.member.id, fixture.owner.id, BigInt(4000)));
  });
});
