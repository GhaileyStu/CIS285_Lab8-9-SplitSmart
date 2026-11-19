# SplitSmart Lab 9 — Phase 5A Expense Allocation and Creation Report

**Date:** 2026-11-19  
**Branch:** `feature/splitsmart-prototype`  
**Outcome:** Implementation stopped before edits because the approved allocation rule produces a negative share for valid input, and the task explicitly requires review rather than inventing a different policy.

## Conflict requiring a product/design decision

The approved design requires each allocation to be rounded half-up to two decimal places, then assigns the full residual to the payer when the payer participates, otherwise to the first submitted participant. The design also allows zero-cent shares and requires persisted shares to be nonnegative.

These rules conflict for valid inputs:

- Expense total: **$0.03**.
- Participants in submitted order: payer at **0 basis points**, then participants at **5,000 basis points** each.
- Percentages total exactly **10,000 basis points**.
- Half-up rounded shares: **$0.00, $0.02, $0.02**. These sum to $0.04.
- Residual: **−$0.01**. The specified recipient is the payer, so the final shares would be **−$0.01, $0.02, $0.02**.

The negative payer share violates the approved `ExpenseShare.shareCents >= 0` constraint. The inputs satisfy the stated amount, participant, percentage, and payer rules. An equal-split example also exhibits the problem: splitting $0.02 among four participants rounds each share to $0.01; the −$0.02 residual assigned to the payer/first participant would make that share −$0.01.

An integer-only diagnostic calculation reproduced the percentage case. No allocation implementation was added because doing so would require choosing a different residual policy or rejecting otherwise valid inputs, both of which would change approved behavior.

## Work and checks completed before stopping

- Read the requested source specification, `UserRequirement.md`, approved database design, Prisma schema, Phase 3B audit, and Phase 4 migration report.
- Inspected the application structure. It is a minimal Next.js scaffold with `src/app/page.tsx`, `layout.tsx`, and `globals.css`; no existing expense services or Prisma client setup were found.
- Inspected `prototype/package.json` and `prototype/tsconfig.json`. Vitest is already present as a development dependency (`^5.1.0`), though no test script is configured. No new dependency is needed for testing.
- Confirmed the approved Prisma schema and database migration contain `ExpenseShare.shareCents >= 0`, permit zero-cent shares, and use basis points from 0 through 10,000.
- Ran the integer-only diagnostic example described above.
- Ran `git diff --check`; it passed.

No application implementation, automated tests, TypeScript check, lint command, Prisma validation, or database operation was run for Phase 5A. The pre-existing development database was not inspected or modified in this task.

## Files changed

Only this requested report was created:

- `prototype/PHASE5A_EXPENSE_IMPLEMENTATION_REPORT.md`

No allocation or expense creation code was changed. No schema, migration, dependency, or application files were changed. Nothing was staged, committed, or pushed.

## Decision needed to resume

Clarify how valid allocations should reconcile when half-up rounding creates a negative residual larger than the payer/first participant's rounded share, while preserving nonnegative participant shares. Until the approved allocation policy resolves this case, Phase 5A implementation cannot safely proceed.

Final `git status --short --branch` at report creation:

```text
## feature/splitsmart-prototype...origin/feature/splitsmart-prototype
?? prototype/DATABASE_MIGRATION_PHASE4_REPORT.md
?? prototype/DATABASE_MIGRATION_PREFLIGHT_PHASE4.md
?? prototype/PHASE5A_EXPENSE_IMPLEMENTATION_REPORT.md
```

