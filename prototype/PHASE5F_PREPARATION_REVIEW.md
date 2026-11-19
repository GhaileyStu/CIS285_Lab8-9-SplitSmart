# SplitSmart Lab 9 — Phase 5F Preparation Review
## Reports and Date Filtering

**Repository:** `/workspaces/CIS285_Lab8-SplitSmart`  
**Branch reviewed:** `feature/splitsmart-prototype`  
**Review mode:** Read-only preparation. Phase 5F was not implemented.

## 1. Executive summary

The current prototype has the underlying records needed for useful expense and payment reports: current expense revisions with dates, statuses, shares and approvals; immutable payments with payment dates and scope IDs; group and direct `BalanceScope` records; and the current `PairwiseObligation` projection. The completed Phase 5A–5E work already provides expense creation, approval decisions, authorized group history, balance views, and payment history. A focused server-side report query service and a responsive date-filtered report view can reuse these services and existing records. No schema change is presently required for current-state, period-activity reports.

The source specification requires expense, balance, and payment summaries with a date range and empty results with zero totals. It does not settle timezone behavior, additional report parameters, or the meaning of a “balance report” over a historical date interval. In particular, `PairwiseObligation` is the current net projection, not a dated ledger snapshot. The report should label current balances as “current as of now,” independently of the selected period, unless an audited historical-balance reconstruction is specifically approved.

Approved expenses may contribute to approved expense totals. Pending and rejected expenses should remain visible in their respective status sections but must contribute zero to settled financial totals. Payment totals should be reported separately from expense totals and by scope/currency; neither should be combined across currencies or used to imply that expense totals equal current debts.

## 2. Repository and starting status

- Current branch: `feature/splitsmart-prototype`.
- The branch started with this untracked Phase 5F review draft. The existing draft was revised in place. Git reported no other pending changes at the start of this review.
- Prisma CLI/client are recorded as 6.19.3 by the Phase 5E implementation report; no dependency command or migration was run for this read-only review.
- A read-only SHA-256 query at the start of this review returned `63a7e7c91395c5a40498fa3acb1e43e4fa8460fe566d5943029f2415bc22d026` for `prisma/dev.db`. No database write, reset, or migration was performed. This differs from the `6f135198f33062039722007cf1ff23f65994bd1786d27053f64a4a7c218da057` value recorded in the existing Phase 5E implementation report. The sampled file already differed from the historical implementation checksum when this review began. The checksums alone do not establish why.

## 3. Files and documents inspected

Requirements and phase reports:

- `../UserRequirement.md`
- `../specs/001-expense-sharing/spec.md`
- `SPLITSMART_DATABASE_DESIGN.md`
- `PHASE5A_EXPENSE_IMPLEMENTATION_REPORT.md`
- `PHASE5B_REVIEW.md`
- `PHASE5C_IMPLEMENTATION_REPORT.md`
- `PHASE5D_IMPLEMENTATION_REPORT.md`
- `PHASE5E_PREPARATION_REVIEW.md`
- `PHASE5E_IMPLEMENTATION_REPORT.md`
- `AGENTS.md`

Current schema, service, UI, route, and tests reviewed:

- `prisma/schema.prisma`
- `src/features/phase5a/expenses/allocation.ts`
- `src/features/phase5a/expenses/create-expense.ts`
- `src/features/phase5a/expenses/balance-projection.ts`
- `src/features/phase5b/expenses/history.ts`
- `src/features/phase5b/expenses/approvals.ts`
- `src/features/phase5b/expenses/balances.ts`
- `src/features/phase5b/expenses/payments.ts`
- `src/features/phase5b/groups/service.ts`
- `src/features/phase5b/auth/session.ts`
- `src/features/phase5b/actions/expenses.ts`
- `src/features/phase5b/actions/payments.ts`
- `src/features/phase5b/ui/dashboard.tsx`
- `src/features/phase5b/ui/balance-dashboard.tsx`
- `src/features/phase5b/ui/submit-button.tsx`
- `src/app/page.tsx`, `src/app/loading.tsx`, `src/app/error.tsx`, and `src/app/globals.css`
- Existing test files under `tests/phase5a/` and `tests/phase5b/`

No source code, schema, migration, dependency, configuration, or database file was modified as part of this preparation review.

## 4. Source requirements and confirmed behavior

`UserRequirement.md` asks for expense, balance, and payment reports with custom date ranges. Specification FR-009 and User Story 6 call for expense, balance, and payment summaries; a valid date range and report parameters must restrict returned records and totals; an empty matching range must return empty results and zero applicable totals. The specification also says invalid date ranges are rejected and report data must respect group membership and personal access. Its MVP scope table says parameters beyond date range are outside the MVP.

The completed application behavior relevant to reports is:

- Phase 5A persists each expense as a revision with `expenseDate`, `amountCents`, `currencyCode`, `balanceScopeId`, payer, and saved shares. Allocation is calculated once and saved.
- Phase 5B supplies session checks, active-group selection, and the group expense workspace. `listGroupExpenses` checks active membership, then loads all revisions and selects `currentRevisionNumber` in memory. It orders by expense creation and has no date predicate.
- Phase 5C stores decisions against the revision and transitions group expenses to APPROVED only when all participants approve, or REJECTED immediately after a rejection. Approval timestamps are recorded per participant. Current expense status is a projection; pending and rejected expenses do not affect the pairwise balance projection.
- Phase 5D reads group-scoped `PairwiseObligation` records as the current net balance source. Its signed convention is positive for low-ID owing high-ID and negative for high-ID owing low-ID. Direct scopes and currencies remain separate.
- Phase 5E records immutable payments by `paymentDate`, `amountCents`, and `balanceScopeId`; the SQL trigger applies each inserted payment to the current pairwise projection. Payment history and expense history already have authorized service queries.
- Active group membership gates full group history and balance detail. Direct payment history checks both the scope endpoints and the payment parties. Payment history sorts by effective date and creation time with no range filter. Former-member payment history checks inactive membership with a closed period and matches the viewer to a payment party, without comparing row dates to membership periods. The existing former-participant decision view grants access to specific pending revisions only.

## 5. Financial report calculation proposal

### Expense report

Filter the current revision by `ExpenseRevision.expenseDate` using the selected inclusive calendar start and end dates, after converting them to a validated instant range under the approved timezone rule. Include current status and saved shares for explanation.

- Show APPROVED, PENDING, and REJECTED expense rows in distinct status groups or with clear status labels.
- Only APPROVED rows contribute to settled expense totals. PENDING and REJECTED rows contribute zero to those totals while remaining visible as activity.
- Sum saved `amountCents` as `BigInt`, grouped by currency and financial scope. A group report uses only that group's GROUP scope. A personal direct report uses only authorized DIRECT scopes involving the signed-in user.
- Do not recalculate allocations from the original expense form. Display saved shares where authorized, but do not label an individual share as the current debt.
- Match the revision to the parent expense ID and current revision number before counting it. Use the revision’s immutable scope. An in-range older revision must produce no row when the current revision moved outside the range. Apply scope and date predicates in the database. If the Prisma query shape cannot compare parent and child revision numbers directly, retrieve authorized in-range candidates with the parent current pointer and discard mismatches before counting or paginating, or use a parameterized join.

The proposed total is gross approved expense amount in the selected period, evaluated with current status. A later approval can change a past period’s result. For personal direct reports, label gross spending as joint activity and optionally show the viewer’s saved share and amounts they paid upfront as separately labeled measures. Payments remain their own totals, with sent and received subtotals labeled for personal views. If reversed records exist, show the reversal and its replacement as linked activity. For the first pass, label the total “Gross approved expenses” and disclose that it includes reversed originals. An effective-spend total requires a decision on reversal period and replacement treatment.

### Payment report

Filter Payment rows by `Payment.paymentDate`, and group totals by exact `BalanceScope` and currency. Report payment amount, debtor, creditor, effective date, and scope. Count each immutable payment ID once, including when idempotent retries occurred. A backdated payment belongs to its entered date while its balance effect occurs when inserted. Sum amounts with `BigInt`. Do not aggregate group and direct scopes together, and do not infer an expense-specific payment allocation: payments settle a pairwise scope obligation, not an individual expense.

### Balance summary

The current pairwise projection can be displayed as a separate current snapshot with its as-of time and currency/scope labels, not as a balance “during” or “at the end of” the selected activity period. Existing signed-balance conversion rules from Phase 5D apply. A historical end-of-period balance would require replaying approved expense and payment events and accounting for approval timing, reversals, and revisions; it must not be represented by filtering the present projection or by summing period expense/payment totals.

All aggregation and comparison arithmetic remains `BigInt`. Convert to formatted exact strings at the server-to-UI boundary. Never use JavaScript `Number` to sum cents. Keep every currency and group/direct scope independently labeled; provide no cross-currency grand total.

## 6. Date-filtering policy

- Use two inclusive `YYYY-MM-DD` calendar inputs. A same-day range is valid. Require both dates for a submitted report and reject malformed, impossible, repeated, partial, or reversed inputs. Use a start-inclusive and next-day-exclusive instant interval with `gte` and `lt`. Keep the initial view at the date picker until a range is submitted.
- Recommend UTC calendar days for this prototype. Expense date inputs submit date-only strings that the service parses with `new Date`, while the service can also accept timestamp-bearing values. Payments use date-only input and history renders in UTC. Existing date-only records stored at UTC midnight must still display and filter under their entered day. Confirm the UTC exception to the design’s proposed viewer-local rule. If viewer-local reporting is selected, specify an IANA timezone source, preserve date-only semantics for existing records, and construct the next local midnight by calendar arithmetic across daylight-saving changes.
- Filter by `ExpenseRevision.expenseDate` and `Payment.paymentDate`. Use creation time and ID as stable ordering tie-breakers. Show approval status as of report generation. Treat creation time as audit metadata and confirm whether backdated or future-dated payment activity should have separate reporting rules.

## 7. Proposed reporting UX and workflow

Add a dedicated `/reports` route linked from the signed-in dashboard and selected group workspace. Reuse the existing panel and card styles. A dedicated route lets report navigation load its own data without fetching the dashboard’s full histories.

1. Select report context: one authorized group, or “My direct expenses and payments.” Do not offer a group-wide former-member report.
2. Enter start and end dates with a GET filter form so links are bookmarkable and refresh/navigation re-runs the server query.
3. Validate date format and ordering on the server. Show the selected range and the applied timezone policy.
4. Present separate tabs/sections for Expenses, Payments, and Current balances. Do not label the current balance snapshot as date-filtered.
5. The expense section shows approved totals by currency, plus pending and rejected rows in separate visible status sections with no effect on settled totals.
6. The payment section shows sums and history separately by group/direct scope and currency.
7. Provide a zero-total empty state when no records match, a loading state during route navigation, and a retryable error state using the existing route-level conventions.
8. Keep tables/cards horizontally usable on small screens and preserve clear labels for date, status, currency, debtor, creditor, and amount.

No CSV/PDF export, receipt access, payment recording, balance mutation, notification, or new filter beyond date/context/status visibility is included unless separately authorized. Status visibility is an essential expense grouping; extra filtering by payer, participant, description, or category is a product decision and beyond the MVP baseline.

## 8. Proposed architecture and authorization

Create a read-only server-side service, tentatively `src/features/phase5b/expenses/reports.ts`, that accepts the authenticated user ID, a discriminated report scope, and validated date bounds. It should use bounded Prisma queries and aggregate `BigInt` amounts in application code without loading unrelated groups.

- Derive the user ID from `requireUser()` at the route boundary. Never accept a user ID as a URL/form authorization selector.
- For a GROUP report, verify active membership with existing `requireActiveGroupMember()` before querying any report rows. Scope all reads to that group's group `BalanceScope` and group ID.
- For personal DIRECT reports, query only direct scopes where the authenticated user is one of the scope's endpoints, then only expenses/payments in those exact scopes. Existing direct expense access rules should also be respected for which expense rows are disclosed.
- For personal group-history reports, follow existing group history restrictions. Active members may query the full history of their group. For the proposed first pass, keep former-member reports out of the new route and retain the existing dashboard views. The approved design describes historical access through a membership period and the creator, payer, or participant relationship. Before offering former-member reports, settle which immutable revision creation timestamp must fall in a membership period, how post-departure revisions are handled, and how to attribute subsequent settlements when a payment can cover several expenses in a pair. A user-entered date cannot confer access.
- Return only display-ready amounts/strings to client-rendered components where BigInt serialization is a concern. Prefer server-rendered output and typed server data.
- Keep the service read-only. Reuse saved revisions, shares, approvals, payment rows, and the current projection; do not create a new ledger or balance table.

## 9. Exact files expected to change

Expected implementation scope, subject to repository structure review at authorization:

- **Create** `src/features/phase5b/expenses/reports.ts` — date validation, bounded authorized report queries, exact aggregation, and presentation data shaping.
- **Create** `src/features/phase5b/ui/report-dashboard.tsx` — date range/context controls and report tables/cards/empty state.
- **Create** `src/app/reports/page.tsx` — authenticate, parse GET filters, load authorized contexts and render reports.
- **Create** `src/app/reports/loading.tsx` and `src/app/reports/error.tsx` — report-specific navigation status and retry boundary. The checked-in root boundaries use balance-specific messages.
- **Modify** `src/features/phase5b/ui/dashboard.tsx` — link to Reports and carry the selected group into the report URL.
- **Modify** `src/app/globals.css` — responsive report filters, status sections, and report summaries.
- **Create** `tests/phase5b/expenses/reports.test.ts` — temporary SQLite service tests initialized from checked-in migration SQL.

No Prisma model, schema, migration, package/dependency, authentication, Codespaces Server Actions, expense allocation, approval, payment, or projection changes are expected.

## 10. Automated test plan

Use the existing disposable SQLite test fixture pattern, initialize only temporary files from checked-in migration SQL, and never point tests at `DATABASE_URL` for the configured development DB.

1. Valid start/end dates include the intended boundary records; a reversed, malformed, or impossible date returns a clear validation error.
2. Date boundary semantics are consistent and deterministic under the approved timezone rule, including daylight-saving transitions if viewer-local dates are selected.
3. Approved expenses appear and contribute the exact `BigInt` totals; pending and rejected expenses are visible but excluded from settled expense totals.
4. Current revision is counted once. Test both directions of a date-changing revision crossing the filter boundary, plus later approvals and linked reversal/replacement display.
5. Expense totals and saved-share displays use exact integer-cent arithmetic and format without floating-point drift.
6. Payments are filtered by `paymentDate`, are counted once, and totals remain separate by scope and currency.
7. USD and CAD (and other configured currencies) are never combined. GROUP and DIRECT scopes remain separate even for the same users and currency.
8. Current balance snapshot uses signed Phase 5D pairwise rules and is clearly separate from selected-period totals.
9. Active group members can report only on their group; nonmembers, unauthenticated users, and unrelated direct users are denied.
10. Former-member report access cannot expose group-wide expenses, payment history, or other members' rows through the narrow personal balance/payment exception.
11. Personal direct reports contain only rows from scopes involving the signed-in user.
12. Empty date ranges return zero totals and empty result lists.
13. Exact filtering of approved/pending/rejected statuses and group/direct/currency choices.
14. Cover a sum beyond signed SQLite 64-bit range across individually valid rows and verify exact formatted output.
15. Run the existing Phase 5A–5E suites, lint, type-check, and production build during implementation. Exercise representative combinations for SC-005’s 100-request accuracy target.

These tests are planned only; no tests were run during this read-only preparation review.

## 11. Manual browser test plan

1. Sign in as an active group member. Run one-day and multi-day reports against known fixtures with activity on both edges and just outside the range. Compare rows and totals with the fixture values. Reload and exercise browser back/forward to verify the filter URL.
2. Verify that pending and rejected rows stay visible while contributing zero. Approve a pending fixture, rerun the report, and confirm the approved total changes. Record a payment in a disposable environment and verify its period total and the current balance independently, including a backdated payment.
3. Switch to personal DIRECT reporting. Verify two currencies and multiple counterparties remain distinct, and compare sent and received payments against the fixture. Try a different group’s URL as a nonmember, as a former member, and while signed out. Verify no unauthorized rows or totals appear.
4. Check an empty range, a reversed range, a malformed URL, throttled navigation, and a simulated server error followed by retry. Verify readable labels, keyboard access, visible focus, and usable rows and date inputs at mobile and desktop widths.

## 12. Risks, decisions, and blockers

### Decisions needed before implementation

1. **Timezone:** the database design proposes viewer-local calendar dates converted to UTC start-inclusive/end-exclusive timestamps, but explicitly leaves the timezone source open. Decide whether the prototype should use a fixed configured timezone (for example UTC) or a user/browser timezone. The schema has no per-user timezone field.
2. **Balance semantics:** choose whether Phase 5F shows only a current balance snapshot beside date-filtered activity (recommended and supported) or requires historical as-of balances. Historical balances need a separately specified event-replay algorithm and treatment of approvals/reversals/revisions; the present `PairwiseObligation` projection alone cannot answer it.
3. **Report ownership:** confirm whether personal reports are limited to direct scopes plus active-member group reports (recommended) or whether former members should receive a narrow personal group activity report. Existing policy only grants former members their personal balance/payment rows, not group expense history.
4. **Date field semantics:** proposed filtering is by `ExpenseRevision.expenseDate` and `Payment.paymentDate`, not creation timestamps. Confirm whether report dates mean activity/effective date or system-recorded date.
5. **Parameters:** MVP specifies date ranges; status visibility is required for pending/rejected clarity. Additional filters, downloads, and exports remain outside scope absent approval.

### Requirements ambiguity

The detailed spec requires expenses, balances, and payments in reports, but the MVP scope says extra report parameters are outside the MVP. It does not define whether pending/rejected expenses should appear in a report, although this task explicitly requires that visibility. This plan shows them separately and excludes them from financial totals.

### Schema assessment

The existing schema is sufficient for current approved-expense summaries, status visibility, payment-period summaries, and current balance snapshots. No schema change appears necessary for the recommended scope. It is insufficient by itself to provide a historically reconstructed balance as of a past date because `PairwiseObligation` stores only the current projection. Expense revision dates, payment dates, approval timestamps, reversals, and immutable source rows could support a replay design, but that algorithm and correction semantics require a separate explicit decision. This is a scope/semantics question, not an authorization to alter schema.

## 13. Verification and completion boundary

This was a read-only preparation review. No application source, schema, migration, dependency, configuration, or database contents were modified. No tests, migration, reset, or build were run as part of the review. Only the Phase 5E implementation report and this Phase 5F preparation review were edited. No file was staged, committed, or pushed. Phase 5F is not implemented, and Phase 5G was not started.

**Recommended next step:** review the timezone, current-versus-historical balance, former-member report access, and date-field decisions above. Once settled, authorize Phase 5F implementation separately.
