# SplitSmart Lab 9 — Phase 5B Preparation Review

**Date:** 2026-11-19  
**Branch reviewed:** `feature/splitsmart-prototype`  
**Status:** Phase 5B approved and implemented on 2026-11-19. This is the first interactive web vertical slice, not completion of the full Lab 9 assignment.

## 1. Repository and branch status

The repository is on the required branch, `feature/splitsmart-prototype`, tracking `origin/feature/splitsmart-prototype`. At the end of the preliminary review, this review document was the only untracked file. The user subsequently approved the plan and authorized implementation under the restrictions recorded below.

No separate Lab 9 instruction file was found in the repository. The Lab 9 directions in the project request, `UserRequirement.md`, the actual expense-sharing specification, and available prototype materials were reviewed.

## 2. Verified Phase 5A status

The Phase 5A report records 23 passing tests across two files, successful TypeScript, ESLint, and Prisma checks, and Prisma CLI/client both at 6.19.3. Its allocation behavior follows the approved independent `ROUND_HALF_UP` rounding and designated residual rule.

Phase 5B should call the existing `createExpense` service from the UI layer rather than duplicate its allocation or creation logic. The Phase 5A report records authentication, group approval, UI, and history views as unimplemented at that time; the current home page remains the Next.js starter page.

## 3. Proposed Phase 5B architecture and plan

Use the existing Next.js App Router with server-rendered pages and server-side form actions. Server actions will authenticate the session, validate inputs, check authorization, and call small domain services. The UI will display saved data and return validation or operation results through clear loading, success, error, and empty states.

Proposed sequence:

1. **Local account access:** registration, login, and logout using the existing `User`, `Session`, and `LoginThrottleBucket` models. Hash passwords with Node’s built-in `scrypt`; store only a hash of a random session token; use an HTTP-only, same-site cookie and check the session on every protected operation.
2. **Groups and members:** let an owner create and manage a group, and add or deactivate existing registered users by username. Require owner authorization for membership changes and active membership for group access.
3. **Expense entry:** offer group expense entry using the existing Phase 5A service and allocation rules. Support amount, date, description, payer, participants, and equal or percentage splits. Keep group expenses pending as Phase 5A currently does.
4. **Expense history:** show persisted group expenses, status, payer, amount, split method, and saved participant shares. Restrict results to groups the signed-in user may access.
5. **Instructor demonstration flow:** make it straightforward to register users, create a group, add members, submit an expense, and view that expense and its participants.

### Prototype authentication assumption

This is a single local web prototype, not a production identity service. Account creation is open for demonstration; membership administration remains owner-only. Member addition selects an already registered account, so this slice does not claim to deliver or verify email invitations. External email, account recovery, and production deployment remain outside this phase.

## 4. Phase and feature folder layout

Application/domain code is organized under `prototype/src/features/phase5a/` and `prototype/src/features/phase5b/`, with feature subfolders for expenses, auth, groups, actions, and UI. Next.js route entry points, shared layout, and global styles remain under `prototype/src/app/` as required by the App Router. Shared Prisma access remains under `prototype/src/lib/prisma.ts`.

All automated tests are separate from application source under `prototype/tests/phase5a/` and `prototype/tests/phase5b/`, grouped by feature. Phase 5B continues to reuse the Phase 5A expense creation service; no allocation or creation logic is duplicated.

## 5. Database changes

No schema change or migration appeared necessary for the proposed slice. The current Prisma schema and initial migration already contain users, password hashes, sessions, login throttling, groups, memberships, invitations, expenses, revisions, shares, and balance scopes. This slice can use those existing models for account, group, member, expense, and history workflows.

No migration or database write is part of this plan. Existing database contents and constraints must remain intact.

## 6. Testing plan

After approval, add focused tests for:

- Registration/login validation, password verification, session expiry/revocation, and authorization.
- Group creation, owner-only member changes, duplicate/inactive members, and cross-group access denial.
- Expense action validation and authorization, verifying it delegates to Phase 5A.
- Expense history visibility and correct saved participant/share display.
- Responsive form states and the full instructor demonstration workflow where the existing setup supports it.

## 7. Risks and decisions for approval

- The broader specification includes participant approval, notifications, payment tracking, balances, reports, and email invitations. Those are not in the requested Phase 5B objective; this plan does not claim they are implemented.
- Member addition by username is a prototype shortcut. It does not satisfy the specification’s email invitation and acceptance flow.
- The existing implementation design document describes a larger feature set and unresolved decisions. This plan follows the narrower Phase 5B scope and avoids adding those workflows without need.
- Approval is needed for the proposed prototype account and member-management assumptions, especially open local registration and adding existing users by username.

## 8. Approval and implementation boundaries

The user approved implementation of this first interactive vertical slice:

1. Local account registration, login, and logout.
2. Group creation and management.
3. Group member management.
4. Expense creation using the existing Phase 5A services.
5. Persisted expense history.

Additional approved requirements: a polished responsive Next.js interface; real authorized server-side operations persisted in the existing SQLite database; reuse of Phase 5A allocation and creation logic; server-side validation; documentation of prototype shortcuts, including username-based member addition; tests and actual test results; and a completion report covering features, files, tests, database changes, limitations, remaining Lab 9 scope, and run/demo instructions.

Strict boundaries: do not delete, reset, recreate, or overwrite the development database; do not upgrade Prisma 6.19.3; do not install dependencies without explaining the need and requesting approval; do not modify the Prisma schema or migrations without stopping for approval; do not modify unrelated Lab 6 or Lab 7 files; and do not stage, commit, or push. If the current schema cannot safely support a required operation, stop and explain before attempting a schema change. Do not begin Phase 5C or a later phase.

## 9. Phase 5B implementation report

### Features completed

- Local account registration, login, and logout. Passwords are stored as salted Node `scrypt` hashes. Account input is validated and usernames/emails are normalized. Login failures are throttled by account after eight failures in a 15-minute window. Sessions use random tokens stored as SHA-256 hashes, expire after seven days, and are delivered in HTTP-only, same-site cookies.
- Group creation with owner membership, group name/currency editing, and active member listing. Owners can add an already registered account by username, deactivate a member, and reactivate a previous member. Membership periods are retained.
- Group currency selection is limited in the UI and server validation to USD, CAD, EUR, GBP, AUD, or NZD. The owner may change currency before the first expense. Currency is locked after an expense is saved to preserve historical meaning.
- Group expense entry for positive amounts, dates, descriptions, payer, participants, and equal or percentage splits. The server action checks the current session and active membership, validates the split fields, and invokes Phase 5A `createExpense`. The allocation algorithm and expense creation logic were not duplicated or changed. Group expenses remain pending, consistent with Phase 5A.
- Persisted group expense history showing saved payer, date, status, split type, total, participants, and each participant’s saved integer-cent share. History queries require active group membership.
- Responsive dashboard, group workspace, login/registration page, action feedback, empty states, and pending form buttons.

### Prototype shortcuts and security boundaries

- Registration is open in this local prototype. Accounts do not have email verification or recovery.
- Group owners add existing accounts by username. No invitation email is sent, no invitation acceptance flow is exposed, and username entry does not establish email ownership.
- Login throttling is account-based only; it does not use an IP/source bucket.
- The currency catalog contains six two-decimal currencies. Currency conversion is not provided.
- No hard-delete action is exposed for accounts, groups, memberships, or financial records. Members are deactivated and their membership periods retained.
- Next.js Server Actions provide request-origin protection; each action still authenticates the session and enforces its relevant owner/member authorization server-side.

### Files moved

- Phase 5A expense logic moved to `prototype/src/features/phase5a/expenses/`: `allocation.ts` and `create-expense.ts`.
- Phase 5B source moved under `prototype/src/features/phase5b/`: auth (`accounts.ts`, `password.ts`, `session.ts`), actions (`auth.ts`, `groups.ts`, `expenses.ts`), groups (`service.ts`), expenses (`history.ts`), and UI (`dashboard.tsx`, `submit-button.tsx`).
- All tests moved under the separate `prototype/tests/` tree: Phase 5A expense tests under `tests/phase5a/expenses/`; Phase 5B password and group service tests under `tests/phase5b/auth/` and `tests/phase5b/groups/`.

### Files modified

- `prototype/PHASE5B_REVIEW.md` — approval, implementation summary, limitations, results, and demonstration instructions.
- `prototype/PHASE5A_EXPENSE_IMPLEMENTATION_REPORT.md` — updated source and test paths.
- `prototype/src/app/globals.css` — responsive SplitSmart styling.
- `prototype/src/app/layout.tsx` — application metadata.
- `prototype/src/app/page.tsx` and `prototype/src/app/login/page.tsx` — route imports now reference the Phase 5B feature folder.
- `prototype/tsconfig.json` — Next.js build-required JSX and development type includes added automatically during the successful production build.

The existing `prototype/src/lib/prisma.ts` remains in the shared infrastructure folder. No dependency manifests, lockfiles, Prisma schema, migrations, or database files changed. No unrelated Lab 6 or Lab 7 files changed. No files were staged, committed, or pushed.

### Verification results

- `npm run lint` — passed.
- `npx tsc --noEmit` — passed.
- `npx vitest run` — passed: 4 files, 33 tests (23 existing Phase 5A tests and 10 Phase 5B tests).
- `npx prisma validate` — passed.
- `npm run build` — passed with Next.js 16.4.6. The build compiled `/` and `/login` and completed static page generation. Next.js made the noted `tsconfig.json` updates during this build.
- `npx prisma --version` — Prisma CLI 6.19.3 and `@prisma/client` 6.19.3.
- `git diff --check` — passed.

Phase 5B database tests create temporary SQLite files under the system temporary directory and remove those test files afterward. They do not connect to or alter the configured development database. The existing `prototype/prisma/dev.db` hash was `107b9b2fb10f65795c18292594e2f1d1826a407581edb93294d7abbab665cd5c` after verification, matching its recorded Phase 5A hash. No database file was reset, recreated, or overwritten.

### Database changes

None. The existing Prisma schema and migration already support users, sessions, login throttle buckets, groups, memberships and membership periods, expenses, revisions, shares, and balance scopes. No schema or migration change was needed or made. The development database remains intact.

### Known limitations and remaining Lab 9 requirements

- Group expenses remain pending because approval/rejection is not part of this phase. There is no approval interface and pending expenses do not affect settled balances.
- Balance views, settlement payments, reversals, notifications/activity feed, reports/date filters, receipts, and email invitation delivery/acceptance are not implemented here.
- The Phase 5A direct-expense service exists, but this vertical slice exposes group expense entry only; there is no direct-expense UI.
- Android/iOS clients and production identity features are not delivered. This is a local web prototype and does not complete all requirements in the SplitSmart specification.
- Existing Phase 5A allocation limitations remain unchanged and documented in its report.

### Run and demonstration instructions

1. From the repository, run `cd prototype`.
2. Confirm the existing `.env` `DATABASE_URL` still points to the established development SQLite database. Do not run a reset, database recreation, or migration command for this phase.
3. Run `npm run dev` and open `http://localhost:3000`.
4. Register the first account, create a group, and use the group workspace to add another registered username. To create the second account, open a separate private browser window or sign out first.
5. In the group workspace, enter an expense, select the payer and participants, choose equal or percentage split, and save. The result appears in the persisted history with each saved share and a pending-review status.
6. Sign in as an active group member to demonstrate that the group and its history are visible to members. A nonmember cannot open the group history through the application’s authorized query/action path.

Do not claim the complete Lab 9 assignment is finished after Phase 5B.
