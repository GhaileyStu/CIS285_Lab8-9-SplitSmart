# SplitSmart Lab 9 — Phase 5G Final Integration and Submission Preparation

## Outcome

The overview cards now identify currency on every amount without repeating it beside the group name. The expense service rejects impossible date-only input before writing an expense. The repository has a Lab 9 entry point and a prototype setup and demo guide. The Phase 5F report now contains the successful group report browser evidence supplied by the user.

All six required automated checks passed. The final browser walkthrough and course submission requirements remain to be confirmed.

## Files changed

| File | Reason |
| --- | --- |
| `README.md` at repository root | Added a Lab 9 entry point while preserving the existing attribution and Lab 8 introduction. |
| `prototype/README.md` | Added features, Node and locked dependencies, Codespaces port setup, local environment configuration, disposable SQLite initialization, verification commands, and a demo walkthrough. |
| `prototype/PHASE5F_IMPLEMENTATION_REPORT.md` | Recorded the user-reported Maple Street House result for November 19, 2026 UTC, including USD 260.00 approved, USD 20.00 paid, and USD 155.00 outstanding. Recorded the rejected Uber exclusion and the USD 125.00 and USD 30.00 debtor amounts. |
| `prototype/src/features/phase5b/ui/balance-dashboard.tsx` | Removed the separate overview currency badge. Amount formatting and balance logic are unchanged. |
| `prototype/tests/phase5b/expenses/balances.test.ts` | Extended the currency-isolation case to verify rendered USD and CAD amounts and removal of the duplicate badges. |
| `prototype/src/features/phase5a/expenses/create-expense.ts` | Added a calendar round-trip check for date-only strings. |
| `prototype/tests/phase5a/expenses/create-expense.test.ts` | Added two impossible dates and three accepted date cases against disposable SQLite. |
| `prototype/PHASE5G_IMPLEMENTATION_REPORT.md` | Recorded verification, database preservation, Git status, and submission readiness. |

The existing untracked Phase 5G preparation review was preserved.

## Date-validation findings

Before the fix, Node parsed `2026-02-30` as March 2, 2026 at UTC midnight. The focused service tests established that both `2026-02-30` and `2026-04-31` were accepted and persisted as pending group expenses in a disposable SQLite fixture. The normal form forwards its date value to this service.

The fix requires date-only strings shaped like `YYYY-MM-DD` to round-trip to the same UTC calendar day before the expense transaction starts. Both impossible-date tests now reject with `INVALID_INPUT` and verify that no group expense or balance scope is written. A valid leap day remains at UTC midnight. A timestamp string with an offset and a valid `Date` object preserve their expected UTC instants. Existing expense records were left intact.

## Actual verification

| Command | Result |
| --- | --- |
| `npx prisma validate` | Passed. Checked-in schema valid. |
| `npx vitest run` | Passed. 10 files and 103 tests. |
| `npm run lint` | Passed without warnings. |
| `npx tsc --noEmit` | Passed. |
| `npm run build` | Passed using Next.js 16.4.6 and Turbopack. Output included the dynamic dashboard, login, and Reports routes. |
| `git diff --check` | Passed. |
| `npx prisma migrate deploy` | Passed against a fresh temporary SQLite database. Applied the existing `20261119000000_init` migration. |
| `node --version` and `npx prisma --version` | Node v22.23.5. Prisma CLI and client both 6.19.3. |

The verification used the installed locked toolchain. No fresh dependency installation was performed. The rendered currency check tested server-generated markup, and the final browser walkthrough was not run in this phase.

## Development database preservation

SHA-256 before and after the work matched.

```text
4705b0b842a04c486f6cb1046d1e05e94bea274232d63f332757d13ea1dffefa  prototype/prisma/dev.db
```

The documented migration workflow was exercised only on a database in a newly created temporary directory. Tests created their own disposable fixtures. No real accounts or transactions were created. The schema, migrations, dependencies, authentication, and financial settlement behavior were untouched.

## Git and remote status

- Checked-out branch is `feature/splitsmart-prototype`, tracking `origin/feature/splitsmart-prototype`. Local HEAD and the live feature ref both resolve to `bed18cb581a593a598a395116878f200e35043d3`. The ahead/behind count is `0 0` for committed work.
- Live `main` was `5a92e52140e12e7cb85663067d3c931a672c3bca`. It does not contain the Phase 5F feature tip.
- The seven tracked file edits above are unstaged. The Phase 5G preparation review and this implementation report are untracked. Phase 5G is therefore local and unsynchronized. Nothing was staged, committed, merged, or pushed.

## Submission-readiness checklist

- [x] Preserve the development database and existing accounting and authorization behavior.
- [x] Provide the Lab 9 entry point, reproducible disposable SQLite setup, and demo instructions.
- [x] Record the user-reported Phase 5F browser evidence and final automated results.
- [x] Verify that USD and CAD amounts retain their currency indicators in rendered overview cards.
- [ ] Run the final browser demo with synthetic accounts in a disposable database. Check the corrected overview at desktop and narrow widths, valid expense entry, approval/rejection, partial and full settlement, report date filters and empty results, and nonmember denial. Check warm Reports navigation in the intended Codespaces browser.
- [ ] Confirm the submission branch, screenshot or recording requirements, disclosure format, submission channel, and any feature minimums from the course rubric. The README on main supplies implementation guidance, and no separate grading rubric was available in the repository.
- [ ] Capture any required evidence from the final browser run. Include the Phase 5G docs and fixes in the course-designated branch only after separate authorization to commit and push. Verify the live ref before submitting.

There is no blocker to the completed local work. Final submission remains pending the browser walkthrough, course-specific instructions, and authorization for Git publication. Receipt uploads, invitation emails, notifications, mobile apps, and new expense workflows were outside this phase.
