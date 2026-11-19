import { describe, expect, it } from "vitest";
import {
  allocateExpense,
  AllocationError,
  parseAmountToCents,
  type AllocateExpenseInput,
} from "./allocation";

function allocate(input: AllocateExpenseInput) {
  return allocateExpense(input);
}

function expectExactNonnegativeTotal(input: AllocateExpenseInput) {
  const result = allocate(input);
  expect(result.shares.reduce((sum, share) => sum + share.shareCents, BigInt(0))).toBe(
    result.amountCents,
  );
  expect(result.shares.every((share) => share.shareCents >= BigInt(0))).toBe(true);
  return result;
}

describe("expense allocation", () => {
  it("splits an evenly divisible amount equally", () => {
    const result = expectExactNonnegativeTotal({
      amount: "60.00",
      splitMethod: "EQUAL",
      payerUserId: "a",
      participants: [{ userId: "a" }, { userId: "b" }, { userId: "c" }],
    });

    expect(result.shares.map((share) => share.shareCents)).toEqual([BigInt(2000), BigInt(2000), BigInt(2000)]);
  });

  it("rounds equal shares half-up and assigns the remainder to the payer", () => {
    const result = expectExactNonnegativeTotal({
      amount: "10.00",
      splitMethod: "EQUAL",
      payerUserId: "a",
      participants: [{ userId: "a" }, { userId: "b" }, { userId: "c" }],
    });

    expect(result.shares.map((share) => share.shareCents)).toEqual([BigInt(334), BigInt(333), BigInt(333)]);
  });

  it("uses the payer rather than the first participant when payer is later in order", () => {
    const result = expectExactNonnegativeTotal({
      amount: "10.00",
      splitMethod: "EQUAL",
      payerUserId: "c",
      participants: [{ userId: "a" }, { userId: "b" }, { userId: "c" }],
    });

    expect(result.shares.map((share) => share.shareCents)).toEqual([BigInt(333), BigInt(333), BigInt(334)]);
    expect(result.shares.map((share) => share.allocationOrder)).toEqual([0, 1, 2]);
  });

  it("uses the first participant when the payer is excluded", () => {
    const result = expectExactNonnegativeTotal({
      amount: "10.00",
      splitMethod: "EQUAL",
      payerUserId: "outside",
      participants: [{ userId: "b" }, { userId: "a" }, { userId: "c" }],
    });

    expect(result.shares.map((share) => share.shareCents)).toEqual([BigInt(334), BigInt(333), BigInt(333)]);
    expect(result.shares.map((share) => share.participantUserId)).toEqual(["b", "a", "c"]);
  });

  it("rounds percentage allocations half-up and applies residual to the payer", () => {
    const result = expectExactNonnegativeTotal({
      amount: "10.00",
      splitMethod: "PERCENTAGE",
      payerUserId: "c",
      participants: [
        { userId: "a", percentageBasisPoints: 3333 },
        { userId: "b", percentageBasisPoints: 3333 },
        { userId: "c", percentageBasisPoints: 3334 },
      ],
    });

    expect(result.shares.map((share) => share.shareCents)).toEqual([BigInt(333), BigInt(333), BigInt(334)]);
  });

  it("rounds tied percentage half-cents half-up and keeps a later payer's residual", () => {
    const result = expectExactNonnegativeTotal({
      amount: "0.01",
      splitMethod: "PERCENTAGE",
      payerUserId: "second",
      participants: [
        { userId: "first", percentageBasisPoints: 5000 },
        { userId: "second", percentageBasisPoints: 5000 },
      ],
    });

    expect(result.shares.map((share) => share.shareCents)).toEqual([BigInt(1), BigInt(0)]);
  });

  it("preserves a zero-cent percentage share", () => {
    const result = expectExactNonnegativeTotal({
      amount: "0.01",
      splitMethod: "PERCENTAGE",
      payerUserId: "payer",
      participants: [
        { userId: "payer", percentageBasisPoints: 10_000 },
        { userId: "zero", percentageBasisPoints: 0 },
      ],
    });

    expect(result.shares.map((share) => share.shareCents)).toEqual([BigInt(1), BigInt(0)]);
  });

  it("rejects a valid percentage input when the designated residual would be negative", () => {
    expect(() =>
      allocate({
        amount: "0.03",
        splitMethod: "PERCENTAGE",
        payerUserId: "payer",
        participants: [
          { userId: "payer", percentageBasisPoints: 0 },
          { userId: "second", percentageBasisPoints: 5000 },
          { userId: "third", percentageBasisPoints: 5000 },
        ],
      }),
    ).toThrowError(AllocationError);
    try {
      allocate({
        amount: "0.03",
        splitMethod: "PERCENTAGE",
        payerUserId: "payer",
        participants: [
          { userId: "payer", percentageBasisPoints: 0 },
          { userId: "second", percentageBasisPoints: 5000 },
          { userId: "third", percentageBasisPoints: 5000 },
        ],
      });
    } catch (error) {
      expect(error).toMatchObject({ code: "UNALLOCATABLE_RESIDUAL" });
    }
  });

  it("rejects a small equal split when residual assignment would make a share negative", () => {
    expect(() =>
      allocate({
        amount: "0.02",
        splitMethod: "EQUAL",
        payerUserId: "a",
        participants: [{ userId: "a" }, { userId: "b" }, { userId: "c" }, { userId: "d" }],
      }),
    ).toThrowError(AllocationError);
  });

  it("rejects invalid percentage values and totals", () => {
    const base: AllocateExpenseInput = {
      amount: "1.00",
      splitMethod: "PERCENTAGE",
      payerUserId: "a",
      participants: [
        { userId: "a", percentageBasisPoints: 5000 },
        { userId: "b", percentageBasisPoints: 4999 },
      ],
    };
    expect(() => allocate(base)).toThrowError(AllocationError);
    expect(() =>
      allocate({
        ...base,
        participants: [
          { userId: "a", percentageBasisPoints: -1 },
          { userId: "b", percentageBasisPoints: 10_001 },
        ],
      }),
    ).toThrowError(AllocationError);
    expect(() =>
      allocate({
        ...base,
        participants: [
          { userId: "a", percentageBasisPoints: 5000.5 },
          { userId: "b", percentageBasisPoints: 4999.5 },
        ],
      }),
    ).toThrowError(AllocationError);
  });

  it("rejects duplicate or missing participants and payer", () => {
    expect(() =>
      allocate({
        amount: "1.00",
        splitMethod: "EQUAL",
        payerUserId: "a",
        participants: [{ userId: "a" }, { userId: "a" }],
      }),
    ).toThrowError(AllocationError);
    expect(() =>
      allocate({ amount: "1.00", splitMethod: "EQUAL", payerUserId: "a", participants: [] }),
    ).toThrowError(AllocationError);
    expect(() =>
      allocate({
        amount: "1.00",
        splitMethod: "EQUAL",
        payerUserId: " ",
        participants: [{ userId: "a" }],
      }),
    ).toThrowError(AllocationError);
  });

  it("rejects invalid amount formats, non-positive amounts, and overflows", () => {
    for (const amount of ["0", "-1.00", "1.001", "1e2", ".50", " 1.00"]) {
      expect(() => parseAmountToCents(amount)).toThrowError(AllocationError);
    }
    expect(() => parseAmountToCents("92233720368547758.08")).toThrowError(AllocationError);
    expect(parseAmountToCents("0001.20")).toBe(BigInt(120));
    expect(() => parseAmountToCents(1 as unknown as string)).toThrowError(AllocationError);
  });

  it("rejects an invalid split method", () => {
    expect(() =>
      allocate({
        amount: "1.00",
        splitMethod: "OTHER" as AllocateExpenseInput["splitMethod"],
        payerUserId: "a",
        participants: [{ userId: "a" }],
      }),
    ).toThrowError(AllocationError);
  });
});
