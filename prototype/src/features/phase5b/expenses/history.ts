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
