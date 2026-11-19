import Database from "better-sqlite3";
import { PrismaClient } from "@prisma/client";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createExpense, type CreateDirectExpenseInput } from "../../../src/features/phase5a/expenses/create-expense";
import { decideGroupExpense } from "../../../src/features/phase5b/expenses/approvals";
import { recordPayment } from "../../../src/features/phase5b/expenses/payments";
import { getActivityReport, listReportGroups, parseReportRange, ReportInputError } from "../../../src/features/phase5b/expenses/reports";
import { addGroupMember, createGroup, deactivateGroupMember } from "../../../src/features/phase5b/groups/service";
import { ReportDashboard } from "../../../src/features/phase5b/ui/report-dashboard";

let prisma: PrismaClient;
let directory: string;
let sequence = 0;
const day = "2024-02-29";
const dates = { start: day, end: day };
const direct = { kind: "DIRECT" } as const;

beforeAll(async () => {
  directory = mkdtempSync(join(tmpdir(), "splitsmart-reports-"));
  const file = join(directory, "reports.db");
  const sqlite = new Database(file);
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(readFileSync("prisma/migrations/20261119000000_init/migration.sql", "utf8"));
  sqlite.close();
  prisma = new PrismaClient({ datasources: { db: { url: `file:${file}` } } });
  await prisma.$connect();
});

afterAll(async () => {
  await prisma?.$disconnect();
  if (directory) rmSync(directory, { recursive: true, force: true });
});

function makeUser() {
  const username = `reportuser${++sequence}`;
  return prisma.user.create({ data: { username, displayName: username, email: `${username}@example.test`, passwordHash: "test-only" } });
}

async function fixture() {
  const owner = await makeUser();
  const member = await makeUser();
  const outsider = await makeUser();
  const group = await createGroup(owner.id, "Reports Group", "USD", prisma);
  await addGroupMember(owner.id, group.id, member.username, prisma);
  return { owner, member, outsider, group, context: { kind: "GROUP" as const, groupId: group.id } };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;

function expense(f: Fixture, description: string, overrides: Partial<Omit<CreateDirectExpenseInput, "kind">> & { kind?: "GROUP" | "DIRECT" } = {}) {
  const { kind, currencyCode, ...fields } = overrides;
  const common = {
    actorUserId: f.owner.id,
    payerUserId: f.owner.id,
    participants: [{ userId: f.member.id }],
    amount: "10.01",
    expenseDate: day,
    splitMethod: "EQUAL" as const,
    description,
    ...fields,
  };
  return createExpense(kind === "DIRECT"
    ? { ...common, kind, currencyCode: currencyCode ?? "USD" }
    : { ...common, kind: "GROUP", groupId: f.group.id }, prisma);
}

async function revise(f: Fixture, expenseId: string, expenseDate: string, description: string) {
  await prisma.$transaction(async (tx) => {
    const original = await tx.expenseRevision.findUniqueOrThrow({
      where: { expenseId_revisionNumber: { expenseId, revisionNumber: 1 } },
      omit: { id: true, createdAt: true },
    });
    const revision = await tx.expenseRevision.create({
      data: { ...original, revisionNumber: 2, expenseDate: new Date(expenseDate), description },
    });
    await tx.expenseShare.create({ data: {
      revisionId: revision.id, participantUserId: f.member.id, shareCents: original.amountCents, allocationOrder: 0,
    } });
    await tx.expense.update({ where: { id: expenseId }, data: { currentRevisionNumber: 2 } });
  });
}

describe("report date validation", () => {
  it("uses UTC midnight boundaries for one or more inclusive calendar days", () => {
    expect(parseReportRange(day, day)).toEqual({
      gte: new Date("2024-02-29T00:00:00Z"), lt: new Date("2024-03-01T00:00:00Z"),
    });
    expect(parseReportRange("2024-12-30", "2024-12-31").lt).toEqual(new Date("2025-01-01T00:00:00Z"));
  });

  it.each([
    [undefined, day], [day, undefined], ["", day], ["2024-2-29", day],
    ["2023-02-29", day], ["2024-04-31", day], [day, "2024-13-01"],
    [day, "2024-02-28"], [[day, day], day], [day, day + "T00:00:00Z"], ["0000-01-01", day],
  ])("rejects invalid bounds %j through %j", (start, end) => {
    expect(() => parseReportRange(start, end)).toThrow(ReportInputError);
  });
});

describe("authorized activity reports", () => {
  it("includes both UTC edges and sums approved rows only", async () => {
    const f = await fixture();
    const approved = await expense(f, "first instant", { expenseDate: new Date(day + "T00:00:00Z") });
    const rejected = await expense(f, "last instant", { expenseDate: new Date(day + "T23:59:59.999Z") });
    await expense(f, "pending");
    await expense(f, "just before", { expenseDate: new Date("2024-02-28T23:59:59.999Z") });
    await expense(f, "next day", { expenseDate: "2024-03-01" });
    await decideGroupExpense(f.member.id, approved.expenseId, "APPROVE", prisma);
    await decideGroupExpense(f.member.id, rejected.expenseId, "REJECT", prisma);

    const { sections: [section] } = await getActivityReport(f.member.id, f.context, dates, prisma);
    expect(section.expenses.map(({ description, status }) => [description, status])).toEqual([
      ["last instant", "REJECTED"], ["pending", "PENDING"], ["first instant", "APPROVED"],
    ]);
    expect(section.approvedCents).toBe(BigInt(1001));
    expect(section.outstandingCents).toBe(BigInt(1001));
  });

  it("selects only the current revision even when dates move across the interval", async () => {
    const f = await fixture();
    const movedOut = await expense(f, "old in range");
    const movedIn = await expense(f, "old outside range", { expenseDate: "2024-02-28" });
    const both = await expense(f, "old same day");
    await revise(f, movedOut.expenseId, "2024-03-01", "current outside range");
    await revise(f, movedIn.expenseId, day, "moved into range");
    await revise(f, both.expenseId, day, "current same day");
    const { sections: [section] } = await getActivityReport(f.owner.id, f.context, dates, prisma);
    expect(section.expenses.map((row) => row.description).sort()).toEqual(["current same day", "moved into range"]);
  });

  it("filters payments on effective date, counts a retry once, and renders a separate current snapshot", async () => {
    const f = await fixture();
    const bill = await expense(f, "Approved bill");
    await decideGroupExpense(f.member.id, bill.expenseId, "APPROVE", prisma);
    const scope = await prisma.balanceScope.findUniqueOrThrow({ where: { groupId: f.group.id } });
    const payment = {
      scopeId: scope.id, groupId: f.group.id, creditorUserId: f.owner.id, amount: "1.01",
      paymentDate: day, idempotencyKey: "report-payment-original-key",
    };
    await recordPayment(f.member.id, payment, prisma);
    const retry = await recordPayment(f.member.id, payment, prisma);
    expect(retry.payment.repeated).toBe(true);
    await recordPayment(f.member.id, { ...payment, paymentDate: "2024-03-01", idempotencyKey: "report-payment-nextday-key" }, prisma);

    const report = await getActivityReport(f.owner.id, f.context, dates, prisma);
    expect(report.sections[0]).toMatchObject({ approvedCents: BigInt(1001), paymentCents: BigInt(101), outstandingCents: BigInt(799) });
    expect(report.sections[0].payments).toHaveLength(1);
    const emptyDates = { start: "2024-02-01", end: "2024-02-01" };
    const earlier = await getActivityReport(f.owner.id, f.context, emptyDates, prisma);
    expect(earlier.sections[0]).toMatchObject({
      expenses: [], payments: [], approvedCents: BigInt(0), paymentCents: BigInt(0), outstandingCents: BigInt(799),
    });
    const html = renderToStaticMarkup(createElement(ReportDashboard, {
      groups: [f.group], groupId: f.group.id, ...emptyDates, report: earlier,
    }));
    expect(html).toContain("Current balance snapshot");
    expect(html).toContain("regardless of the selected dates");
    expect(html).toContain("USD 7.99");
    expect(html).toContain("USD 0.00");
  });

  it("keeps group, other pairs, and currencies separate in personal reports", async () => {
    const f = await fixture();
    await expense(f, "group");
    const other = await makeUser();
    await expense(f, "shared USD", { kind: "DIRECT", currencyCode: "USD" });
    await expense(f, "shared CAD", { kind: "DIRECT", currencyCode: "CAD" });
    const cadScope = await prisma.balanceScope.findFirstOrThrow({ where: { kind: "DIRECT", currencyCode: "CAD",
      OR: [{ directLowUserId: f.owner.id }, { directHighUserId: f.owner.id }],
    } });
    await recordPayment(f.member.id, {
      scopeId: cadScope.id, creditorUserId: f.owner.id, amount: "0.25",
      paymentDate: day, idempotencyKey: "report-isolation-cad-payment",
    }, prisma);
    await expense(f, "another pair USD", { kind: "DIRECT", currencyCode: "USD", participants: [{ userId: other.id }] });
    await expense(f, "unrelated", {
      kind: "DIRECT", currencyCode: "USD", actorUserId: f.outsider.id, payerUserId: f.outsider.id,
      participants: [{ userId: other.id }],
    });
    const report = await getActivityReport(f.owner.id, direct, dates, prisma);
    expect(report.sections).toHaveLength(3);
    expect(report.sections.map((section) => [section.currencyCode, section.approvedCents])).toEqual([
      ["CAD", BigInt(1001)], ["USD", BigInt(1001)], ["USD", BigInt(1001)],
    ]);
    expect(report.sections.flatMap((section) => section.expenses.map((row) => row.description)).sort())
      .toEqual(["another pair USD", "shared CAD", "shared USD"]);
    expect(report.sections.map((section) => section.paymentCents)).toEqual([BigInt(25), BigInt(0), BigInt(0)]);
    const member = await getActivityReport(f.member.id, direct, dates, prisma);
    expect(member.sections).toHaveLength(2);
    const group = await getActivityReport(f.owner.id, f.context, dates, prisma);
    expect(group.sections[0].expenses.map((row) => row.description)).toEqual(["group"]);
    expect(group.sections[0].payments).toEqual([]);
  });

  it("denies unavailable groups, including former members, and returns zeros for an unused group", async () => {
    const f = await fixture();
    await expect(getActivityReport(f.outsider.id, f.context, dates, prisma)).rejects.toThrow(ReportInputError);
    await deactivateGroupMember(f.owner.id, f.group.id, f.member.id, prisma);
    await expect(getActivityReport(f.member.id, f.context, dates, prisma)).rejects.toThrow(ReportInputError);
    await expect(listReportGroups(f.member.id, prisma)).resolves.toEqual([]);
    await expect(getActivityReport(f.outsider.id, direct, dates, prisma)).resolves.toEqual({ sections: [] });
    const report = await getActivityReport(f.owner.id, f.context, dates, prisma);
    expect(report.sections[0]).toMatchObject({
      currencyCode: "USD", expenses: [], payments: [], balances: [],
      approvedCents: BigInt(0), paymentCents: BigInt(0), outstandingCents: BigInt(0),
    });
    await expect(prisma.balanceScope.findUnique({ where: { groupId: f.group.id } })).resolves.toBeNull();
  });

  it("sums amounts beyond SQLite signed 64-bit range and displays exact cents", async () => {
    const f = await fixture();
    for (const label of ["First", "Second"]) {
      const bill = await expense(f, label, {
        participants: [{ userId: f.owner.id }], amount: "92233720368547758.07",
      });
      await decideGroupExpense(f.owner.id, bill.expenseId, "APPROVE", prisma);
    }
    const report = await getActivityReport(f.owner.id, f.context, dates, prisma);
    expect(report.sections[0].approvedCents).toBe(BigInt("18446744073709551614"));
    expect(renderToStaticMarkup(createElement(ReportDashboard, { groups: [f.group], ...dates, report })))
      .toContain("USD 184,467,440,737,095,516.14");
  });
});
