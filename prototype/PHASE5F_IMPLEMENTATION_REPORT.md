# SplitSmart Lab 9 — Phase 5F Implementation Report

## Implementation summary

The workspace now links to an authenticated Reports page. When opened from a group, the page preselects that group. The GET form preserves the report context and dates in the URL for refresh and browser navigation. The page displays expense status, gross approved expense totals, payment rows and totals, and a separately labeled current balance snapshot. It supports validation, empty results, loading, and retry after a server error. The report layout adapts to narrow screens.

## Files created and modified

All paths are relative to `prototype/`.

| Change | File | Purpose |
| --- | --- | --- |
| Created | `src/features/phase5b/expenses/reports.ts` | Date validation, authorized read-only queries, and exact totals |
| Created | `src/app/reports/page.tsx` | Session check, GET parameters, and report loading |
| Created | `src/app/reports/loading.tsx` | Report navigation status |
| Created | `src/app/reports/error.tsx` | Retryable error state |
| Created | `src/features/phase5b/ui/report-dashboard.tsx` | Report controls, activity sections, and balance snapshot |
| Created | `tests/phase5b/expenses/reports.test.ts` | Disposable SQLite and server-rendered output tests |
| Created | `PHASE5F_IMPLEMENTATION_REPORT.md` | Implementation and verification record |
| Modified | `src/features/phase5b/ui/dashboard.tsx` | Reports link on the overview and selected group workspace |
| Modified | `src/app/globals.css` | Responsive report layout and form styles |

## Reporting calculations and date policy

- Both dates must be valid UTC calendar dates in `YYYY-MM-DD` format. Partial, repeated, malformed, impossible, and reversed bounds are rejected. Same-day ranges are supported. The query includes UTC midnight of the start day and excludes UTC midnight following the end day.
- Expense date and scope are applied to immutable revision candidates in Prisma. The service checks each candidate against its parent’s current revision number and scope before returning rows or totaling amounts. A superseded candidate contributes nothing, including when the current revision falls outside the date range.
- Approved totals sum the saved gross amount of each matching current APPROVED revision. Pending and rejected rows display their status and amount and contribute zero to this total. Totals reflect current statuses, so a later approval can change a prior period’s report. Reversal and replacement markers appear where present, and the gross total includes approved reversed originals.
- Payments are selected by immutable `Payment.paymentDate` and counted once per stored row. An idempotent retry leaves the same row count. A backdated payment appears on its effective date, while the current projection reflects the payment when recorded.
- All money is summed with `BigInt` and formatted from integer cents. Each GROUP scope and each DIRECT counterparty/currency scope has independent totals. Empty activity sections show zero in the scope currency. A personal report with no scopes shows an empty result and zero activity without choosing a currency.
- The snapshot shows the current nonzero pairwise obligations and their unsigned outstanding total for each scope. Its figures are independent of the activity dates and the expense and payment totals.

## Authorization

The route resolves the viewer with `requireUser()`. Group choices come from active memberships, and the report service rechecks the selected active membership in the same read transaction as the report queries. Direct scopes require the viewer to be an endpoint. Direct expenses also require the viewer to be the payer or a saved participant. Direct payments and outstanding obligations require the viewer to be a party. URL fields select dates and context, while session identity determines authorization. Former members receive no additional report access.

## Automated verification

| Command | Result |
| --- | --- |
| `npx vitest run` | Passed. 10 files, 98 tests, including 18 new cases and all 80 Phase 5A–5E regression tests. |
| `npm run lint` | Passed with no warnings on the final run. |
| `npx tsc --noEmit` | Passed on the final run. Earlier attempts identified a test fixture typing issue, which was corrected. |
| `npx prisma validate` | Passed. Prisma schema is valid. |
| `npm run build` | Passed with Next.js 16.4.6 and Turbopack. The build lists `/reports` as a dynamic route. |
| `git diff --check` | Passed. |
| `npx prisma --version` | CLI and client both report 6.19.3. |

The report suite uses temporary SQLite databases initialized from the checked-in migration. It covers invalid ranges, UTC edges, same-day activity, current revision changes across boundaries, approved-only totals, backdated payments and duplicate retries, group and direct access, former-member denial, scope/currency isolation, empty results, exact sums beyond signed 64-bit range, and the rendered current balance label and amounts.

## Development database preservation

| Check | SHA-256 for `prisma/dev.db` |
| --- | --- |
| Before implementation | `63a7e7c91395c5a40498fa3acb1e43e4fa8460fe566d5943029f2415bc22d026` |
| After implementation and verification | `63a7e7c91395c5a40498fa3acb1e43e4fa8460fe566d5943029f2415bc22d026` |

Tests used disposable files. Schema, migrations, dependencies, triggers, authentication, and Codespaces configuration were untouched. The pre-existing Phase 5F preparation review was preserved. No files were staged, committed, or pushed.

## Manual browser verification instructions

Use existing data for read-only checks. Use a disposable environment if a scenario needs new fixtures, an approval, or a payment.

1. Open Reports from the overview, then from a selected group. Verify the context selection and switch between that group and My direct activity.
2. Run a same-day report and a multi-day report. Compare included expenses and payments with known dates at the start, end, and following midnight. Reload and use Back and Forward to confirm that the context and dates follow the URL.
3. Confirm approved, pending, and rejected expenses are visible, and compare the approved total to saved approved amounts. Check payment history against known immutable payments. Change the date range and verify that the current balance snapshot still shows the same outstanding amounts when no transactions occur.
4. Check an empty period and a reversed range, then try a partial or malformed range through the URL. Try an unavailable group URL as a nonmember and former member, and visit the page while signed out. Verify that unauthorized records and balances are absent.
5. At a narrow viewport, tab through the controls and check that rows and amounts remain readable. Throttle navigation to check the loading state. In a disposable environment, simulate a data-load failure and verify that Try again recovers once access is restored.

## User-reported browser verification

The user reported a successful browser check for **Maple Street House** on **November 19, 2026 (UTC)**. This was user-reported evidence and was not independently executed by the agent.

| Report item | Observed result |
| --- | --- |
| Gross approved expenses | USD 260.00 |
| Payments | USD 20.00 |
| Current outstanding | USD 155.00 |
| Rejected Uber expense | Excluded from gross approved expenses |
| TestUser2 outstanding | USD 125.00 |
| TestUser3 outstanding | USD 30.00 |

## Known limitations and completion

Automated coverage includes server-rendered output. Browser evidence is limited to the user-reported group walkthrough above. Other browser cases are listed in the manual instructions. Report results are rendered as full matching lists, so large date ranges can return many rows. Historical as-of balances would require a separate reconstruction policy. Phase 5F is implemented and the required automated checks passed. Phase 5G was not started.
