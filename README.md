# SplitSmart — CIS285 Lab 9

This repository is a working copy of the SplitSmart project materials transferred from [GhaileyStu/Lab6-SplitSmart] for continued development and coursework. The source repository's Git history is not included in this copy. Review the project files and make your own substantive revisions before submitting coursework. Preserve any attribution or disclosure required by your course, license, or permissions.

The `feature/splitsmart-prototype` branch implements Lab 9 Prompt 1. The Next.js app in `prototype/` uses server-side Prisma and SQLite to track shared expenses, approvals, balances, and payments.

## Requirements

Use Node.js 22 and npm. The lockfile supplies Next.js, Prisma CLI and client 6.19.3, SQLite dependencies, and Vitest. On local systems where the SQLite dependency needs to compile, install Python 3 and a native build toolchain. Codespaces provides these tools through the checked-in dev container.

## Setup in Codespaces or locally

Open the branch containing the Lab 9 implementation. In Codespaces, use the repository workspace and open port 3000 from the **Ports** panel after the server starts. The dev container's template bootstrap may print a status message. Run the setup commands from the checked-out repository's `prototype/` directory.

For a clean checkout, install the locked dependencies and create a separate disposable SQLite database. These Bash commands use a fresh directory and an absolute file URL, so the committed migration is applied only to the demonstration database.

```bash
cd prototype
npm ci
SPLITSMART_DEMO_DIR=$(mktemp -d)
export DATABASE_URL="file:${SPLITSMART_DEMO_DIR}/splitsmart-demo.db"
npx prisma generate
npx prisma migrate deploy
npx prisma db seed
npm run dev
```

`DATABASE_URL` is the SQLite file URL and needs no credentials. Keep the terminal open to retain this exported value, or set the same absolute file URL in an ignored `prototype/.env` in a clean checkout. Preserve any existing local `.env` and `prisma/dev.db`. Avoid using the existing development database for a clean demo or running reset commands.

Open [http://localhost:3000](http://localhost:3000) locally. Use the forwarded port in Codespaces. The first visit can take a few seconds while Next.js compiles the route. A production-mode check can use `npm run build` followed by `npm start` in a terminal with the same database URL.

## Short manual demonstration

Sign in as `demo_alice`, `demo_bob`, or `demo_charlie` with the demo password `SplitSmartDemo9`. Each account can open **Weekend in Ann Arbor**, which includes an approved $60 dinner paid by Alice and a pending $10 coffee expense paid by Bob. Bob can record a partial payment to Alice, and any participant can review the coffee expense. Reports can be filtered to today's UTC date. Running the seed again preserves the demo group's progress.

Use the seed and its shared password only with a disposable local database. Sign-in and approval notices are local prototype features. Recording a payment updates the ledger and does not transfer money.

To demonstrate creating everything from scratch, use the following walkthrough with synthetic accounts.

1. Register an owner and a participant in separate sessions. As owner, create a group and add the participant by username.
2. Save a dated group expense with an upfront payer and both users participating. Check the saved shares and pending status. Try the percentage split as a second example.
3. Sign in as each participant and approve the first expense. Verify the pairwise balance updates after the final approval. Reject another expense and verify it contributes zero to outstanding balances.
4. Sign in as the debtor and record a partial payment. Verify the balance decreases, the payment appears once in history, and the creditor view has no payment form for that obligation.
5. Open Reports from the group workspace and choose a UTC date range. Compare gross approved expenses, payments, and current outstanding balances. Try an empty range and verify that the activity totals are zero while the current snapshot still reflects any outstanding obligations.
6. As an unrelated account, try the group and report links. Verify that the group data is unavailable. For layout evidence, repeat key views at a narrow screen width.

## Implementation summary

The [phase documents](prototype/method%20breakdown/) record the detailed reviews, reports, and diagnostics.

| Phase | Outcome |
| --- | --- |
| 1–4 · Design and database | Reviewed the requirements and development environment, designed the SQLite data model, and checked in the initial Prisma migration. The model covers accounts, membership history, expense revisions and shares, participant decisions, payments, and pairwise obligations. |
| 5A · Expense creation | Added equal and percentage splits using integer cents and deterministic remainder allocation. The server validates amounts, payer and participant IDs, and active group membership. |
| 5B–5C · Accounts, groups, and approvals | Added local registration and sign-in, group and membership management, and an expense history showing saved shares and decisions. A group expense affects balances after all participants approve. A rejection closes the expense with zero balance impact. |
| 5D · Balances | Added the dashboard and group balance views. They display what the viewer owes, what others owe the viewer, and group-wide outstanding obligations by currency. |
| 5E · Settlement | Added debtor-only partial and full payment recording. A single transaction writes the payment and updates the balance, with duplicate-submission and overpayment guards. |
| 5F · Reports | Added authorized group and personal direct reports with inclusive UTC date filters. Gross approved expenses and recorded payments are shown alongside a separate current balance snapshot. |
| 5G · Integration and demo | Fixed duplicate currency labels and rejection of impossible calendar dates. Added reproducible setup and an optional seed with an approved dinner and a pending coffee expense. |

Entry points and implementation files are in the [app routes](prototype/src/app) and [feature modules](prototype/src/features). See the [web prototype implementation plan](prototype/method%20breakdown/SPLITSMART_WEB_PROTOTYPE_IMPLEMENTATION_PLAN.md), the [customer requirements](specs/001-expense-sharing/Architecture/UserRequirement.md), [expense-sharing specification](specs/001-expense-sharing/spec.md), [SQLite schema and ledger design](prototype/method%20breakdown/SQLITE_PRISMA_SCHEMA_AND_LEDGER_DESIGN.md), [Prisma schema](prototype/prisma/schema.prisma), [migration](prototype/prisma/migrations/20261119000000_init/migration.sql), [demo seed](prototype/prisma/seed.ts), and [tests](prototype/tests).

## Verification and limitations

- Prisma schema validation, lint, TypeScript, the Next.js production build, and all **103 tests across 10 files** passed. The migration and two consecutive seed runs passed against a disposable database. SQLite checks confirmed three demo users, one group, two expenses, and a $10 allocation of $3.34, $3.33, and $3.33.
- The local production HTTP check verified demo sign-in, dashboard, group history and balances, and the date-filtered report. The student’s earlier browser walkthrough verified that pending and rejected expenses had zero balance impact, a $20 payment reduced group outstanding from $175 to $155, and the November 19, 2026 UTC report showed $260 approved, $20 paid, and $155 currently outstanding.
- The final desktop and mobile browser walkthrough is still pending. The earlier Reports loading investigation reproduced a brief cold compilation delay. The cause of the reported persistent spinner remains unconfirmed.
- Direct expense creation is available at the service layer. The browser supports group expense entry and settlement and reporting for existing direct activity. Reports show current balances and date-filtered activity. The prototype scope excludes receipt upload, email invitations, a dedicated notification feed, and real payment transfers.

Run these checks from `prototype/` with the disposable database URL still exported. Tests create their own temporary SQLite fixtures.

```bash
npx prisma validate
npx vitest run
npm run lint
npx tsc --noEmit
npm run build
git diff --check
```
