# SplitSmart Lab 9 — Phase 5C Implementation Report

**Phase:** Group Expense Approval and Rejection  
**Branch:** `feature/splitsmart-prototype`  
**Prisma:** CLI and client 6.19.3  
**Status:** Implemented and verified. This report does not claim completion of Lab 9.

## Features implemented

- Group expense cards show approval progress and each participant’s approve, reject, or awaiting state.
- Participants can approve or reject a pending group expense from the dashboard.
- A former participant receives a narrowly scoped pending-decision inbox containing only pending expenses where they are a participant and have not decided. The exception does not grant group history or management access.
- The expense creator can decide only when listed as a participant; the creator has no additional approval privilege.
- Repeated identical decisions are idempotent. A conflicting second decision is rejected. Decisions are immutable.
- Any participant rejection immediately finalizes the expense as `REJECTED`; remaining participants cannot add decisions. An expense becomes `APPROVED` only after every current-revision participant has approved.
- Final approval applies the saved Phase 5A shares to the group’s pairwise balance projection. Pending and rejected expenses do not affect that projection. Corrections to rejected expenses require a new expense.

## Authorization and transaction protections

- Both Server Actions call the existing `requireUser` session guard. The actor ID is derived from the authenticated session; submitted actor IDs are ignored.
- The approval service verifies that the expense is a pending group expense, the actor is a participant on the current revision, and a group membership period exists. Active membership is not required for the former-participant exception.
- Former participants can only query their own pending participant decisions. General group history still requires active membership through `listGroupExpenses`.
- Each decision is stored against the current `ExpenseRevision`. The database’s unique `(revisionId, participantUserId)` constraint prevents duplicate decision rows.
- Decision insertion, conditional status transition, and final projection update run in one Prisma transaction. A failed projection rolls the transaction back.
- The final transition is guarded by `status = PENDING`; saved shares are used without recalculating allocation. Projection logic skips payer self-shares and zero-cent shares and checks signed 64-bit bounds.
- The previous direct-expense projection code was extracted to a shared helper. Direct expenses still become approved and update their direct currency-specific scope at creation.

## Files created

- `prototype/PHASE5C_IMPLEMENTATION_REPORT.md` — this report.
- `prototype/src/features/phase5a/expenses/balance-projection.ts` — shared pairwise projection helper.
- `prototype/src/features/phase5b/expenses/approvals.ts` — approval decision service.
- `prototype/tests/phase5b/expenses/approval-actions.test.ts` — authentication and forged actor input checks.
- `prototype/tests/phase5b/expenses/approvals.test.ts` — isolated service, state, access, projection, rollback, and concurrency tests.

## Files modified

- `prototype/src/features/phase5a/expenses/create-expense.ts` — delegates the existing direct projection to the shared helper and preserves the existing overflow error contract.
- `prototype/src/features/phase5b/actions/expenses.ts` — adds approve/reject Server Actions.
- `prototype/src/features/phase5b/expenses/history.ts` — loads approval details and adds former-participant pending-decision lookup.
- `prototype/src/features/phase5b/ui/dashboard.tsx` — adds approval progress, actions, and the former-participant inbox.
- `prototype/src/app/globals.css` — adds approval, rejection, and decision-state styling.

`next.config.ts` was not changed. The pre-existing untracked `prototype/PHASE5C_PREPARATION_REVIEW.md` was preserved. At implementation start, that was the only untracked file reported by Git; the previously mentioned `AGENTS.md`, `LOGIN_REGISTRATION_DIAGNOSIS.md`, and `LOGIN_SCREEN_TEST_GUIDE.md` were not present in the starting status. Nothing was staged, committed, or pushed.

## Schema and migration

No Prisma schema or migration change was made. Existing `Approval`, `Expense`, `ExpenseRevision`, `ExpenseShare`, `GroupMembership`, `MembershipPeriod`, `BalanceScope`, and `PairwiseObligation` models support this workflow. Prisma CLI and client remain at 6.19.3.

## Verification results

All commands below completed successfully on the final implementation:

| Command | Result |
|---|---|
| `npx vitest run tests/phase5a/expenses` | Passed, 23 tests across 2 files |
| `npx vitest run tests/phase5b/auth tests/phase5b/groups` | Passed, 10 tests across 2 files |
| `npx vitest run tests/phase5b/expenses` | Passed, 16 tests across 2 files |
| `npx vitest run` | Passed, 49 tests across 6 files |
| `npm run lint` | Passed |
| `npx tsc --noEmit` | Passed |
| `npx prisma validate` | Passed; schema valid |
| `npm run build` | Passed with Next.js 16.4.6 and Turbopack |
| `git diff --check` | Passed |

An initial TypeScript run found two BigInt literal syntaxes incompatible with the project target in the new test file. They were changed to `BigInt(0)`, and the final TypeScript check passed.

The tests use disposable temporary SQLite databases. The configured development database was not targeted. Its SHA-256 before and after implementation was identical:

```text
8d9b5a2c83f2d5b5bb8850b55fd1e7d1567eb1476c37d17bd9cc186644e71fb5  prisma/dev.db
```

## Manual browser demonstration

1. Start the app with `npm run dev` and open it through the Codespaces forwarded URL.
2. Register three test accounts. Sign in as the first account, create a group, and add the other two accounts.
3. As the group owner, submit a group expense including all three participants. Confirm it appears as awaiting review with `0 of 3 approvals` and no participant decision chips marked approved.
4. Sign in as the creator and approve. Confirm the expense remains pending at `1 of 3`; the creator’s decision is counted because they are a participant.
5. Sign in as the second participant and approve. Confirm it remains pending at `2 of 3`.
6. Sign in as the final participant and approve. Confirm the expense becomes approved and the UI shows all three decisions. The automated service test verifies that the persisted group projection equals the saved shares.
7. Submit a second group expense and reject it as one participant. Confirm it immediately becomes rejected and does not add a group obligation.
8. Submit an expense with a participant who is later deactivated before deciding. Sign in as that former participant and confirm the home page exposes only their own pending decision. Confirm the group is absent from their group history and that the inbox entry disappears after they decide.
9. Attempt an approval as a group member who is not a participant and as an unrelated account. Both attempts must be denied.

## Known limitations and remaining Lab 9 work

- Phase 5C records group obligations in the existing projection but does not add a balance-view UI.
- There is no notification/activity feed for pending approval decisions.
- Former participants see only undecided pending expenses in their one-time inbox; this does not provide historical group access after they decide.
- Payments and settlements, balance views, reports, notification delivery, receipts, and broader platform requirements remain outside this phase. Do not treat this report as completion of the full Lab 9 assignment.

## Completion boundary

The configured development database hash did not change. No schema, migration, dependency, or configuration changes were made. No unrelated Lab 6 or Lab 7 files were modified. No files were staged, committed, or pushed. Implementation stops at Phase 5C and awaits further authorization.
