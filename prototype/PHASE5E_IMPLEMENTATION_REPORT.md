# Phase 5E Implementation Report — Payments and Settlement

**Status:** Implemented; automated verification complete. Manual browser verification remains outstanding.
**Date:** November 19, 2026
**Scope:** Phase 5E only. No Phase 5F or Phase 5G work was started.

## Implemented functionality

- Added payment recording for GROUP and DIRECT `BalanceScope` obligations.
- Added partial and full payment forms, separate direct-balance summaries, and authorized payment history to the existing balance dashboard.
- Payment amounts are parsed exactly into integer cents with `BigInt`. Zero, negative, malformed, excess-precision, and out-of-range values are rejected.
- Payment date and idempotency key are validated server-side. A canonical request hash includes the verified scope, debtor, creditor, amount, currency, and date.
- Same-key/same-request retries return the original payment. Reuse of a key for a different request is rejected. Unique-key races reload and compare the stored payment.
- Payment history is read through scope-authorized queries. Group history is available to active members; former members receive only personal rows involving their own pairwise obligations. Direct views are scoped to the authenticated user's pair rows.
- Pending and rejected expenses are not payable: the payment service operates on the current outstanding pairwise projection, which is updated only by approved expense projection and payment triggers.

## Authorization and security

The Server Action calls the existing `requireUser()` session function and passes that authenticated ID as the actor. It does not trust submitted actor, debtor, recorder, or currency values. The debtor is always the authenticated actor.

For group payments, the service verifies the group `BalanceScope`, the precise debtor/creditor pair, currency-bearing scope, and membership. Active membership is required for normal group payments. The existing narrow historical membership policy permits a former member to settle only an outstanding pairwise obligation that involves that user; it does not grant group-wide history or administration access.

For direct payments, the service checks the precise direct scope and pair and requires the authenticated user to be the debtor. It does not merge direct balances into group totals. Payment-history reads receive the same scope-level authorization checks as writes.

The database remains the final authority for whether an obligation is still outstanding and whether the amount exceeds it. A service pre-read is used for useful feedback but is not treated as an overpayment lock.

## Idempotency, transactions, and balance updates

The rendered form receives a stable per-form idempotency key. Retries of that form reuse the same key. A Prisma transaction wraps the idempotency check and payment insert. A concurrent unique-key conflict reloads the existing row and compares its request hash; a matching request returns the prior result, while a different request fails.

**The payment service never updates `PairwiseObligation`.** The checked-in SQLite migration's `Payment_apply_to_pairwise_projection` `AFTER INSERT` trigger applies the payment to the existing signed pair row in the same database operation. The migration also validates the scope and pair, positive amount and signed 64-bit range, and current outstanding amount before insertion. `Payment_no_update` and `Payment_no_delete` preserve the payment ledger. No expense allocation or projection helper is called by payment recording.

The signed convention is preserved: for `(low, high)`, positive means low owes high and negative means high owes low. The trigger reduces the existing obligation according to the authenticated debtor's position in that pair. A transaction/trigger failure prevents a successful payment row and corresponding projection update from being committed independently.

## Files created and modified

Created:

- `src/features/phase5b/expenses/payments.ts` — exact amount parsing, payment service, authorization, idempotency, and history queries.
- `src/features/phase5b/actions/payments.ts` — authenticated Server Action and success/error redirects.
- `tests/phase5b/expenses/payments.test.ts` — isolated SQLite service and trigger tests.
- `tests/phase5b/expenses/payment-actions.test.ts` — Server Action authentication and input-boundary tests.
- `PHASE5E_IMPLEMENTATION_REPORT.md` — this report.

Modified:

- `src/features/phase5b/expenses/balances.ts` — carries the verified pair/scope identifiers and exact amount input needed by payment forms.
- `src/features/phase5b/ui/balance-dashboard.tsx` — group/direct payment forms, success/error feedback, balances, and payment history.
- `src/features/phase5b/ui/dashboard.tsx` — loads and presents separately scoped group and direct payment information.
- `src/app/globals.css` — responsive payment form, direct balance, and payment history styles.

The pre-existing untracked `PHASE5E_PREPARATION_REVIEW.md` was preserved. No schema, migration, package manifest/lockfile, Next.js configuration, or database file was changed.

## Automated verification

Actual commands and results:

| Command | Result |
| --- | --- |
| `npx vitest run tests/phase5b/expenses/payments.test.ts tests/phase5b/expenses/payment-actions.test.ts` | Passed: 2 files, 25 tests |
| `npx vitest run` | Passed: 9 files, 80 tests. Includes existing Phase 5A–5D regression suites and Phase 5E tests. |
| `npm run lint` | Passed |
| `npx tsc --noEmit` | Passed |
| `npx prisma validate` | Passed; schema valid |
| `npm run build` | Passed; Next.js 16.4.6 with Turbopack compiled and generated the production build. |
| `git diff --check` | Passed |
| `npx prisma --version` | Prisma CLI and client both 6.19.3 |

The payment tests exercise partial and full payments in both user-ID orderings, exact signed deltas, malformed/zero/negative/over-precision/overflow amounts, overpayment, unrelated and unauthorized users, group/direct scope separation, currency isolation, idempotent retries and conflicts, concurrent duplicate requests, concurrent distinct requests, trigger-enforced overpayment prevention, rollback, immutable history, and authorized historical reads. Tests use disposable temporary SQLite databases initialized from the checked-in migration; they do not target the configured development database.

## Database and repository safety

The development database SHA-256 before work was:

`6f135198f33062039722007cf1ff23f65994bd1786d27053f64a4a7c218da057`

The after-work SHA-256 was identical:

`6f135198f33062039722007cf1ff23f65994bd1786d27053f64a4a7c218da057`

No migration or reset command was run. Prisma validation was read-only. No dependencies were installed or upgraded. Prisma remains 6.19.3. No commits or pushes were made.

## Manual browser verification

Not performed during this implementation. After starting the development server, sign in as the debtor through the application and verify:

1. A group debtor sees a payment form only for their own outstanding pairwise obligations; another group member does not see a payment form for that pair as creditor.
2. Submit a partial amount and confirm the remaining balance decreases by exactly that amount after redirect/refresh.
3. Submit the remaining amount and confirm the pair is settled and no further payment form is available.
4. Verify zero, malformed, excess-precision, and overpayment submissions show useful errors and do not create an extra payment.
5. Verify payment history shows date, debtor, creditor, amount, and the scope currency.
6. Repeat the equivalent checks for a DIRECT scope and confirm it remains separate from group totals.
7. Refresh the page and confirm the updated balances and immutable payment history persist.

No manual browser result is claimed. Automated tests do not replace these browser checks.

## Manual Browser Verification

**Evidence type:** User-reported manual browser observations. The following results were confirmed by the user as matching expectations.

- Before the payment, TestUser2 owed TestUser1 **USD 145.00**.
- TestUser3 owed TestUser1 **USD 30.00**.
- Initial group outstanding was **USD 175.00**.
- TestUser2 successfully recorded a **USD 20.00** payment.
- Afterward, TestUser2's remaining debt was **USD 125.00**; TestUser3's debt remained **USD 30.00**; group outstanding was **USD 155.00**.
- Payment history displayed one **USD 20.00** payment.
- The payment form appeared for the debtor and not for the creditor.
- The user confirmed the displayed results matched expectations.

These observations do not establish manual testing of overpayments, duplicate submissions, direct payments, or unauthorized submissions; no such manual checks are claimed.

## Known limitations and remaining work

- Browser testing has not yet been performed.
- SQLite's trigger and transaction behavior is covered by the temporary-database tests; no production multi-process load test was run.
- The project has no payment editing or deletion workflow; this is intentional for the immutable payment ledger.
- This report does not claim that Lab 9 is complete. Phase 5F and Phase 5G remain out of scope.

## Completion confirmation

Phase 5E payment recording and settlement UI/service work is implemented and automated verification passed. The existing schema and migration were reused without modification, the payment trigger remains the sole projection updater for payment inserts, the development database hash is unchanged, the preparation report and prior work were preserved, and no commit or push was made. Stop here pending further authorization.
