# SplitSmart Lab 9 prototype

SplitSmart is a web application for sharing expenses and tracking what group members owe. The prototype supports local account registration and sign-in, group membership management by registered username, group expense entry with equal or percentage splits, participant approvals, current pairwise balances, partial and full settlement, and UTC date-range reports for authorized groups and personal direct activity. Existing direct obligations can be settled and reported. Direct expense entry is available in the service layer, while the browser entry form is for group expenses.

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
npm run dev
```

`DATABASE_URL` is the SQLite file URL and needs no credentials. Keep the terminal open to retain this exported value, or set the same absolute file URL in an ignored `prototype/.env` in a clean checkout. Preserve any existing local `.env` and `prisma/dev.db`. Avoid using the existing development database for a clean demo or running reset commands.

Open [http://localhost:3000](http://localhost:3000) locally. Use the forwarded port in Codespaces. The first visit can take a few seconds while Next.js compiles the route. A production-mode check can use `npm run build` followed by `npm start` in a terminal with the same database URL.

## Automated checks

Run these commands from `prototype/` with the demonstration database URL configured. The integration tests create their own temporary SQLite fixtures from the checked-in migration.

```bash
npx prisma validate
npx vitest run
npm run lint
npx tsc --noEmit
npm run build
git diff --check
```

## Short manual demonstration

Use synthetic accounts and the disposable database.

1. Register an owner and a participant in separate sessions. As owner, create a group and add the participant by username.
2. Save a dated group expense with an upfront payer and both users participating. Check the saved shares and pending status. Try the percentage split as a second example.
3. Sign in as each participant and approve the first expense. Verify the pairwise balance updates after the final approval. Reject another expense and verify it contributes zero to outstanding balances.
4. Sign in as the debtor and record a partial payment. Verify the balance decreases, the payment appears once in history, and the creditor view has no payment form for that obligation.
5. Open Reports from the group workspace and choose a UTC date range. Compare gross approved expenses, payments, and current outstanding balances. Try an empty range and verify that the activity totals are zero while the current snapshot still reflects any outstanding obligations.
6. As an unrelated account, try the group and report links. Verify that the group data is unavailable. For layout evidence, repeat key views at a narrow screen width.
