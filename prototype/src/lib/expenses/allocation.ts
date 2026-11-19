export const MAX_SQLITE_INTEGER = BigInt("9223372036854775807");

export type ExpenseSplitMethod = "EQUAL" | "PERCENTAGE";

export interface AllocationParticipantInput {
  userId: string;
  percentageBasisPoints?: number | null;
}

export interface AllocateExpenseInput {
  amount: string;
  splitMethod: ExpenseSplitMethod;
  payerUserId: string;
  participants: readonly AllocationParticipantInput[];
}

export interface AllocatedShare {
  participantUserId: string;
  shareCents: bigint;
  percentageBasisPoints: number | null;
  allocationOrder: number;
}

export interface ExpenseAllocation {
  amountCents: bigint;
  shares: AllocatedShare[];
}

export type AllocationErrorCode =
  | "INVALID_AMOUNT"
  | "AMOUNT_OUT_OF_RANGE"
  | "INVALID_SPLIT_METHOD"
  | "INVALID_PAYER"
  | "INVALID_PARTICIPANTS"
  | "DUPLICATE_PARTICIPANT"
  | "INVALID_PERCENTAGES"
  | "UNALLOCATABLE_RESIDUAL"
  | "SHARE_OUT_OF_RANGE";

export class AllocationError extends Error {
  constructor(
    public readonly code: AllocationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AllocationError";
  }
}

export function parseAmountToCents(amount: string): bigint {
  if (typeof amount !== "string" || !/^\d+(?:\.\d{1,2})?$/.test(amount)) {
    throw new AllocationError(
      "INVALID_AMOUNT",
      "Enter a positive amount with no more than two decimal places.",
    );
  }

  const [whole, fractional = ""] = amount.split(".");
  const normalizedWhole = whole.replace(/^0+(?=\d)/, "");
  if (normalizedWhole.length > 17) {
    throw new AllocationError(
      "AMOUNT_OUT_OF_RANGE",
      "Expense amount exceeds SQLite's signed 64-bit monetary limit.",
    );
  }
  const cents =
    BigInt(normalizedWhole) * BigInt(100) + BigInt(fractional.padEnd(2, "0") || "0");
  if (cents <= BigInt(0)) {
    throw new AllocationError("INVALID_AMOUNT", "Expense amount must be positive.");
  }
  if (cents > MAX_SQLITE_INTEGER) {
    throw new AllocationError(
      "AMOUNT_OUT_OF_RANGE",
      "Expense amount exceeds SQLite's signed 64-bit monetary limit.",
    );
  }
  return cents;
}

function roundHalfUpNonnegative(numerator: bigint, denominator: bigint): bigint {
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  return remainder * BigInt(2) >= denominator ? quotient + BigInt(1) : quotient;
}

export function allocateExpense(input: AllocateExpenseInput): ExpenseAllocation {
  if (input.splitMethod !== "EQUAL" && input.splitMethod !== "PERCENTAGE") {
    throw new AllocationError("INVALID_SPLIT_METHOD", "Split method must be EQUAL or PERCENTAGE.");
  }
  if (typeof input.payerUserId !== "string" || input.payerUserId.trim() === "") {
    throw new AllocationError("INVALID_PAYER", "A payer is required.");
  }
  if (!Array.isArray(input.participants) || input.participants.length === 0) {
    throw new AllocationError("INVALID_PARTICIPANTS", "At least one participant is required.");
  }

  const seen = new Set<string>();
  for (const participant of input.participants) {
    if (typeof participant.userId !== "string" || participant.userId.trim() === "") {
      throw new AllocationError("INVALID_PARTICIPANTS", "Every participant must have a user ID.");
    }
    if (seen.has(participant.userId)) {
      throw new AllocationError("DUPLICATE_PARTICIPANT", "A participant may appear only once.");
    }
    seen.add(participant.userId);
  }

  const amountCents = parseAmountToCents(input.amount);
  let basisPoints: (number | null)[];
  if (input.splitMethod === "EQUAL") {
    if (input.participants.some((participant) => participant.percentageBasisPoints != null)) {
      throw new AllocationError(
        "INVALID_PERCENTAGES",
        "Equal splits must not include percentage allocations.",
      );
    }
    basisPoints = input.participants.map(() => null);
  } else {
    const values = input.participants.map((participant) => participant.percentageBasisPoints);
    if (
      values.some(
        (value) =>
          typeof value !== "number" ||
          !Number.isInteger(value) ||
          value < 0 ||
          value > 10_000,
      ) ||
      values.reduce<number>((sum, value) => sum + (typeof value === "number" ? value : 0), 0) !== 10_000
    ) {
      throw new AllocationError(
        "INVALID_PERCENTAGES",
        "Percentage allocations must be integer basis points that total exactly 10,000.",
      );
    }
    basisPoints = values as number[];
  }

  const roundedShares = input.participants.map((participant, allocationOrder) => {
    const numerator =
      input.splitMethod === "EQUAL"
        ? amountCents
        : amountCents * BigInt(basisPoints[allocationOrder] as number);
    const denominator =
      input.splitMethod === "EQUAL" ? BigInt(input.participants.length) : BigInt(10_000);
    return {
      participantUserId: participant.userId,
      percentageBasisPoints: basisPoints[allocationOrder],
      allocationOrder,
      shareCents: roundHalfUpNonnegative(numerator, denominator),
    } satisfies AllocatedShare;
  });

  const roundedTotal = roundedShares.reduce((sum, share) => sum + share.shareCents, BigInt(0));
  const residual = amountCents - roundedTotal;
  const payerIndex = input.participants.findIndex(
    (participant) => participant.userId === input.payerUserId,
  );
  const residualIndex = payerIndex >= 0 ? payerIndex : 0;
  roundedShares[residualIndex].shareCents += residual;

  if (roundedShares.some((share) => share.shareCents < BigInt(0))) {
    throw new AllocationError(
      "UNALLOCATABLE_RESIDUAL",
      "Rounding the shares and assigning the residual to the payer or first participant would create a negative share.",
    );
  }
  if (roundedShares.some((share) => share.shareCents > MAX_SQLITE_INTEGER)) {
    throw new AllocationError("SHARE_OUT_OF_RANGE", "An allocated share exceeds SQLite's signed 64-bit limit.");
  }
  const reconciledTotal = roundedShares.reduce((sum, share) => sum + share.shareCents, BigInt(0));
  if (reconciledTotal !== amountCents) {
    throw new AllocationError(
      "UNALLOCATABLE_RESIDUAL",
      "Expense shares could not be reconciled exactly to the expense total.",
    );
  }

  return { amountCents, shares: roundedShares };
}
