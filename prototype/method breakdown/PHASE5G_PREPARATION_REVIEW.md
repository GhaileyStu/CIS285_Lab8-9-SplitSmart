# SplitSmart Lab 9 — Phase 5G Preparation Review

## Readiness summary

Phases 5A–5F are on the live feature branch. The core group demo can show account access, group setup, expense entry and approval, pairwise balances, settlement, and date-filtered reporting. The Phase 5F report records 98 passing automated tests. The user subsequently reported a successful main browser check with USD 260.00 in approved expenses, USD 20.00 in payments, and USD 155.00 in current outstanding balances. These are three separately defined figures.

The grading blocker is the missing course handout or rubric. The README on main contains the Lab 9 project instructions and expected implementation areas. No separate grading rubric was found, so submission format, screenshots, minimum test coverage, and grading weights remain unverified. This review records a provisional checklist and identifies the items to reconcile once the course instructions are available.

## Assignment sources and checklist

Reviewed the current tree, repository filenames and branch history for Lab 9 handouts, rubrics, grading notes, screenshots, and submission materials. The [Lab 9 section in the README on main](https://github.com/GhaileyStu/CIS285_Lab8-SplitSmart/blob/5a92e52140e12e7cb85663067d3c931a672c3bca/README.md#lab-9--ai-assisted-source-code-generation) is the most specific assignment guidance available. It calls for using the requirements, specifications, architecture, and Lab 8 environment to implement the prototype, and lists expected changes and examples of additional files. The [devcontainer Dockerfile](../../.devcontainer/Dockerfile) says Lab 9 implements the SplitSmart prototype using AI and replaces the environment-check data model with the actual SplitSmart model. The [root README](../../README.md) identifies transferred materials and calls for substantive revisions and preservation of any required attribution or disclosure. [Phase 5B](PHASE5B_REVIEW.md) also records that no separate assignment file was found. The original guide's history is not included in this repository. The root `requirements.md` and bookstore architecture materials concern a different project and were excluded from grading analysis.

| Course item or submission question | Evidence and status |
| --- | --- |
| Implement an AI-assisted SplitSmart prototype | Confirmed course context in the Dockerfile. The Next.js web prototype is implemented and committed. The exact grading threshold is unknown. |
| Implement the SplitSmart data model | Confirmed course context in the Dockerfile. Prisma schema and checked-in SQLite migration cover users, groups, membership periods, expenses, revisions, shares, approvals, scopes, payments, and related audit entities. |
| Build the dashboard and interface | Explicit in the main README. `src/app/page.tsx` delegates to the SplitSmart dashboard. Login, group workspace, and Reports routes support the demo. |
| Update metadata, layout, and styles | Explicit in the main README. `src/app/layout.tsx` declares SplitSmart metadata and the shared layout, and `src/app/globals.css` styles the interface. |
| Preserve project configuration and add required scripts or dependencies where needed | Explicit in the main README. The prototype has a tracked manifest and lockfile, dev/build/start/lint scripts, Prisma 6.19.3, and Vitest. Validate the clean-checkout setup before submission. |
| Additional file examples | The README lists a shared client, splitting/balance code, tests, actions, reusable components, local environment, and migrations as examples. The current modular paths cover those roles. Local environment and database files are ignored. |
| Make substantive changes and preserve required attribution | Repository guidance. A multi-phase implementation and reports are tracked. Course-specific AI-use disclosure format and placement remain unknown. |
| Specific mandatory workflows, platform, and demonstration criteria | Rubric unavailable. Use the coverage comparison below for review, with scope confirmed from the course handout. |
| Required screenshots, video, write-up, artifacts, and submission channel | Rubric unavailable. No tracked screenshot deliverable was found. Existing technical reports and browser observations can support a final demo package. |
| Required branch, repository URL, and commit or PR format | Rubric unavailable. The feature branch is synchronized with GitHub. Verify the course instruction before choosing what to submit. |
| Test commands, minimum coverage, and live demo environment | Rubric unavailable. The final verification sequence below is a recommended submission check. |

## Current implementation against the SplitSmart specification

Sources include [UserRequirement.md](../../specs/001-expense-sharing/Architecture/UserRequirement.md), the [expense-sharing specification](../../specs/001-expense-sharing/spec.md), and the [Phase 5A](PHASE5A_EXPENSE_IMPLEMENTATION_REPORT.md), [5B](PHASE5B_REVIEW.md), [5C](PHASE5C_IMPLEMENTATION_REPORT.md), [5D](PHASE5D_IMPLEMENTATION_REPORT.md), [5E](PHASE5E_IMPLEMENTATION_REPORT.md), and [5F](PHASE5F_IMPLEMENTATION_REPORT.md) reports. The specification’s Java Swing MVP subset describes a separate implementation choice. Its platform and feature selections do not establish which items the web Lab 9 prototype will be graded on.

| Source requirement | Coverage and grading implication |
| --- | --- |
| FR-001 Accounts | Registration, username/password sign-in, logout, session checks, and authorized dashboard views. Include in the core demo. |
| FR-002 Groups | Create and manage groups, and add or deactivate registered users by username with owner authorization. Email invitation delivery and acceptance are missing. Confirm whether grading requires that workflow. |
| FR-003 Expense details and allocation | Group UI supports amount, date, description, payer, participants, and equal or percentage allocation. Receipt attachment and authorized receipt retrieval are missing. Some tiny splits are rejected under the approved nonnegative residual policy. |
| FR-004 Group and direct expenses | Group expense entry is exposed in the UI. Direct creation exists and is exercised through the service tests, while the web UI offers no direct expense entry. Direct balances, payment, and reports can operate on existing direct data. |
| FR-005 Approval | Group shares and decisions are saved against the current revision. All participants must approve, and a rejection blocks balance effects. Demonstrate approved, rejected, and pending states. |
| FR-006 Expense-created alerts | Pending and approval information is visible within the workspace. A dedicated expense-created alert or notification feed was not found. The source assigns in-app alerts to the Swing MVP. Confirm any web prototype expectation before implementation. |
| FR-007 Balances | Current signed pairwise projection and separate scope/currency summaries. Phase 5D includes user-supplied browser evidence. |
| FR-008 Settlement | Debtor-only partial/full settlement with idempotency and overpayment guards. The primary group flow was verified in the browser by the user. Direct settlement, duplicate submission, unauthorized submission, and overpayment have automated coverage but are outside the supplied Phase 5E browser evidence. |
| FR-009 Reports | Authorized GROUP and personal DIRECT date reports with approved-only gross expense totals, immutable payment totals, and a separate current balance snapshot. The user confirmed the main group browser workflow. Historical as-of balances and expanded filters are product scope decisions. |
| FR-010 Platforms | Responsive web prototype. No Android/iOS clients. Mobile apps belong to the full product requirement unless the course specifically calls for them. |
| NFR-001/005 Authorization | Server-side session, group, pair, and participant checks with automated denial cases. Recheck signed-out, nonmember, and former-member behavior in the final browser walkthrough. |
| NFR-002 Exact money | Uses integer cents and BigInt with half-up allocation rather than Java BigDecimal. Existing tests cover reconciliation, scope isolation, and large sums. Confirm whether the rubric assesses arithmetic behavior or specifically requires the source technology. |
| NFR-003/004 Timing and usability | Percentile timing and timed expense-entry acceptance targets have not been measured. The performance diagnosis confirmed several seconds of first-visit compilation and could not reproduce the persistent browser loading symptom locally. Check warm navigation and run timed attempts if the rubric requires it. |

## Remaining evidence and risks

- **Submission setup at the time of review.** The former `prototype/README.md` still contained starter documentation, and the root README identified Lab 8. A clean checkout lacks the ignored local `.env` and `prisma/dev.db`. The [Lab 9 README](../../README.md) now documents the toolchain, disposable SQLite setup, launch commands, verification, and demo workflow.
- **Verification record.** Phase 5F's checked-in report predates the user’s successful main browser walkthrough. Record the three reported figures, the selected UTC date range and group if available, and the scope of the observation. Capture clean screenshots only if required or useful for submission. Suggested views are group history with status labels, debtor settlement and payment history, and Reports with date inputs and the separate snapshot. Keep real credentials, tokens, and personal data out of artifacts.
- **Overview currency display.** `BalanceOverview` renders a currency badge beside the group and the currency again in preformatted balance values. This is a source-confirmed repeated label. Confirm the exact reported placement in the browser before editing. The smallest fix is to remove the redundant overview badge and retain the currency codes attached to amounts, including in multi-currency scenarios.
- **Expense date consistency.** The expense creation service accepts strings through `new Date(value)` with a finite-date check, while Reports and payments apply strict calendar validation. An impossible date string that JavaScript normalizes could affect the stored activity day if it reaches the expense service. Verify this as a boundary case and tighten date-only validation if confirmed, preserving valid timestamp-bearing service inputs.
- **Historical access nuance.** Former-member balance and payment paths restrict visibility to the viewer’s own pair and require membership history. Existing payment history checks for a closed period but does not compare individual payment dates to membership dates. This is narrower than group-wide access, but differs from a strict membership-period interpretation. Payment dates can be user-entered and should not decide authorization. Verify the intended access policy and test unrelated rows and post-departure settlements before changing it. Group Reports already require active membership.
- **Accounting and auth confidence.** Existing tests cover unauthorized actors, exact allocations, immutable payments, retry deduplication, overpayment, concurrent writes, and rollback. No critical authorization or integrity failure was confirmed by this read-only review. Browser evidence is still limited for manipulated group contexts, creditor attempts, former-member access, and refresh persistence. Use disposable fixtures for those tests.
- **Cold loading.** Existing traces identify cold compilation as the largest measured local delay. The browser hang was not reproduced in isolated HTTP checks, and the main Reports browser case now has a user-reported pass. Recheck the grading environment after a warm visit. Collect Network and Console evidence if a persistent fallback recurs. There is no evidence supporting a broad performance rewrite before submission.

## Git and submission readiness

- At review start the worktree was clean. There were zero staged, unstaged, or untracked files. Local HEAD and the configured upstream both resolved to `bed18cb581a593a598a395116878f200e35043d3`. The ahead/behind count was `0 0`.
- `git ls-remote origin` confirmed the live feature branch has that exact commit. It also confirmed live `main` at `5a92e52140e12e7cb85663067d3c931a672c3bca`. The tracking reference for `origin/main` records an earlier feature merge. An ancestry check confirmed that main does not contain the current Phase 5F feature tip. The checked-out feature branch is the review target. Local `main` is 11 commits behind its tracking reference.
- Origin fetch and push both point to `https://github.com/GhaileyStu/CIS285_Lab8-SplitSmart`. Phase 5F source, tests, and reports are tracked. The successful browser result was supplied in this task and has not yet been reflected in the existing Phase 5F report.
- The only new untracked file from this review is `prototype/PHASE5G_PREPARATION_REVIEW.md`. No commit or push was made.

## Prioritized final tasks and exact proposed files

| Priority | Task | Files proposed for a later authorized change |
| --- | --- | --- |
| P0 | Obtain the course handout and confirm deliverables, branch, AI disclosure, and whether direct entry, receipts, invitations, or alerts are graded. Reconcile every grading row before expanding scope. | `prototype/PHASE5G_PREPARATION_REVIEW.md` if retained as the grading checklist |
| P1 | Give a grader a reproducible setup and a short end-to-end demo. Record the user-reported Phase 5F pass and actual final results. | `README.md`, `prototype/README.md`, `prototype/PHASE5F_IMPLEMENTATION_REPORT.md` |
| P1 | Confirm and remove the redundant overview USD label. Check overview cards for other currencies and verify narrow viewport layout. | `prototype/src/features/phase5b/ui/balance-dashboard.tsx` |
| P1 | Run the final integration walkthrough and collect only the submission evidence called for. | If screenshots are requested, use `prototype/docs/lab9/group-expense-statuses.png`, `prototype/docs/lab9/group-settlement.png`, and `prototype/docs/lab9/reports.png`, subject to required names or locations. |
| P2 | If the malformed date boundary is confirmed and worth fixing before grading, reject impossible date-only input with a focused regression case. | `prototype/src/features/phase5a/expenses/create-expense.ts`, `prototype/tests/phase5a/expenses/create-expense.test.ts` |
| Conditional | Expand customer-specification features only after the rubric or user authorizes that scope. | Scope the files after the requirement is confirmed. No schema or application changes are proposed for the current review. |

## Recommended final verification

Run from `prototype/` in a final verification environment. A clean-checkout demo should use its own SQLite target. Apply the checked-in migration only to that disposable target. Do not repurpose the existing development database for setup or browser fixture creation.

```bash
node --version
npx prisma --version
npx prisma validate
npx vitest run
npm run lint
npx tsc --noEmit
npm run build
git diff --check
git status --short --branch
git rev-list --left-right --count HEAD...@{upstream}
git ls-remote origin refs/heads/feature/splitsmart-prototype refs/heads/main
```

Run the browser demo with an owner, participant, and unrelated account. Verify login/logout, member setup, equal and percentage expenses, approved/rejected/pending balance effects, partial and full settlement in a disposable fixture, report date boundaries and zero results, and independent current balance totals. Confirm nonmembers and former members cannot open group report URLs. Revisit the report after refresh and verify that the selected scope and dates persist. Record actual results against the final commit without claiming untested browser cases.

This review ran repository and source inspections only. The test and build results above come from earlier phase reports. No implementation fixes, schema changes, dependency changes, database writes, resets, commits, or pushes were performed.
