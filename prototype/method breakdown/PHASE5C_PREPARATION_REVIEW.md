# SplitSmart Lab 9 — Phase 5C Preparation Review

**Scope:** Read-only preparation for Group Expense Approval and Rejection. No Phase 5C implementation is authorized by this review.

## Repository and branch status

The repository is on `feature/splitsmart-prototype`, tracking `origin/feature/splitsmart-prototype`.

At review time, the working tree already had a modified `next.config.ts` and untracked `AGENTS.md`, `LOGIN_REGISTRATION_DIAGNOSIS.md`, and `LOGIN_SCREEN_TEST_GUIDE.md`. The review introduced no changes; there are no staged files. The SQLite database was not inspected or modified.

## Files inspected

### Requirements and design

- `UserRequirement.md`
- `specs/001-expense-sharing/spec.md`
- `prototype/SPLITSMART_DATABASE_DESIGN.md`
- `prototype/PHASE5A_EXPENSE_IMPLEMENTATION_REPORT.md`
- `prototype/PHASE5B_REVIEW.md`

### Schema, migration, and implementation

- `prototype/prisma/schema.prisma`
- `prototype/prisma/migrations/20261119000000_init/migration.sql`
- `prototype/src/features/phase5a/expenses/create-expense.ts`
- `prototype/src/features/phase5b/auth/session.ts`
- `prototype/src/features/phase5b/actions/expenses.ts`
- `prototype/src/features/phase5b/groups/service.ts`
- `prototype/src/features/phase5b/expenses/history.ts`
- `prototype/src/features/phase5b/ui/dashboard.tsx`
- `prototype/tests/phase5b/groups/service.test.ts`

## Confirmed requirements and proposed decisions

The specification requires every participant in a pending **group** expense to approve it before it affects settled balances. Any participant’s rejection makes it rejected, and pending or rejected expenses must not affect balances. The source does not specify approval rules for direct expenses; Phase 5A already creates direct expenses as approved. Phase 5C should limit approval operations to pending group expenses.

The source defines the approver as an expense participant. It does **not** explicitly say whether an expense creator may approve their own expense. A reasonable proposed rule is: the creator may approve or reject only if they are a participant, and their decision counts as that participant’s required decision. A creator who is not a participant cannot decide. This follows the requirement that every participant reviews the expense, but should be confirmed before implementation.

The source requires one decision from every participant for approval, but does not define duplicate or changed decisions. The schema’s unique `(revisionId, participantUserId)` constraint and the database design’s immutability rule support one permanent decision per participant per revision. Recommended behavior: accept a repeat of the same decision idempotently where practical; reject a conflicting second decision; never permit changes after a decision or after the expense is finalized. Any correction should be submitted as a new expense.

A rejection should immediately transition a pending expense to `REJECTED`; remaining participants can no longer decide it. Approval occurs only after all participants have `APPROVE` decisions. The final transition and balance projection should happen atomically. The specification gives no reopen path; treating both final states as terminal is a proposed prototype rule.

For authorization, the operation must require a signed-in user and a participant record on the exact current revision. A group member who is not a participant must be denied, as must an unrelated nonmember. There is one membership-history decision to settle: the database design proposes allowing a former participant to decide only the pending revision in which they participated, while the current Phase 5B history service exposes group history only to active members. The source does not settle this case. The former-participant exception is narrowly scoped and preserves the participant’s review responsibility, but requires a way for that user to reach the pending expense. Confirm whether to adopt that proposal or require active membership at decision time; active-only eligibility could leave an expense pending after a participant is deactivated.

## Schema sufficiency

The current schema and initial migration appear sufficient; **no schema or migration change is indicated**:

- `Approval` stores a revision, participant, `APPROVE`/`REJECT` decision, and decision timestamp. The database constrains valid decisions and prevents duplicate decisions per participant and revision.
- `Expense` stores current status and revision number.
- `ExpenseRevision` and `ExpenseShare` retain the revision’s payer, balance scope, allocation, and participants.
- `GroupMembership` and `MembershipPeriod` provide current membership and membership history.
- `BalanceScope` and `PairwiseObligation` can hold group-scoped balance projections.

Phase 5A creates group expenses as `PENDING` with no approval rows and no pairwise balance updates. It already creates the group balance scope and persists the calculated shares. Phase 5C should use those **saved shares** when the expense becomes approved, without recalculating allocation. Direct expenses already use a private pairwise-projection helper; to avoid duplicating that balance logic, the plan should extract and reuse a shared projection helper for both direct creation and group approval.

## Proposed architecture and workflow

1. Add an approval service that loads the expense, its current revision, and saved shares in a transaction.
2. Authenticate the actor through the existing session helper; derive the actor ID from the session, never from submitted form data.
3. Validate group kind, pending status, current revision, participant eligibility, and the selected decision. Apply the agreed active/former-membership rule.
4. Insert one immutable `Approval` row. On rejection, transition the expense to `REJECTED`. On approval, count decisions for all saved participants; keep it pending until every one has approved.
5. When the last approval arrives, transition `PENDING` to `APPROVED` conditionally and apply pairwise obligations from saved shares to the expense’s existing group balance scope in the same transaction. Skip payer self-shares and zero-cent shares; use checked integer arithmetic and the existing signed-balance convention.
6. Extend group history to include approval decisions and approver display names.
7. Add Approve and Reject forms to pending expense cards for eligible users. Show decision progress and final status; hide controls for nonparticipants, users who already decided, and finalized expenses.
8. Add two Server Actions that call the service and return the existing group-scoped success/error feedback. Keep authorization in the service as well as the UI; hiding a button is not a security check.

Concurrency protections should include the existing unique decision constraint, a transaction around decision insertion/status/projection, a conditional transition from `PENDING` so finalization can happen only once, and checked balance arithmetic. A failed projection must roll back the decision and status change together.

## Expected files to change

- **New** `prototype/src/features/phase5b/expenses/approvals.ts` — decision service.
- **New** `prototype/src/features/phase5a/expenses/balance-projection.ts` — shared pairwise projection helper, if extracted as recommended.
- `prototype/src/features/phase5a/expenses/create-expense.ts` — use the shared helper for existing direct-expense projection behavior.
- `prototype/src/features/phase5b/actions/expenses.ts` — add approve/reject Server Actions.
- `prototype/src/features/phase5b/expenses/history.ts` — return saved approval records.
- `prototype/src/features/phase5b/ui/dashboard.tsx` — show decision progress and eligible actions.
- `prototype/src/app/globals.css` — style the approval controls and decision state.
- **New** `prototype/tests/phase5b/expenses/approvals.test.ts` — isolated database service tests.

No schema or migration change is expected. If implementation uncovers a concrete schema gap, stop for review before making any schema or migration change.

## Testing plan

Use the existing temporary SQLite test pattern so tests do not touch the configured development database.

- First approval leaves the expense pending and does not create obligations.
- Final participant approval changes status once and applies the exact saved shares to group obligations.
- A participant rejection immediately rejects the expense and creates no obligations, including after earlier approvals.
- Creator decision succeeds only when the creator is a participant; a creator who is not a participant is denied.
- A group member who is not a participant, an unrelated nonmember, and an unauthenticated caller cannot decide.
- Verify the approved membership policy for a former participant.
- Repeated same decision, conflicting decision, decision on a finalized expense, direct expense, wrong/noncurrent revision, and unknown expense are handled consistently.
- Concurrent submissions cannot create duplicate decisions or apply the final balance projection twice.
- Balance overflow or another transaction failure rolls back the decision and status transition.
- Payer self-shares and zero-cent shares do not create self-obligations or zero-value pair obligations.
- Verify status and projection remain unchanged on rejection and incomplete approval.

## Instructor demonstration sequence

1. Create accounts for three group participants and one unrelated user. Create a group and add the participants.
2. Submit an expense with multiple participants. Show it as pending and show that no group obligation has been applied.
3. Sign in as each participant and approve in turn. Show that the expense remains pending until the final participant decision, then becomes approved; the service test verifies the resulting group projection.
4. Submit another expense and reject it from one participant. Show its rejected state and verify no obligation was added.
5. Attempt a decision as the unrelated user and as a group member who is not a participant; both should be denied.
6. Demonstrate creator self-approval only if the product owner confirms the proposed participant-only rule.

The current UI has no balance view, so Phase 5C can demonstrate balance effects through the approval service’s persisted group projection and automated tests without expanding into a later balance-view phase.

## Risks and decisions requiring approval

- Whether a creator who is also a participant may decide their own expense. Recommended: yes, as that participant; creator-only privilege is not granted.
- Whether a former participant may decide an exact pending revision after leaving the group. Database design proposes yes; current Phase 5B history behavior is active-member-only.
- Whether repeat decisions are idempotent or report “already decided”; conflicting decisions should remain prohibited.
- Whether rejected/pending expenses get a correction/reopen workflow. No such workflow is specified; recommended: submit a new expense.
- Financial projection updates need concurrency and overflow handling; tests must verify rollback and exactly-once application.

No unresolved issue currently appears to require a schema change.

## Read-only confirmation

No files or database contents were modified. No dependencies, migrations, or database commands were run. Nothing was staged, committed, or pushed. No work on Phase 5D or later phases was started.
