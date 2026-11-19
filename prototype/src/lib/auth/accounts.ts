import { prisma } from "../prisma";
import type { PrismaClient } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";
import { hashPassword, validateAccountInput, verifyPassword } from "./password";

const FAILURE_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 8;
const dummyPasswordHash = hashPassword(randomBytes(24).toString("hex"));

export async function registerAccount(raw: {
  username: string; email: string; displayName: string; password: string;
}, client: PrismaClient = prisma) {
  const account = validateAccountInput(raw);
  const passwordHash = await hashPassword(account.password);
  try {
    return await client.user.create({
      data: {
        username: account.username,
        email: account.email,
        displayName: account.displayName,
        passwordHash,
      },
      select: { id: true, username: true, displayName: true, email: true },
    });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      throw new Error("That username or email is already registered.");
    }
    throw error;
  }
}

export async function authenticateAccount(username: string, password: string, client: PrismaClient = prisma) {
  const canonical = username.trim().toLowerCase();
  if (!/^[a-z0-9_]{3,32}$/.test(canonical) || password.length === 0 || password.length > 200) {
    throw new Error("Username or password is incorrect.");
  }
  const keyHash = createHash("sha256").update(canonical).digest("hex");
  const bucket = await client.loginThrottleBucket.findUnique({ where: { kind_keyHash: { kind: "account", keyHash } } });
  const now = new Date();
  if (bucket?.blockedUntil && bucket.blockedUntil > now) {
    throw new Error("Username or password is incorrect. Try again in a few minutes.");
  }
  const user = await client.user.findUnique({ where: { username: canonical } });
  const passwordMatches = await verifyPassword(password, user?.passwordHash ?? await dummyPasswordHash);
  if (!user || !passwordMatches) {
    const inWindow = bucket && now.getTime() - bucket.windowStartedAt.getTime() < FAILURE_WINDOW_MS;
    const next = await client.loginThrottleBucket.upsert({
      where: { kind_keyHash: { kind: "account", keyHash } },
      create: {
        kind: "account", keyHash, failureCount: 1, windowStartedAt: now, delayLevel: 0,
        blockedUntil: null,
      },
      update: inWindow ? {
        failureCount: { increment: 1 }, updatedAt: now,
      } : {
        failureCount: 1, windowStartedAt: now, delayLevel: 0, blockedUntil: null, updatedAt: now,
      },
    });
    if (next.failureCount >= MAX_FAILURES) {
      await client.loginThrottleBucket.update({ where: { id: next.id }, data: { blockedUntil: new Date(now.getTime() + FAILURE_WINDOW_MS) } });
    }
    throw new Error("Username or password is incorrect.");
  }
  await client.loginThrottleBucket.deleteMany({ where: { kind: "account", keyHash } });
  return { id: user.id, username: user.username, displayName: user.displayName, email: user.email };
}
