import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "../prisma";

function cleanText(value: string, field: string, maxLength: number) {
  const clean = value.trim();
  if (!clean || clean.length > maxLength) throw new Error(`${field} is required and must be at most ${maxLength} characters.`);
  return clean;
}

const SUPPORTED_CURRENCIES = new Set(["USD", "CAD", "EUR", "GBP", "AUD", "NZD"]);

export async function listGroupsForUser(userId: string, client: PrismaClient = prisma) {
  return client.group.findMany({
    where: { memberships: { some: { userId, status: "ACTIVE" } } },
    orderBy: { updatedAt: "desc" },
    include: {
      _count: { select: { expenses: true } },
      memberships: {
        where: { status: "ACTIVE" },
        orderBy: { createdAt: "asc" },
        include: { user: { select: { id: true, username: true, displayName: true } } },
      },
    },
  });
}

export async function createGroup(actorUserId: string, rawName: string, rawCurrency: string, client: PrismaClient = prisma) {
  const name = cleanText(rawName, "Group name", 80);
  const currencyCode = rawCurrency.trim().toUpperCase();
  if (!SUPPORTED_CURRENCIES.has(currencyCode)) throw new Error("Choose a supported currency: USD, CAD, EUR, GBP, AUD, or NZD.");
  return client.$transaction(async (tx) => {
    const group = await tx.group.create({
      data: { ownerId: actorUserId, name, currencyCode },
    });
    const membership = await tx.groupMembership.create({
      data: { groupId: group.id, userId: actorUserId, role: "OWNER", status: "ACTIVE" },
    });
    await tx.membershipPeriod.create({ data: { membershipId: membership.id, joinedAt: new Date() } });
    return group;
  });
}

async function requireOwner(tx: Prisma.TransactionClient, actorUserId: string, groupId: string) {
  const group = await tx.group.findUnique({ where: { id: groupId }, select: { id: true, ownerId: true } });
  if (!group) throw new Error("Group not found.");
  if (group.ownerId !== actorUserId) throw new Error("Only the group owner can manage members.");
  return group;
}

export async function addGroupMember(actorUserId: string, groupId: string, rawUsername: string, client: PrismaClient = prisma) {
  const username = cleanText(rawUsername, "Username", 32).toLowerCase();
  return client.$transaction(async (tx) => {
    await requireOwner(tx, actorUserId, groupId);
    const user = await tx.user.findUnique({ where: { username }, select: { id: true, username: true } });
    if (!user) throw new Error("No registered account has that username.");
    const existing = await tx.groupMembership.findUnique({ where: { groupId_userId: { groupId, userId: user.id } } });
    if (existing?.status === "ACTIVE") throw new Error("That person is already an active member.");
    const membership = existing
      ? await tx.groupMembership.update({ where: { id: existing.id }, data: { status: "ACTIVE", role: "MEMBER", deactivatedAt: null } })
      : await tx.groupMembership.create({ data: { groupId, userId: user.id, role: "MEMBER", status: "ACTIVE" } });
    await tx.membershipPeriod.create({ data: { membershipId: membership.id, joinedAt: new Date() } });
    return user;
  });
}

export async function deactivateGroupMember(actorUserId: string, groupId: string, memberUserId: string, client: PrismaClient = prisma) {
  return client.$transaction(async (tx) => {
    const group = await requireOwner(tx, actorUserId, groupId);
    if (memberUserId === group.ownerId) throw new Error("The group owner cannot be removed.");
    const membership = await tx.groupMembership.findUnique({ where: { groupId_userId: { groupId, userId: memberUserId } } });
    if (!membership || membership.status !== "ACTIVE") throw new Error("That person is not an active member.");
    const period = await tx.membershipPeriod.findFirst({ where: { membershipId: membership.id, leftAt: null }, orderBy: { joinedAt: "desc" } });
    const now = new Date(Math.max(Date.now(), (period?.joinedAt.getTime() ?? 0) + 1));
    await tx.membershipPeriod.updateMany({ where: { membershipId: membership.id, leftAt: null }, data: { leftAt: now } });
    await tx.groupMembership.update({ where: { id: membership.id }, data: { status: "INACTIVE", deactivatedAt: now } });
  });
}

export async function updateGroup(actorUserId: string, groupId: string, rawName: string, rawCurrency: string, client: PrismaClient = prisma) {
  const name = cleanText(rawName, "Group name", 80);
  const currencyCode = rawCurrency.trim().toUpperCase();
  if (!SUPPORTED_CURRENCIES.has(currencyCode)) throw new Error("Choose a supported currency: USD, CAD, EUR, GBP, AUD, or NZD.");
  return client.$transaction(async (tx) => {
    await requireOwner(tx, actorUserId, groupId);
    const current = await tx.group.findUnique({ where: { id: groupId }, select: { currencyCode: true } });
    if (!current) throw new Error("Group not found.");
    if (current.currencyCode !== currencyCode && await tx.expense.count({ where: { groupId } }) > 0) {
      throw new Error("Group currency is locked after the first expense so saved history keeps its original currency.");
    }
    return tx.group.update({ where: { id: groupId }, data: { name, currencyCode } });
  });
}

export async function requireActiveGroupMember(userId: string, groupId: string, client: PrismaClient = prisma) {
  const membership = await client.groupMembership.findUnique({ where: { groupId_userId: { groupId, userId } }, select: { status: true } });
  if (membership?.status !== "ACTIVE") throw new Error("You are not an active member of this group.");
}
