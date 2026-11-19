import type { Prisma } from "@prisma/client";
import { MAX_SQLITE_INTEGER } from "./allocation";

const MIN_SQLITE_INTEGER = -BigInt("9223372036854775808");

export class BalanceProjectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BalanceProjectionError";
  }
}

/** Applies persisted participant shares to one currency-specific balance scope. */
export async function applyExpenseObligations(
  tx: Prisma.TransactionClient,
  scopeId: string,
  payerUserId: string,
  shares: readonly { participantUserId: string; shareCents: bigint }[],
) {
  await Promise.all(
    shares
      .filter((share) => share.participantUserId !== payerUserId && share.shareCents > BigInt(0))
      .map(async (share) => {
        const debtorUserId = share.participantUserId;
        const debtorIsLow = debtorUserId < payerUserId;
        const userLowId = debtorIsLow ? debtorUserId : payerUserId;
        const userHighId = debtorIsLow ? payerUserId : debtorUserId;
        const signedDelta = debtorIsLow ? share.shareCents : -share.shareCents;
        const existing = await tx.pairwiseObligation.findUnique({
          where: {
            balanceScopeId_userLowId_userHighId: {
              balanceScopeId: scopeId,
              userLowId,
              userHighId,
            },
          },
          select: { id: true, signedBalanceCents: true },
        });
        const nextBalance = (existing?.signedBalanceCents ?? BigInt(0)) + signedDelta;
        if (nextBalance < MIN_SQLITE_INTEGER || nextBalance > MAX_SQLITE_INTEGER) {
          throw new BalanceProjectionError("The expense would exceed the supported signed balance range.");
        }
        if (existing) {
          await tx.pairwiseObligation.update({
            where: { id: existing.id },
            data: { signedBalanceCents: nextBalance },
          });
        } else {
          await tx.pairwiseObligation.create({
            data: {
              balanceScopeId: scopeId,
              userLowId,
              userHighId,
              signedBalanceCents: nextBalance,
            },
          });
        }
      }),
  );
}
