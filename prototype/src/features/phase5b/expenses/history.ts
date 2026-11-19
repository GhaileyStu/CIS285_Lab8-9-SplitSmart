import type { PrismaClient } from "@prisma/client";
import { prisma } from "../../../lib/prisma";
import { requireActiveGroupMember } from "../groups/service";

export async function listGroupExpenses(userId: string, groupId: string, client: PrismaClient = prisma) {
  await requireActiveGroupMember(userId, groupId, client);
  const group = await client.group.findUnique({
    where: { id: groupId },
    select: { id: true, name: true, currencyCode: true, ownerId: true },
  });
  if (!group) throw new Error("Group not found.");
  const expenses = await client.expense.findMany({
    where: { groupId },
    orderBy: { createdAt: "desc" },
    include: {
      revisions: {
        orderBy: { revisionNumber: "desc" },
        include: {
          payer: { select: { id: true, username: true, displayName: true } },
          shares: {
            orderBy: { allocationOrder: "asc" },
            include: { participant: { select: { id: true, username: true, displayName: true } } },
          },
          approvals: {
            orderBy: { createdAt: "asc" },
            include: { participant: { select: { id: true, username: true, displayName: true } } },
          },
        },
      },
    },
  });
  return {
    group,
    expenses: expenses.flatMap((expense) => {
      const revision = expense.revisions.find((item) => item.revisionNumber === expense.currentRevisionNumber);
      return revision ? [{ ...expense, revision }] : [];
    }),
  };
}

/** Returns only exact pending decisions belonging to former participants. */
export async function listFormerParticipantPendingDecisions(userId: string, client: PrismaClient = prisma) {
  const candidates = await client.expense.findMany({
    where: {
      kind: "GROUP",
      status: "PENDING",
      revisions: { some: { shares: { some: { participantUserId: userId } } } },
    },
    orderBy: { createdAt: "desc" },
    include: {
      group: {
        select: {
          id: true,
          name: true,
          currencyCode: true,
          memberships: {
            where: { userId },
            include: { periods: true },
          },
        },
      },
      revisions: {
        orderBy: { revisionNumber: "desc" },
        include: {
          payer: { select: { id: true, username: true, displayName: true } },
          shares: {
            orderBy: { allocationOrder: "asc" },
            include: { participant: { select: { id: true, username: true, displayName: true } } },
          },
          approvals: {
            orderBy: { createdAt: "asc" },
            include: { participant: { select: { id: true, username: true, displayName: true } } },
          },
        },
      },
    },
  });

  return candidates.flatMap((expense) => {
    const revision = expense.revisions.find((item) => item.revisionNumber === expense.currentRevisionNumber);
    const membership = expense.group?.memberships[0];
    const hasMembershipHistory = (membership?.periods.length ?? 0) > 0;
    const alreadyDecided = revision?.approvals.some((approval) => approval.participantUserId === userId);
    if (!expense.group || !revision || membership?.status !== "INACTIVE" || !hasMembershipHistory || alreadyDecided) return [];
    if (!revision.shares.some((share) => share.participantUserId === userId)) return [];
    return [{ ...expense, revision, group: expense.group }];
  });
}
