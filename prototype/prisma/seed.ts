import { createExpense, type CreateGroupExpenseInput, type ExpenseTransactionClient } from "../src/features/phase5a/expenses/create-expense";
import { applyExpenseObligations } from "../src/features/phase5a/expenses/balance-projection";
import { hashPassword } from "../src/features/phase5b/auth/password";
import { prisma } from "../src/lib/prisma";

const groupId = "splitsmart-lab9-demo";
const demoUsers = [
  { id: "splitsmart-lab9-alice", username: "demo_alice", displayName: "Alice Chen" },
  { id: "splitsmart-lab9-bob", username: "demo_bob", displayName: "Bob Rivera" },
  { id: "splitsmart-lab9-charlie", username: "demo_charlie", displayName: "Charlie Patel" },
];

async function seed() {
  const passwordHash = await hashPassword("SplitSmartDemo9");
  await prisma.$transaction(async (tx) => {
    if (await tx.group.findUnique({ where: { id: groupId } })) return;

    const [alice, bob] = demoUsers;
    const now = new Date();
    const expenseClient: ExpenseTransactionClient = { $transaction: (operation) => operation(tx) };
    await tx.user.createMany({
      data: demoUsers.map((user) => ({
        ...user,
        email: `${user.username}@example.test`,
        passwordHash,
      })),
    });
    await tx.group.create({
      data: {
        id: groupId,
        ownerId: alice.id,
        name: "Weekend in Ann Arbor",
        currencyCode: "USD",
        memberships: {
          create: demoUsers.map(({ id }) => ({
            userId: id,
            role: id === alice.id ? "OWNER" : "MEMBER",
            status: "ACTIVE",
            periods: { create: { joinedAt: now } },
          })),
        },
      },
    });

    const participants = demoUsers.map(({ id }) => ({ userId: id }));
    const common = {
      kind: "GROUP",
      groupId,
      expenseDate: now,
      splitMethod: "EQUAL",
      participants,
    } satisfies Partial<CreateGroupExpenseInput>;
    const approved = await createExpense({
      ...common, actorUserId: alice.id, payerUserId: alice.id,
      amount: "60.00", description: "Dinner on Main Street",
    }, expenseClient);
    const revision = await tx.expenseRevision.findUniqueOrThrow({
      where: { id: approved.revisionId },
      include: { shares: true },
    });
    await tx.approval.createMany({
      data: participants.map(({ userId }) => ({
        revisionId: revision.id, participantUserId: userId, decision: "APPROVE",
      })),
    });
    await applyExpenseObligations(tx, revision.balanceScopeId, alice.id, revision.shares);
    await tx.expense.update({
      where: { id: approved.expenseId },
      data: { status: "APPROVED" },
    });
    await createExpense({
      ...common, actorUserId: bob.id, payerUserId: bob.id,
      amount: "10.00", description: "Coffee for the group",
    }, expenseClient);
  });
  console.log("SplitSmart Lab 9 demo data is ready.");
}

seed()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
