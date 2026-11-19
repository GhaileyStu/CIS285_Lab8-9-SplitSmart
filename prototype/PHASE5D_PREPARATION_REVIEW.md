# SplitSmart Lab 9 — Phase 5D Preparation Review
## Balance Calculation and Dashboard

**Repository:** `/workspaces/CIS285_Lab8-SplitSmart`  
**Branch:** `feature/splitsmart-prototype`  
**Status:** Read-only preparation; implementation is not authorized by this report.

## Repository status

The worktree was clean at inspection. No files were modified; no tests, migrations, or database commands were run.

## Files inspected

### Requirements and reports

- `UserRequirement.md`
- `specs/001-expense-sharing/spec.md`
- `prototype/SPLITSMART_DATABASE_DESIGN.md`
- `prototype/PHASE5A_EXPENSE_IMPLEMENTATION_REPORT.md`
- `prototype/PHASE5B_REVIEW.md`
- `prototype/PHASE5C_IMPLEMENTATION_REPORT.md`

### Schema, implementation, and tests

- `prototype/prisma/schema.prisma`
- `prototype/prisma/migrations/20261119000000_init/migration.sql`
- `prototype/src/features/phase5a/expenses/balance-projection.ts`
- `prototype/src/features/phase5a/expenses/create-expense.ts`
- `prototype/src/features/phase5b/groups/service.ts`
- `prototype/src/features/phase5b/expenses/history.ts`
- `prototype/src/features/phase5b/expenses/approvals.ts`
- `prototype/src/features/phase5b/ui/dashboard.tsx`
- `prototype/src/app/page.tsx`
- Existing Phase 5A expense creation tests, Phase 5B group/history tests, and Phase 5C approval tests.

Next.js resolves to 16.4.6; Prisma CLI and client resolve to 6.19.3.

## Confirmed financial model

`PairwiseObligation` is the persisted **current net balance projection** for a user pair within one `BalanceScope`. The design calls it rebuildable derived state, with immutable expense shares, approval decisions, reversal entries, and payments as the financial audit records. Phase 5D should read the projection for the current balance display; it should not recompute debts from expense forms or introduce another balance store.

The signed convention is explicit in the database design:

- `signedBalanceCents > 0`: the low-ID user owes the high-ID user.
- `signedBalanceCents < 0`: the high-ID user owes the low-ID user.
- `0`: the pair is settled.

For a pair `(low, high)` with signed amount `s`, display:

- If `s > 0`: **low owes high** `s` cents.
- If `s < 0`: **high owes low** `-s` cents.

For a current user’s group position, define positive as “others owe me” and negative as “I owe others.” For each pairwise row, the contribution is `-s` for the low-ID user and `s` for the high-ID user. Sum those contributions across pairs in that one group scope using `BigInt`. A member’s **owed to me**, **I owe**, and net position can also be shown as separate nonnegative totals.

A group’s useful outstanding total is the sum of `abs(s)` over its pairwise rows: each row represents one already-netted unordered pair, so count it once. The sum of all members’ net positions in a group should be zero. Do not sum group cards into a grand total when their currencies differ.

Approved group expenses update the group’s scope through the Phase 5C transaction. For every saved nonzero participant share except the payer’s own share, the participant owes that share to the payer. If the participant ID is low, the projection delta is positive; otherwise it is negative. A payer who participates has no self-obligation, and their own share is not redistributed to other members. Zero-cent shares create no obligation. The helper uses checked integer arithmetic.

Pending and rejected group expenses do not change the projection. Phase 5A leaves group expenses pending without approvals or pairwise updates. Phase 5C updates the group projection only when all current-revision participants approve; rejection finalizes the expense without applying obligations. The report and tests confirm this behavior.

`BalanceScope` identifies where balances belong:

- A group has one group scope, identified by its unique `groupId`, with the group currency.
- Direct expenses use a separate scope for the unordered user pair **and currency**. Direct balances must not be folded into group totals.
- Each dashboard value should retain its scope currency. There should be no implicit currency conversion or cross-currency summation.

The schema and migration also contain `Payment` and reversal models, but these workflows are not implemented yet. The documented future behavior is that payments reduce a pair’s signed balance in the recorded debtor-to-creditor direction, while reversals apply inverse deltas for each original non-payer, nonzero share. A reversal can move a pair balance through zero and change who owes whom. The projection rebuild design sums approved-expense deltas, reversal deltas, and payment deltas by scope and pair. Phase 5D should display the current projection so Phase 5E can update it transactionally without changing the dashboard’s source.

## Proposed Phase 5D experience

On the overview page, show one balance summary per active group, with that group’s currency, the signed position for the signed-in user, amounts they owe, amounts owed to them, and the group’s gross outstanding total. Do not show an all-groups total across different currencies.

When a member opens a group, show:

- A pairwise list that names the debtor and creditor and shows the amount in the group currency.
- The signed-in member’s owed-to-me, I-owe, and net position.
- A group outstanding total, defined as the sum of absolute pairwise net balances.
- A settled state when there are no nonzero pairwise balances.
- An empty state when there are no expenses or no group balance scope yet.
- Clear currency labels and no misleading zero-value debt rows.

Keep approved, pending, and rejected expense statuses visible in the existing history. Pending and rejected expenses should be explicitly labelled as having no balance effect. Approved expense history can help members understand the source activity, but the UI must not imply that an individual expense’s saved share equals the **current outstanding** debt: pairwise balances are netted and future payments/reversals can change them.

Use integer cents throughout; format only at the display boundary. A zero signed pair can be omitted from outstanding balances or shown as settled, but it must not be counted as debt.

## Proposed architecture

1. Add a server-side balance query service that reads `BalanceScope` and its `PairwiseObligation` rows. Reuse `listGroupsForUser` for active-group overview access and `requireActiveGroupMember` for group details.
2. Load all relevant group scopes in a bounded query for the overview, preserving each group’s currency. For a selected group, query that scope and include both users’ display names and membership status so former-member counterparties remain understandable.
3. Aggregate pairwise rows in application code with `BigInt`. Convert each signed value into a direction and positive display amount using the convention above. Derive the current user’s owed-to-me, I-owe, and net values from the pair rows.
4. Add a narrowly scoped former-member query that returns only pair rows involving that user and only for historical group relationships authorized under `MembershipPeriod`.
5. Add server-rendered overview and group-detail balance components. Keep the existing expense history alongside the balances, with status labels explaining which expenses are eligible to affect them.
6. Use route-level loading/error UI if needed for a slow or failed balance query. No Server Actions are needed for Phase 5D because it is read-only.

## Expected files to change

Likely files:

- **New** `prototype/src/features/phase5b/expenses/balances.ts` — authorized overview, group detail, and former-member pairwise queries.
- **New** `prototype/src/features/phase5b/ui/balance-dashboard.tsx` — group summary and pairwise balance presentation.
- `prototype/src/features/phase5b/ui/dashboard.tsx` — integrate overview summaries and selected-group balances.
- `prototype/src/app/globals.css` — responsive balance cards, pair rows, and empty/loading/error states.
- **New** `prototype/tests/phase5b/expenses/balances.test.ts` — isolated tests for service queries and calculations.
- Optionally **new** `prototype/src/app/loading.tsx` and `prototype/src/app/error.tsx` if route-level loading and query-error states are needed after implementation review.

No schema or migration change appears necessary. The existing scope and pairwise models already represent group and direct balances, including currency isolation.

## Testing plan

Use the existing disposable temporary SQLite pattern. Do not target the configured development database.

- Positive and negative signed values produce the correct debtor, creditor, and display amount for both ID orderings.
- Per-user owed-to-me, I-owe, and net values follow the stated formulas; all member positions sum to zero.
- Approved expenses affect balances; pending and rejected expenses do not.
- The payer’s own share creates no self-obligation; excluded payers receive the correct debts from all participants.
- Zero-cent shares and zero pair balances do not appear as outstanding obligations.
- Multiple expenses between the same pair use the existing net pair row exactly once, including when their directions offset.
- Group totals equal the sum of absolute nonzero pairwise net balances, not the expense total or a second aggregation of expense history.
- Separate groups with different currencies retain separate labeled summaries.
- Direct USD and CAD scopes for the same pair remain separate and are excluded from group balances.
- Active members can read authorized group balances; nonmembers cannot.
- Former-member reads contain only that user’s authorized pair rows and no group-wide totals or unrelated pair rows.
- Empty groups/scopes show zero or settled state without creating database rows.
- Existing Phase 5A, 5B, and 5C suites continue to pass.

## Risks and boundaries

- Pairwise projections are netted across expenses. The dashboard must not claim to show an individual expense’s remaining debt.
- A group can contain obligations involving deactivated members. Active members need to see those pair rows to understand the group’s outstanding state; former members should see only their own historical rows.
- Summing pair rows into user positions must use `BigInt`; do not use SQL floating-point sums or JavaScript `Number`.
- Payment and reversal behavior is documented but not implemented. Phase 5D should read the projection as it exists and avoid adding settlement logic.
- The current worktree was clean at inspection. The Phase 5C report records manual tests; the user reports those manual approval and rejection tests passed.
- No unresolved issue currently appears to require a schema change. Do not begin Phase 5E or later phases.

## Read-only confirmation

No files, dependencies, schema, migrations, or database contents were modified. No tests, migrations, or database queries were run. Nothing was staged, committed, or pushed. Await approval before implementing Phase 5D.
