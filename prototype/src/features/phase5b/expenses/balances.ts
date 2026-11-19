import type { PrismaClient } from "@prisma/client";
import { prisma } from "../../../lib/prisma";
import { requireActiveGroupMember } from "../groups/service";

const ZERO = BigInt(0);
const HUNDRED = BigInt(100);

function amount(cents: bigint, currencyCode: string) {
  const absolute = cents < ZERO ? -cents : cents;
  return `${currencyCode} ${(absolute / HUNDRED).toLocaleString("en-US")}.${(absolute % HUNDRED).toString().padStart(2, "0")}`;
}

function decimal(cents: bigint) {
  const absolute = cents < ZERO ? -cents : cents;
  return `${absolute / HUNDRED}.${(absolute % HUNDRED).toString().padStart(2, "0")}`;
}

type Totals = { owedToMe: bigint; iOwe: bigint; net: bigint; outstanding: bigint };

function summarize(rows: readonly { userLowId: string; userHighId: string; signedBalanceCents: bigint }[], userId: string): Totals {
  return rows.reduce<Totals>((total, row) => {
    const signed = row.signedBalanceCents;
    if (signed === ZERO) return total;
    const position = row.userLowId === userId ? -signed : row.userHighId === userId ? signed : ZERO;
    if (position > ZERO) total.owedToMe += position;
    else total.iOwe += -position;
    total.net += position;
    total.outstanding += signed < ZERO ? -signed : signed;
    return total;
  }, { owedToMe: ZERO, iOwe: ZERO, net: ZERO, outstanding: ZERO });
}

function displayTotals(totals: Totals, currencyCode: string) {
  const netPosition = totals.net === ZERO
    ? `${currencyCode} 0.00 · settled`
    : `${amount(totals.net, currencyCode)} ${totals.net > ZERO ? "owed to you" : "you owe"}`;
  return {
    owedToMe: amount(totals.owedToMe, currencyCode),
    iOwe: amount(totals.iOwe, currencyCode),
    netPosition,
    outstandingTotal: amount(totals.outstanding, currencyCode),
  };
}

export async function listBalanceSummariesForUser(userId: string, client: PrismaClient = prisma) {
  const groups = await client.group.findMany({
    where: { memberships: { some: { userId, status: "ACTIVE" } } },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, currencyCode: true },
  });
  if (groups.length === 0) return [];
  const scopes = await client.balanceScope.findMany({
    where: { kind: "GROUP", groupId: { in: groups.map((group) => group.id) } },
    include: { obligations: { select: { userLowId: true, userHighId: true, signedBalanceCents: true } } },
  });
  const scopesByGroup = new Map(scopes.map((scope) => [scope.groupId, scope]));
  return groups.map((group) => {
    const rows = scopesByGroup.get(group.id)?.obligations ?? [];
    return { ...group, ...displayTotals(summarize(rows, userId), group.currencyCode) };
  });
}

export async function getGroupBalanceDetails(userId: string, groupId: string, client: PrismaClient = prisma) {
  await requireActiveGroupMember(userId, groupId, client);
  const group = await client.group.findUnique({
    where: { id: groupId },
    select: { id: true, name: true, currencyCode: true },
  });
  if (!group) throw new Error("Group not found.");
  const scope = await client.balanceScope.findFirst({
    where: { kind: "GROUP", groupId },
    include: {
      obligations: {
        where: { signedBalanceCents: { not: ZERO } },
        include: {
          userLow: { select: { id: true, displayName: true, username: true } },
          userHigh: { select: { id: true, displayName: true, username: true } },
        },
        orderBy: [{ userLowId: "asc" }, { userHighId: "asc" }],
      },
    },
  });
  const rows = scope?.obligations ?? [];
  const pairwise = rows.map((row) => {
    const lowOwes = row.signedBalanceCents > ZERO;
    const debtor = lowOwes ? row.userLow : row.userHigh;
    const creditor = lowOwes ? row.userHigh : row.userLow;
    return {
      id: row.id,
      scopeId: scope?.id ?? "",
      debtorUserId: debtor.id,
      creditorUserId: creditor.id,
      debtorName: debtor.displayName || debtor.username,
      creditorName: creditor.displayName || creditor.username,
      amount: amount(row.signedBalanceCents, group.currencyCode),
      amountInput: decimal(row.signedBalanceCents),
      involvesCurrentUser: debtor.id === userId || creditor.id === userId,
    };
  });
  return { group, ...displayTotals(summarize(rows, userId), group.currencyCode), pairwise };
}

export async function listFormerPersonalBalances(userId: string, client: PrismaClient = prisma) {
  const memberships = await client.groupMembership.findMany({
    where: { userId, status: "INACTIVE", periods: { some: { leftAt: { not: null } } } },
    select: { group: { select: { id: true, name: true, currencyCode: true } } },
  });
  if (memberships.length === 0) return [];
  const groups = memberships.map((membership) => membership.group);
  const scopes = await client.balanceScope.findMany({
    where: { kind: "GROUP", groupId: { in: groups.map((group) => group.id) } },
    include: {
      obligations: {
        where: { OR: [{ userLowId: userId }, { userHighId: userId }], signedBalanceCents: { not: ZERO } },
        include: {
          userLow: { select: { id: true, displayName: true, username: true } },
          userHigh: { select: { id: true, displayName: true, username: true } },
        },
      },
    },
  });
  const scopesByGroup = new Map(scopes.map((scope) => [scope.groupId, scope]));
  return groups.flatMap((group) => {
    const rows = scopesByGroup.get(group.id)?.obligations ?? [];
    if (rows.length === 0) return [];
    const personalRows = rows.map((row) => {
      const lowOwes = row.signedBalanceCents > ZERO;
      const debtor = lowOwes ? row.userLow : row.userHigh;
      const creditor = lowOwes ? row.userHigh : row.userLow;
      const counterparty = debtor.id === userId ? creditor : debtor;
      return {
        id: row.id,
        scopeId: scopesByGroup.get(group.id)?.id ?? "",
        debtorUserId: debtor.id,
        creditorUserId: creditor.id,
        groupName: group.name,
        currencyCode: group.currencyCode,
        debtorName: debtor.displayName || debtor.username,
        creditorName: creditor.displayName || creditor.username,
        counterpartyName: counterparty.displayName || counterparty.username,
        amount: amount(row.signedBalanceCents, group.currencyCode),
        amountInput: decimal(row.signedBalanceCents),
      };
    });
    const totals = summarize(rows, userId);
    return [{
      groupId: group.id,
      groupName: group.name,
      currencyCode: group.currencyCode,
      owedToMe: amount(totals.owedToMe, group.currencyCode),
      iOwe: amount(totals.iOwe, group.currencyCode),
      netPosition: totals.net === ZERO ? `${group.currencyCode} 0.00 · settled` : `${amount(totals.net, group.currencyCode)} ${totals.net > ZERO ? "owed to you" : "you owe"}`,
      pairwise: personalRows,
    }];
  });
}
