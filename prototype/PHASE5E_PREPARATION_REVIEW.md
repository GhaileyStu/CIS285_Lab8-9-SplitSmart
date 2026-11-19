# SplitSmart Lab 9 — Phase 5E Preparation Review
## Payment Recording and Settlement

**Repository:** `/workspaces/CIS285_Lab8-SplitSmart`  
**Branch:** `feature/splitsmart-prototype`  
**Review mode:** Read-only preparation; payment functionality is not implemented.

## 1. Executive summary

The existing Prisma schema and initial SQLite migration already contain a Payment ledger, a unique idempotency key, immutable-history triggers, scope/pair checks, outstanding-balance validation, and a trigger that applies each inserted payment to `PairwiseObligation`. The approved database design describes how these pieces should be used. No schema or migration deficiency was found that blocks the specified Phase 5E payment workflow.

There is no payment service, Server Action, payment history query, payment UI, or payment test in the current application. Phase 5E therefore needs application code and tests, but must **not** add a second projection update: the existing `Payment_apply_to_pairwise_projection` SQL trigger already changes the balance when a Payment row is inserted.

The current signed convention remains: positive means low-ID owes high-ID; negative means high-ID owes low-ID. The database trigger checks the current direction and amount, then moves that signed amount toward zero. Group, direct-pair, and currency scopes remain separate.

One requirements conflict needs review: FR-008 and AC-013 require rejecting an overpayment, while the MVP summary table says overpayment handling is outside MVP. The approved database design and existing migration both implement the explicit FR/AC no-overpayment rule. Recommendation: follow FR-008/AC-013 and the existing trigger; confirm this interpretation with the instructor/product owner before implementation.

## 2. Repository status and verification

- Current branch: `feature/splitsmart-prototype`.
- Initial `git status --short --branch`: clean, tracking `origin/feature/splitsmart-prototype`.
- Prisma CLI: `6.19.3`; `@prisma/client`: `6.19.3` (`npx prisma --version`).
- `npx prisma validate`: passed; the current schema is valid.
- `git diff --check`: passed before this report was created.
- No Vitest tests were run for this read-only review.
- No database file was queried or modified; no migration was run.

## 3. Files and documents inspected

### Requirements, design, and phase reports

- `../UserRequirement.md`
- `../specs/001-expense-sharing/spec.md`
- `SPLITSMART_DATABASE_DESIGN.md`
- `PHASE5A_EXPENSE_IMPLEMENTATION_REPORT.md`
- `PHASE5B_REVIEW.md`
- `PHASE5C_IMPLEMENTATION_REPORT.md`
- `PHASE5D_IMPLEMENTATION_REPORT.md`
- `AGENTS.md`

### Schema, migration, configuration, and current code

- `prisma/schema.prisma`
- `prisma/migrations/20261119000000_init/migration.sql`
- `prisma/migrations/migration_lock.toml`
- `package.json`, `prisma.config.ts`
- `src/features/phase5a/expenses/balance-projection.ts`
- `src/features/phase5a/expenses/create-expense.ts`
- `src/features/phase5b/expenses/approvals.ts`
- `src/features/phase5b/expenses/balances.ts`
- `src/features/phase5b/expenses/history.ts`
- `src/features/phase5b/groups/service.ts`
- `src/features/phase5b/auth/session.ts`
- `src/features/phase5b/actions/expenses.ts`
- `src/features/phase5b/actions/groups.ts`
- `src/features/phase5b/ui/dashboard.tsx`
- `src/features/phase5b/ui/balance-dashboard.tsx`
- `src/features/phase5b/ui/submit-button.tsx`
- `src/app/page.tsx`, `src/app/globals.css`
- All current files under `tests/phase5a/` and `tests/phase5b/`

A search of `src/` and `tests/` found no payment implementation or payment-specific test. Existing application code includes Phase 5A direct-expense creation and group balance projection, Phase 5C approval actions, and Phase 5D group balance queries/UI.

## 4. Existing Payment schema and migration behavior

### Prisma `Payment` model

The current model has:

- `id`, `balanceScopeId`, `debtorUserId`, `creditorUserId`, and `recordedByUserId`.
- `amountCents BigInt`, `paymentDate`, and `createdAt`.
- `idempotencyKey String @unique` and `requestHash String`.
- Foreign keys to the scope and all three user relations, with `onDelete: Restrict`.
- Indexes for `(balanceScopeId, paymentDate)`, `(debtorUserId, creditorUserId, createdAt)`, and `requestHash`.

There is no `currencyCode` on Payment. Currency is inherited from its `BalanceScope`; this is appropriate because the scope is the financial and currency boundary. Group scopes are uniquely identified by group. Direct scopes are identified by canonical unordered user pair and currency, enforced in the migration using a partial unique index. A Payment row is not tied to an individual expense; it settles the current net pair obligation within one scope, as specified in the design.

The migration's Payment table checks `amountCents > 0` and the signed 64-bit maximum, requires debtor and creditor to differ, and requires `recordedByUserId = debtorUserId`. These checks enforce persisted row shape, but they do not prove who authenticated; the service must derive the actor from the session.

### Exact relevant SQL triggers

The migration contains these payment triggers:

1. **`Payment_validate_outstanding_obligation` — BEFORE INSERT.** It verifies that the scope exists and that the debtor/creditor belong to that scope. For DIRECT scopes both users must be the two scope users; the table check prevents them being the same person. For GROUP scopes both users must have a `GroupMembership` row for that group. It then requires the matching canonical pair row in that exact scope to have the correct signed direction and requires `amountCents` to be no greater than the current outstanding signed amount. The `BIGINT` minimum branch avoids negating the signed 64-bit minimum value.
2. **`Payment_apply_to_pairwise_projection` — AFTER INSERT.** It updates the matching `PairwiseObligation` in the same `balanceScopeId` and canonical pair. If debtor ID is low, it subtracts the payment amount from the positive signed balance. If debtor ID is high, it adds the amount to the negative signed balance. Both moves are toward zero.
3. **`Payment_no_update` and `Payment_no_delete`.** They reject any update or deletion of a payment row, preserving the immutable audit record.

Among the migration triggers, `Payment_apply_to_pairwise_projection` is the trigger that changes `PairwiseObligation` for payments. A search of the migration for pairwise writes found this single SQL projection update; expense projection writes are performed by application services. The Payment insert and trigger effects are part of the same SQLite statement/transaction: if insert validation or a later enclosing transaction fails, the ledger insert and trigger projection effect roll back together.

The Group trigger on `BalanceScope` keeps a group scope's currency consistent with the Group. Scope-identity protections also prevent changing a scope after financial records, including payments, use it. Payment itself cannot carry a separate currency value that could disagree with the scope.

### What the database does not enforce

- It does not authenticate the current request or establish that `recordedByUserId` came from the active session. It only checks that the stored recorder equals the stored debtor.
- The group trigger checks that membership rows exist, not that they are currently ACTIVE or that a historical MembershipPeriod is valid. This appears deliberate for historical settlements; the application must enforce the approved active/former-member access policy.
- It does not compute or validate the canonical `requestHash`, resolve repeated idempotency keys to their original result, or reject a reused key with a different request hash. The unique key only prevents a second insert with that key.
- It does not translate trigger/constraint errors into user-facing validation messages.
- It does not implement any UI or payment history query.

The database triggers and constraints are robust backstops. Application authorization, idempotency semantics, exact parsing, and error handling are still required.

## 5. Existing balance-projection behavior

`src/features/phase5a/expenses/balance-projection.ts` applies saved expense shares in integer cents. For each positive non-payer share it canonicalizes the user pair, adds a positive delta when the debtor is low-ID and a negative delta otherwise, and checks the signed 64-bit range before writing. Phase 5A direct-expense creation calls this helper for immediately approved direct expenses. Phase 5C calls it only after all participants approve a group expense. Pending and rejected group expenses do not update the projection.

Phase 5D reads `BalanceScope` and `PairwiseObligation` as current net state and keeps currencies/scopes separate. Its read service does not calculate payment deltas. The payment SQL trigger supplies that payment delta. The new payment service must not call `applyExpenseObligations` and must not separately update `PairwiseObligation` after inserting a payment; doing either would duplicate the projection effect.

## 6. Requirements coverage assessment

| Capability | Existing support | Phase 5E application work |
| --- | --- | --- |
| Record debtor, creditor, scope, amount, date | Payment model and FKs exist | Validate/load current scope and pair; insert immutable ledger row |
| Only authenticated debtor records payment | DB checks `recordedBy = debtor` only | `requireUser`; derive debtor/recorder from session; never trust submitted actor IDs |
| Correct group/currency scope | `balanceScopeId`; group/direct scope constraints and triggers | Resolve and authorize selected scope server-side; never accept a currency separate from its scope |
| Reject invalid/zero/negative amount | Migration rejects nonpositive/out-of-range cents | Strict decimal-to-cents parser and actionable validation messages; positive-only follows current DB rule |
| Prevent overpayment | BEFORE INSERT trigger validates direction and available signed amount | Use trigger as final authority; optional pre-read is only for clearer UI errors |
| Correct signed projection update | AFTER INSERT trigger moves signed balance toward zero | Do not add a second projection write |
| Separate groups, direct pairs, and currencies | Separate `BalanceScope` identity; payment references exactly one scope | Display and query each scope separately; no conversion or cross-scope aggregation |
| Atomic ledger/projection update | Trigger runs as part of Payment insert; enclosing SQLite transaction can include related application work | Keep idempotency handling and insertion in one transaction where appropriate; any failure rolls back |
| Idempotency | Unique key and request-hash field/index exist | Canonicalize/hash request; same key+same hash returns original; same key+different hash rejects |
| Concurrent payment safety | SQLite serializes writers; trigger checks current pair amount and updates in the insert statement | Rely on DB check, unique key, and insert/trigger atomicity, not a stale application pre-read; map/retry transient lock errors safely |
| Audit/history | Immutable Payment rows and date/user/scope fields/indexes exist | Add authorized payment-history query and display rows without editing/deleting them |
| Persisted UI result | No payment UI/query exists | Refresh from Payment rows and current projection; show success and updated balance |

## 7. Proposed payment workflow

1. The balance view lists current pairwise debts from the existing projection. Each row identifies the debtor, creditor, scope/group, and currency.
2. For an outstanding pair, render a payment form only when the signed-in user is the debtor. This is a usability affordance, not authorization.
3. Form fields should collect an amount (decimal text parsed exactly to integer cents) and payment date. The scope and creditor may be sent as identifiers, but the service reloads and verifies them. Debtor and recorder come only from the session. Currency is loaded from the scope.
4. Include a server-generated idempotency key in the rendered form so an identical retry of the submitted form reuses the key. The server constructs a canonical request hash from scope, debtor, creditor, amount, scope currency, and payment date.
5. In the service, authenticate/authorize, validate scope and pair, check the key first for idempotency, then validate and create the Payment row. On the same key and same hash, return the stored payment result; on the same key with a different hash, reject it.
6. A service-side balance pre-read may provide a friendly “amount exceeds outstanding” message, but cannot be the safety boundary. `Payment_validate_outstanding_obligation` must decide against the current signed amount at insert time. Handle its constraint failure as a safe validation/conflict response.
7. The `AFTER INSERT` trigger updates the projection. Do not perform another PairwiseObligation update. Return or redirect with a clear success notice and render the latest balance from the database.
8. Query payment history from the relevant scope, ordered by payment date and creation time, and show debtor, creditor, amount plus scope currency, and payment date. History remains immutable and available after refresh.

The model supports both GROUP and DIRECT scopes. The present UI exposes group expenses and group balances, but no direct-expense UI or direct-balance panel. To cover FR-008 consistently with the existing direct balance scopes, the recommended Phase 5E scope includes direct-scope settlement as a distinct personal pair view on the overview (or another existing authenticated overview area), without combining it with group balances. If the instructor intends Phase 5E to be group-only, that should be explicitly approved because the source requirement is generic and direct scopes already exist.

## 8. Authorization and security considerations

- Server Actions must call existing `requireUser()` and derive actor/debtor/recorder IDs from that authenticated user.
- Never trust `recordedByUserId`, debtor ID, claimed balance, or currency from form values. Validate any submitted scope and counterparty against database rows.
- For a GROUP scope, require active group membership for normal group payment display/actions. The database trigger only checks membership-row existence.
- The database design allows former participants to settle historical obligations. Reuse `MembershipPeriod` plus the authenticated user and exact pair row to grant only a narrowly scoped personal settlement operation; do not grant former members group-wide history or administration access. The exact permission proof should verify the member's recorded group history and current outstanding pair involves that user.
- For a DIRECT scope, only one of that scope's two users is eligible, and only when that session user is the current debtor. No group membership is applicable.
- Do not reveal another user's or a nonmember's group payment history through guessed scope/group IDs. Authorize every read and write in the service.
- Render a Pay action only for debtor rows, but enforce the same rules again in the service and rely on the database trigger for direction/amount.
- Use a server-generated/reused idempotency key per submitted form. A random new key on every retry would defeat idempotency; a client-provided key is not authorization and still needs canonical hash comparison.

## 9. Transaction, concurrency, and idempotency

- Insert Payment inside a Prisma transaction when the application also needs idempotency resolution or related state. SQLite's trigger executes in the same SQL statement and transaction as the insert; Payment row and pairwise adjustment cannot commit separately.
- Do not manually adjust the balance projection. The payment trigger does this exactly once per successful Payment insert.
- Check an existing idempotency key before balance validation so replaying an already-successful request returns its original result even though the balance has since decreased. Same key/different `requestHash` must be rejected.
- Handle concurrent same-key insertions using the unique key. On a uniqueness conflict, reload the stored row and compare canonical request hashes; return it only if they match.
- For different keys whose combined values would overpay, SQLite serializes writes and the trigger evaluates each insert against the then-current PairwiseObligation. At most the remaining amount may be committed. Treat transient SQLite busy/locked errors as retryable or report a safe retry; retries must reuse the original idempotency key.
- Keep all monetary values in BigInt cents. Check application intermediate/serialization limits against SQLite signed 64-bit bounds. The DB check and `amount <= current obligation` guard the projection movement toward zero.
- If insertion fails, the Payment row and trigger update roll back. Test an explicit failure after insertion within the enclosing transaction and confirm neither history nor projection retains the attempted write.

## 10. UI implementation plan

Reuse the Phase 5D group balance panel and expense history workspace:

- Add a Pay form/action to each pairwise row only for the debtor. It should show the exact amount owed, current currency, a positive amount input, and payment date. Partial payments are allowed; full payment may clear the outstanding row from the current-balance list.
- On an invalid, stale, already-settled, or over-limit request, return an actionable error without losing the user's location in the group view.
- On success, show a confirmation and reload the current projection so the debtor/creditor balances and group outstanding total are updated.
- Add payment history to the group workspace, separate from expense history. Distinguish historical payment events from the current net pairwise balance; multiple payments can be recorded for a pair.
- Add a separate direct-scope personal balance/history presentation on the overview if all existing direct scopes are in scope. Only show the signed-in user's own pair; preserve the scope currency and never merge it with group totals.
- Former participants see only their own authorized historical debt and related payment records/actions, consistent with the already narrow Phase 5D former-personal balance view.
- Use existing `notice`/`error` query feedback and `SubmitButton` patterns; retain responsive styles.

## 11. Automated and manual testing plan

Use disposable temporary SQLite files created from the checked-in migration, as existing Phase 5A–5D tests do. Never run database tests against the configured development database.

### Automated cases

1. Valid partial payment for a low-ID debtor reduces a positive signed balance by exactly the cents paid.
2. Valid full payment settles the row to zero; high-ID debtor adjusts a negative balance toward zero.
3. Reject malformed decimal strings, excessive precision, zero, negative, missing, nonnumeric, and signed-64-bit-overflow amounts.
4. Reject an amount above current outstanding; assert neither Payment nor projection changes.
5. Reject a creditor, unrelated user, unauthenticated session, or submitted fake actor attempting to record the payment.
6. Reject mismatched group, scope, debtor/creditor pair, wrong direct pair, or wrong currency context.
7. Verify group and direct payments update only their exact scope, and different currencies remain separate.
8. Same idempotency key and same canonical hash returns the existing Payment and changes projection once; same key with a different hash rejects.
9. Concurrent duplicate same-key requests produce one row and one projection effect.
10. Concurrent distinct-key requests whose combined amount exceeds the debt cannot overpay; final signed amount never crosses zero because of those requests.
11. Force a post-insert transaction failure and verify both Payment row and trigger-updated pair projection roll back.
12. Payment rows cannot be updated or deleted; audit dates, actors, scope, and amount remain queryable.
13. Payment history query returns stored payments after a fresh service query (the automated analogue of persistence after refresh).
14. Active group-member history is authorized; nonmembers are denied. Former users can settle only a qualifying historical pair involving themselves and cannot see group-wide history.
15. Existing Phase 5A–5D suites continue to pass; no projection helper regression or duplicate update occurs.

### Manual browser checks after implementation

1. Record a partial payment as the debtor; verify success, reduced pair amount, and updated group/direct totals.
2. Complete the remaining amount; verify the pair is settled/omitted while both payment events remain in history after page refresh.
3. Try zero, negative, malformed, over-precision, and overpayment amounts; confirm clear errors and unchanged balances/history.
4. Sign in as the creditor and a third party; verify no authorized payment form/action succeeds for either.
5. Test duplicate-submit/retry behavior and confirm the payment appears once.
6. Submit concurrent payments whose combined value exceeds one debt and verify no overpayment.
7. Verify separate group, direct, and currency scopes; use an inactive former participant only for their qualifying historical debt and confirm they cannot access general group data.
8. Confirm pending/rejected expense amounts cannot be paid because they are absent from the current outstanding projection.

No tests or browser verification were run for this preparation review.

## 12. Risks, unresolved decisions, and schema assessment

### Requirements conflict

The detailed specification's FR-008 and AC-013 explicitly require no overpayment. Its MVP scope table also says overpayment handling is outside the MVP. The approved design and existing trigger enforce the former. Recommended rule is to honor FR-008/AC-013 and the trigger, pending instructor confirmation.

### Amount policy

The source does not settle whether zero or negative payment inputs should be accepted. The approved design called positive-only amounts a prototype default, and the checked-in migration already enforces `amountCents > 0`. Phase 5E should therefore require a positive amount unless a schema/design change is separately approved.

### Direct scope coverage

Direct scopes exist and payment triggers support them, but there is no direct-expense UI or direct-balance UI today. Confirm that Phase 5E should expose direct-scope settlement, as recommended here, rather than group-only payments.

### Immutable payment correction

The migration intentionally forbids Payment update/delete, but the current schema has no payment-reversal/correction event. A mistaken committed payment cannot be edited or removed. The requested payment workflow does not require correction functionality, so this is not a blocker or reason for a Phase 5E schema change. Decide a future audited correction policy before exposing administrative correction capability.

### Schema and migration sufficiency

The Payment model, scope relationship, constraints, indexes, idempotency fields, immutable-history triggers, outstanding-debt validation trigger, and projection-update trigger cover the requested Phase 5E payment operation. No schema or migration change is currently justified. The major implementation risk is duplicating `Payment_apply_to_pairwise_projection` in application code or relying on a stale pre-read instead of the trigger's current-balance check.

## 13. Recommended Phase 5E implementation scope

Subject to review of the overpayment conflict and direct-scope scope decision:

- Add a payment service, for example `src/features/phase5b/expenses/payments.ts`, for scope authorization, exact input parsing, canonical idempotency/hash handling, immutable Payment insertion, and authorized payment-history reads.
- Add `src/features/phase5b/actions/payments.ts` for session-derived Server Actions, validation feedback, success redirects, and no submitted actor identity.
- Extend `src/features/phase5b/expenses/balances.ts` to provide the IDs/scope data needed for debtor-only forms and authorized payment history; add direct personal-scope queries if approved.
- Extend `src/features/phase5b/ui/balance-dashboard.tsx` and `src/features/phase5b/ui/dashboard.tsx` with debtor payment forms, payment history, updated balances, and direct personal balances if approved.
- Extend `src/app/globals.css` only for the added payment forms/history and responsive states.
- Add isolated tests, likely `tests/phase5b/expenses/payments.test.ts`, using the temporary SQLite pattern and exercising the actual SQL triggers.
- Later, if implementation is authorized, write `PHASE5E_IMPLEMENTATION_REPORT.md` with actual results.
- Do not change schema, migrations, Prisma versions, auth/Codespaces configuration, or balance projection helper unless new evidence demonstrates a concrete deficiency and the user separately approves that change.

## 14. Read-only confirmation

This review did not modify application source, Prisma schema/migrations, dependencies, configuration, or the SQLite database. No database query, migration, reset, or write was run. No tests were run. No commit or push was made. The only planned file mutation is this requested preparation report. Stop here pending explicit authorization for Phase 5E implementation.
