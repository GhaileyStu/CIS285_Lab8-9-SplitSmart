# SplitSmart Lab 9 — Phase 5D Implementation Report
## Balance Calculation and Dashboard

**Repository:** `/workspaces/CIS285_Lab8-SplitSmart`  
**Branch:** `feature/splitsmart-prototype`  
**Result:** Phase 5D implemented; later phases were not started.

## Summary

The dashboard now reads current group balances from the persisted `BalanceScope` and `PairwiseObligation` projection. The overview shows a currency-labeled summary for each active group. An active member opening a group sees its current net pairwise debts and their own group position. Former participants with a completed membership period see only their personal pair rows, the counterparty, group name, and currency.

No expense shares are recalculated, no second balance store was introduced, and the read service does not write to the database. Direct-expense scopes and different group currencies remain separate.

## Balance formulas and display rules

For each unordered pair `(low, high)` with signed balance `s`:

- `s > 0`: low owes high `s` cents.
- `s < 0`: high owes low `abs(s)` cents.
- `s = 0`: settled; omitted from the pairwise outstanding list.
- A member’s position contribution is `-s` if that member is low, `+s` if high, and zero if the member is not in that pair.
- Positive net position means others owe the member; negative means the member owes others.
- `owedToMe` is the sum of positive position contributions. `iOwe` is the absolute sum of negative contributions. Net position is `owedToMe - iOwe`.
- Group outstanding total is the sum of `abs(s)` over the group’s nonzero pair rows, counting each net unordered pair once.

All calculations use `BigInt`; cents are formatted as currency strings at the server-rendered UI boundary. Amounts from different group currencies are never combined. The overview has one card per active group and no cross-currency grand total.

## Financial behavior confirmed

Phase 5D reads only the projection. Existing Phase 5C code applies obligations from saved shares when the final participant approves. The projection skips payer self-shares and zero-cent shares. Pending and rejected expenses do not change it. Opposite approved expenses can offset the existing net pair row to zero.

The group history now explains that approved expenses contribute to the current projection, pending expenses await decisions, and rejected expenses do not affect balances. The UI labels balances as current net amounts and warns that an expense’s saved share is not necessarily its current outstanding debt. No payment, settlement, or reversal behavior was implemented.

## Authorization

- The dashboard obtains the user ID from the existing server-side session.
- Overview group summaries are restricted to groups with the signed-in user’s active membership.
- Group detail calls the existing `requireActiveGroupMember` check before returning all group pair rows.
- Active members can see pair obligations involving deactivated members.
- Former-personal queries require an inactive membership and at least one membership period with a recorded `leftAt`. They query only rows where the authenticated user is one endpoint and return no group-wide outstanding total or other-member pair rows.
- The existing group history service continues to deny former members. This balance exception does not authorize group history or administration.
- Direct scopes are not queried by these group balance methods.

## Files changed

- **Added** `src/features/phase5b/expenses/balances.ts` — bounded, read-only group summary/detail and former-personal balance queries.
- **Added** `src/features/phase5b/ui/balance-dashboard.tsx` — server-rendered overview cards, pairwise group detail, and narrow former-member personal view.
- **Modified** `src/features/phase5b/ui/dashboard.tsx` — loads and integrates balance views and clarifies expense status effects.
- **Modified** `src/app/globals.css` — responsive balance cards, pair rows, status note, and fallback presentation.
- **Added** `src/app/loading.tsx` — dashboard loading state.
- **Added** `src/app/error.tsx` — retryable route error state.
- **Added** `tests/phase5b/expenses/balances.test.ts` — isolated disposable-SQLite coverage.
- **Added** `PHASE5D_IMPLEMENTATION_REPORT.md` — this report.

The pre-existing untracked `PHASE5D_PREPARATION_REVIEW.md` was preserved. `next.config.ts`, Prisma schema and migrations, package manifests, and unrelated files were not changed.

## Files inspected

- `../UserRequirement.md`
- `../specs/001-expense-sharing/spec.md`
- `SPLITSMART_DATABASE_DESIGN.md`
- `PHASE5A_EXPENSE_IMPLEMENTATION_REPORT.md`
- `PHASE5B_REVIEW.md`
- `PHASE5C_IMPLEMENTATION_REPORT.md`
- `PHASE5D_PREPARATION_REVIEW.md`
- `AGENTS.md`
- `next.config.ts`, `package.json`, `prisma/schema.prisma`, and `prisma/migrations/20261119000000_init/migration.sql`
- `src/features/phase5a/expenses/balance-projection.ts`
- `src/features/phase5a/expenses/create-expense.ts`
- `src/features/phase5b/auth/session.ts`
- `src/features/phase5b/groups/service.ts`
- `src/features/phase5b/expenses/history.ts`
- `src/features/phase5b/expenses/approvals.ts`
- `src/features/phase5b/ui/dashboard.tsx`, `src/app/page.tsx`, and `src/app/globals.css`
- Existing Phase 5A expense, Phase 5B group, and Phase 5C approval tests
- Installed Next.js 16 documentation for server-side database access, loading UI, and error boundaries under `node_modules/next/dist/docs/`

## Tests and verification

The new test file uses the existing temporary SQLite pattern: it creates a disposable database under the OS temporary directory, applies the checked-in initial migration to that temporary file, and removes the directory after the suite. It does not use the configured development database.

Actual final results:

| Command | Result |
| --- | --- |
| `npx vitest run tests/phase5a/expenses` | Passed: 2 files, 23 tests |
| `npx vitest run tests/phase5b/auth tests/phase5b/groups` | Passed: 2 files, 10 tests |
| `npx vitest run tests/phase5b/expenses/approval-actions.test.ts` | Passed: 1 file, 2 tests |
| `npx vitest run tests/phase5b/expenses/approvals.test.ts` | Passed: 1 file, 14 tests |
| `npx vitest run tests/phase5b/expenses/balances.test.ts` | Passed: 1 file, 6 tests |
| `npx vitest run` | Passed: 7 files, 55 tests |
| `npm run lint` | Passed; ESLint reported no issues |
| `npx tsc --noEmit` | Passed; no TypeScript errors |
| `npx prisma validate` | Passed; schema valid |
| `npm run build` | Passed; Next.js 16.4.6 production build with Turbopack completed |
| `git diff --check` | Passed; no whitespace errors |

The balance tests cover both signed directions and both ID orderings, zero position for a member absent from a pair, owed-to-me/I-owe/net values, zero-sum member positions, approved versus pending/rejected projection effects, offsetting approved expenses, pairwise netting, currency and scope separation, exclusion of direct scopes, active-member access, nonmember denial, former-personal row restrictions, visibility of former-member counterparties to active members, and empty groups without artificial scope creation.

Existing Phase 5A and Phase 5C tests additionally cover payer self-shares and zero-cent allocations in projection logic.

### Verification issues found and resolved

The first test run exposed a test-fixture omission: the user was not added to the second group before creating its expense. The fixture now adds that active membership. An empty-group test initially assumed the shared temporary test database contained no rows from earlier cases; it now compares the row count before and after the empty-group query. During review, the aggregation also revealed a real edge case where a group member who was not an endpoint of a pair could be counted as the high-ID user. The service now gives nonparticipants in that pair a zero contribution, and the regression test covers it. Final suites all pass.

## Database and repository integrity

Configured development database: `prisma/dev.db`.

- SHA-256 before implementation: `3314946afc9eaf8c456acaea73f6fc8f074f12cb18d27e3b765c39a2886d23c8`
- SHA-256 after tests, validation, and build: `3314946afc9eaf8c456acaea73f6fc8f074f12cb18d27e3b765c39a2886d23c8`
- The development database was not modified.
- Prisma CLI and `@prisma/client` remain at `6.19.3`.
- Next.js remains at `16.4.6`; the production build used Turbopack.
- Branch remains `feature/splitsmart-prototype`.
- No files were staged; no commit or push was made.

## Manual browser demonstration

1. Start the development server with `npm run dev` and sign in as an active group member.
2. On the overview, confirm there is a separate summary card for each active group and each card shows its own currency, personal net position, owed-to-you amount, amount you owe, and group outstanding total.
3. Open a group with an approved expense. Confirm the pair row shows the current debtor, creditor, and net amount, and the group totals match the pairwise rows.
4. Open a group with a pending expense and verify it remains visible in history while the balance projection remains unchanged. Confirm the status note explains that it is awaiting participant decisions.
5. Open a group with a rejected expense and verify it remains visible in history but contributes no pairwise balance.
6. Log in as another active member to confirm their personal position reverses appropriately. Use a group with different currency to confirm the values remain separate.
7. Log in as a former participant. Confirm only their personal historical pair rows appear on the overview; attempting to open former group history remains denied.
8. Log in as a nonmember and verify that a direct request for another group’s detail is not exposed through the dashboard.
9. Check a group with no balance scope and confirm it displays a zero/settled state without creating a balance record.

Manual browser testing was not run as part of this implementation turn.

## Limitations and remaining work

- Balances are intentionally shown from the current projection. Individual expense contribution drill-down, payment recording, settlement, reversals, and reports remain outside Phase 5D.
- The UI formats all supported group currencies as currency code plus two decimal places, consistent with the existing prototype’s money display.
- Loading and route-level error components are generic to the workspace route.
- Phase 5E payments/settlement, Phase 5F reports/date filtering, and Phase 5G final integration/testing remain.
- No schema change was needed. No unresolved schema issue blocks this phase.

No files or database contents outside this Phase 5D scope were modified. Stop here pending authorization for a later phase.

## Manual Browser Verification Results

**Date:** November 19, 2026  
**Group:** Maple Street House  
**Currency:** USD

These results were observed in the browser and supplied for this report. They are manual verification evidence and do not replace the automated test results above.

### Group balance dashboard observed

- Owed to you: **USD 90.00**
- You owe: **USD 0.00**
- Your net position: **USD 90.00 owed to you**
- Group outstanding: **USD 90.00**

Pairwise obligations displayed:

- TestUser2 owes TestUser1 **USD 60.00**.
- TestUser3 owes TestUser1 **USD 30.00**.

The displayed pairwise obligations add up to the **USD 90.00** group outstanding total.

### Expense history observed

**A. Nails**

- Amount: USD 90.00; payer: TestUser1.
- Participants: TestUser1, TestUser2, and TestUser3; saved shares: USD 30.00 each.
- Status: **APPROVED**; all three participants approved.

**B. Dinner (Test 2)**

- Amount: USD 60.00; payer: TestUser1.
- Participants: TestUser1 and TestUser2; saved shares: USD 30.00 each.
- Status: **APPROVED**; both participants approved.

**C. Uber (Test 4)**

- Amount: USD 90.00; payer: TestUser1.
- Participants: TestUser1, TestUser2, and TestUser3; saved shares: USD 30.00 each.
- Status: **REJECTED**; TestUser2 rejected the expense. It contributes no balance.

**D. Movie Tickets**

- Amount: USD 50.00; payer: TestUser1.
- Participants: TestUser1 and TestUser2; saved shares: USD 25.00 each.
- Status: **PENDING**; one of two participants approved. It contributes no balance while pending.

**E. Groceries**

- Amount: USD 60.00; payer: TestUser1.
- Only TestUser2 was selected as a participant; saved share: USD 60.00.
- Status: **PENDING**. It contributes no balance while pending.

### Balance reconciliation observed

The displayed **USD 90.00** net group outstanding is explained by the two approved expenses:

- **Nails:** TestUser2 owes TestUser1 USD 30.00; TestUser3 owes TestUser1 USD 30.00.
- **Dinner (Test 2):** TestUser2 owes TestUser1 USD 30.00.

Therefore, TestUser2's net obligation to TestUser1 is **USD 60.00**, TestUser3's net obligation to TestUser1 is **USD 30.00**, and total group outstanding is **USD 90.00**. The rejected Uber expense and pending Movie Tickets and Groceries expenses do not contribute to the projection.

### Cosmetic issue observed

The group overview card displayed **“USDUSD 90.00 owed to you”**, with the currency label duplicated. This is a cosmetic display issue and does not affect the underlying financial calculation. It was recorded only; no fix was made in this documentation update.

### Manual checks not performed

The supplied browser results do not establish that TestUser2 or TestUser3 separately signed in to verify their personal dashboards. Former-member access and nonmember authorization were not manually tested. No results for those checks are claimed here.
