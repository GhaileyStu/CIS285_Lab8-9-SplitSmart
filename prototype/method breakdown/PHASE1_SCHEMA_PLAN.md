# SplitSmart Lab 9 — Phase 1 Inspection and Prisma Plan

## Phase 1 — inspection results

- **Branch:** `feature/splitsmart-prototype`.
- **Working tree:** clean except for the pre-existing untracked `prototype/IMPLEMENTATION_DESIGN.md`. It was preserved.
- **Database:** no SQLite database file or project `.env` file was found in the workspace, and `DATABASE_URL` is unset. There is no configured database location or database contents to verify yet. The intended database URL must be configured before migration work.
- **Prisma history:** `prototype/prisma/` contains only `schema.prisma`; there is no migrations directory or recorded migration history in the repository. The Prisma CLI is not installed in `prototype/node_modules`, so `prisma migrate status` could not be run. The lockfile specifies Prisma and `@prisma/client` 6.19.3.
- **Existing schema:** only the placeholder `EnvironmentCheck` model exists. The package is the Next.js/React/TypeScript/Tailwind starter, with no application data models or server workflows yet.

No application files, database files, or migrations were modified. No tests were run because Phase 1 made no implementation changes.

## Proposed Prisma data model

Use SQLite and Prisma 6.19.3. Store money as integer cents using SQLite integer-backed `BigInt` fields; convert values to decimal strings when crossing JSON boundaries. Store percentages as integer basis points. Represent enum-like values as strings validated by the server, with SQL `CHECK` constraints in the migration for allowed values and positive amounts.

| Model | Main fields and relationships |
|---|---|
| **User** | `id`, unique `username`, unique normalized `email`, `passwordHash`, display name, timestamps. Relations to sessions, memberships, expenses, revisions, approvals, notifications, and payments. |
| **Session** | `id`, `userId`, unique `tokenHash`, `createdAt`, `expiresAt`, nullable `revokedAt`. Index by user and expiry. |
| **LoginThrottleBucket** | Unique hash of the account, source, or account/source key; bucket kind, failed-attempt count, window start, delay level, optional `blockedUntil`, updated time. Hash identifiers before storage. |
| **Group** | `id`, `ownerId`, name, currency, timestamps. Relations to memberships, invitations, expenses, and its balance scope. |
| **GroupMembership** | `id`, `groupId`, `userId`, role, active/deactivated state, timestamps. Unique `(groupId, userId)`; soft deactivation only. |
| **MembershipPeriod** | Membership ID, `joinedAt`, nullable `leftAt`. Preserves active intervals for historical access checks. |
| **Invitation** | Group, inviter, normalized email, unique token hash, status, expiry, accepted/revoked timestamps, optional accepting user. |
| **Expense** | Group ID nullable, creator, direct/group kind, current revision pointer/number, current status projection, timestamps. Direct expenses have no group. |
| **ExpenseRevision** | Expense, revision number, revision creator user ID, creation timestamp, payer ID, amount cents, date, description, split method, and metadata. Unique `(expenseId, revisionNumber)`. Prior revisions are retained and immutable. |
| **ExpenseShare** | Revision, participant user ID, share cents, optional percentage basis points, stable allocation position. Unique `(revisionId, participantId)`. |
| **Approval** | Revision, participant, decision, timestamp. Unique `(revisionId, participantId)`; immutable decisions. |
| **Reversal** | Unique original approved revision, actor, reason, timestamp, and optional replacement expense link. The reversal references the revision whose payer and shares define the inverse entries. |
| **Notification** | Recipient, expense/revision, created/read timestamps. Unique recipient/revision/type to prevent duplicate notices. |
| **Receipt** | One receipt per revision, private bytes, detected content type, byte size, checksum, server-generated identifier, timestamp. No public URL or public-directory path. |
| **BalanceScope** | Unique stable key. Either one group scope or one direct-pair scope with sorted low/high user IDs. SQL checks enforce exactly one valid scope kind. |
| **PairwiseObligation** | Scope, sorted user pair, signed outstanding cents. Unique `(scopeId, userLowId, userHighId)`. Positive/negative sign defines debt direction. |
| **Payment** | Scope, debtor ID, creditor ID, positive amount cents, payment date, created timestamp. The authenticated debtor is the actor. Records remain individually auditable. |

`Expense.status` and `PairwiseObligation` are operational projections. Immutable revisions, approval decisions, reversals, and payments are the audit source of truth. Reports are derived from those records; no separate report table is needed.

### Relationship and validation constraints

- A group expense’s creator, payer, and participants must each be active group members at submission.
- A direct expense’s payer and participants must involve exactly two distinct users. The authenticated creator must be one of those users; enforce this in every server-side create/update operation.
- Direct scope uses the sorted pair of those two user IDs, so all their direct expenses aggregate into one pair balance, distinct from any group scope.
- A payment stores its debtor and creditor direction explicitly and references the corresponding group or direct-pair scope.
- Shares and revisions are immutable once saved. A pending edit creates a new revision with fresh approvals.
- Receipts are linked to a revision and checked under the same authorization rules as that expense.

## Additive migration plan

1. Before preparing a migration, configure the intended `DATABASE_URL`. Then inspect that exact SQLite file read-only: confirm its path, list tables, inspect `_prisma_migrations` if present, and record existing table/row information. This inspection is still required because no database URL or file was available in Phase 1.
2. Preserve `EnvironmentCheck` if it exists. Do not drop, rename, rewrite, or reset existing tables or rows.
3. After approval of this Phase 1 plan, create a new Prisma migration that adds the SplitSmart tables, indexes, foreign keys, and SQL `CHECK` constraints. Review the generated SQL to confirm it is additive before applying it.
4. Apply with Prisma 6.19.3 migration deployment only. Never run `migrate reset` or any operation that recreates the database.
5. Verify migration status, table and index presence, and preservation of all pre-existing tables and contents.

The first migration will be a baseline for SplitSmart tables only; it will not claim or rewrite migration history for the placeholder model. If inspection finds an existing database or migration state that makes a purely additive migration unsafe, stop and report the conflict before applying anything.

## Phase 1 status

Phase 1 inspection is complete. This is a proposal only: no schema, migration, or application code has been created. Implementation remains paused pending review and approval of this plan.

---

# Updated Phase 1 Plan — Read-Only Clarification

This updated plan supersedes the proposal above. No files, schemas, migrations, databases, or application code were changed during the clarification review.

## Configuration and dependency recheck

Checks were run from `prototype/`:

- `prototype/.env` is absent. `DATABASE_URL` is unset in the process environment.
- `npm ls prisma @prisma/client` reports an empty dependency tree.
- There is no local Prisma CLI binary and no global Prisma CLI on `PATH`.
- No SQLite database file was found in the workspace.
- The package lockfile specifies Prisma and `@prisma/client` **6.19.3**. The manifest has compatible caret ranges, but the packages are not currently installed here.

There is no URL or database file to resolve, so database contents and migration history cannot be inspected from this workspace. The repository also has no `prototype/prisma/migrations/` directory.

Earlier Codespace checks showing `.env`, installed packages, and successful `npx prisma validate` could not be reproduced in the current workspace state. They may have been run in a different or earlier environment, or the workspace/dependencies may have changed. The available files do not establish which. The lockfile confirms the intended Prisma version, not that the packages are installed.

The branch is `feature/splitsmart-prototype`. The only working-tree item previously observed was the pre-existing untracked `prototype/IMPLEMENTATION_DESIGN.md`.

## Proposed Prisma models and relationships

Use SQLite and Prisma 6.19.3. Store monetary values as integer cents using SQLite integer-backed `BigInt` fields; serialize them as decimal strings across JSON boundaries. Store percentages as integer basis points. Use validated string fields for enum-like states and add database checks for allowed values.

| Model | Proposed fields and relationships |
|---|---|
| **User** | `id`, unique username, unique normalized email, password hash, display name, timestamps. Relations to sessions, group memberships, expenses, revisions, approvals, notifications, and payments. |
| **Session** | `id`, `userId`, unique token hash, creation/expiry/revocation timestamps. Index user and expiry. |
| **LoginThrottleBucket** | Bucket kind and hashed key, failure count, window start, delay level, optional block-until time, updated time. Hash account and source identifiers before storage. |
| **Group** | `id`, `ownerId`, name, currency, timestamps. Relations to memberships, invitations, expenses, and its group balance scope. |
| **GroupMembership** | `id`, `groupId`, `userId`, role, active/deactivated state and timestamps. Unique `(groupId, userId)`; soft-deactivate. |
| **MembershipPeriod** | Membership ID, joined time, optional left time. Retains membership intervals needed for historical access checks. |
| **Invitation** | Group, inviter, normalized email, unique token hash, status, expiry, acceptance/revocation timestamps, optional accepting user. |
| **BalanceScope** | Scope kind plus either a group ID or the sorted pair of direct-expense user IDs. Provides one stable key for the scope. |
| **Expense** | Optional group ID, direct/group kind, creator, balance scope, current revision pointer/number, status projection, timestamps. Direct expenses have no group. |
| **ExpenseRevision** | Expense ID, revision number, revision creator ID and creation timestamp, payer ID, balance scope, amount cents, date, description, split method, receipt reference. Unique `(expenseId, revisionNumber)`; immutable after creation. |
| **ExpenseShare** | Revision, participant ID, share cents, optional basis points, allocation position. Unique `(revisionId, participantId)`. |
| **Approval** | Revision, participant, decision, timestamp. Unique `(revisionId, participantId)`; immutable decisions. |
| **Reversal** | Unique original approved revision, actor, reason, timestamp, optional replacement expense link. Its source revision supplies the payer, scope, and shares to reverse. |
| **Notification** | Recipient, expense/revision, created/read times and type. Unique recipient/revision/type. |
| **Receipt** | Revision, private bytes, detected content type, size, checksum, server-generated identifier, timestamp. No public URL or public-directory path. |
| **PairwiseObligation** | Balance scope, sorted user pair, signed cents. Unique `(scopeId, userLowId, userHighId)`. |
| **Payment** | Scope, debtor, creditor, positive amount cents, date, authenticated debtor, unique idempotency key, and creation timestamp. |

`Expense.status` and `PairwiseObligation` are operational projections. Immutable revisions, approval decisions, reversals, and payments remain the audit source of truth. Reports are derived from those records.

### Split and balance rules

Participants are deduplicated and sorted by stable user ID. Use integer cents and basis points only. Equal splits start each participant at integer division of total cents by participant count. Percentage splits require a 10,000 basis-point total and start each participant at the integer floor of `amountCents × basisPoints ÷ 10,000`. For both methods, distribute remaining cents one at a time, payer first if included, then stable user-ID order. Validate nonnegative shares and exact reconciliation to the expense total before saving.

Example: $10.00 equally among three gives base shares of 333 cents each and one remainder cent. If B is the payer, A receives $3.33, B $3.34, and C $3.33. If the payer is excluded, the first participant by stable ID gets the remainder.

For each scope and unordered pair, `PairwiseObligation` stores one signed amount: positive means the lower-ID user owes the higher-ID user; negative means the higher-ID user owes the lower-ID user; zero means neither owes the other. Group and direct scopes are separate. Direct expenses between the same unordered pair aggregate into one direct balance.

### Payment protections

Each payment request carries a unique idempotency key. Repeating the same key and payload returns the original payment result; reusing it with a different payload is rejected. A payment records debtor and creditor explicitly. The server verifies they are distinct and belong to the referenced scope.

Within one database transaction, conditionally update the signed obligation only if the amount is currently owed in the requested direction, then insert the payment record and idempotency key. Commit both changes together or roll both back. SQLite serializes writers; the conditional update checks current state, preventing concurrent requests from spending the same debt. Retry database-busy errors only with a bounded retry that rechecks the balance.

### Database constraints and validation

**SQL `CHECK` constraints:** expense amounts must be positive; payment amounts must be positive; individual expense shares must be nonnegative, with zero permitted; allowed state/kind values; scope shape is either group or direct pair, never both; direct low user ID sorts before high ID; pairwise users differ; payment debtor and creditor differ.

**Unique constraints/indexes:** one group scope per group; one direct scope per unordered pair; one pairwise projection per scope/user pair; one membership per group/user; one revision number per expense; one approval per revision/participant; one reversal per original revision; one payment per idempotency key. Use partial unique indexes where nullable scope columns require them.

**Transactional server validation:** group expense creator, payer, and participants must be active members; a direct expense must involve exactly two users and its authenticated creator must be one of them; expense kind/group ID/scope must match; direct scope must match the sorted payer/participant pair; payment scope must match its debtor/creditor pair. These cross-table conditions need server checks in the write transaction; SQLite triggers may additionally enforce scope-to-expense and scope-to-pair consistency.

### Reversals and historical access

A reversal uses the original approved revision’s payer, scope, and shares and writes the exact inverse of its obligation. If an original $30 debt was partially paid by $10, the remaining $20 debt plus the $30 reversal results in a $10 balance in the opposite direction. A fully paid $30 debt reverses to $30 owed in the opposite direction. Original expenses and payments remain unchanged for audit and reports.

Reversal and replacement expense creation are atomic. A group replacement remains pending and affects balances only after fresh approval. Former members retain authorized historical access to expenses where they were creator, payer, or participant while active, including associated approvals, payments, and receipts. They may settle outstanding historical obligations but cannot access activity created after deactivation.

## Additive migration strategy

1. Before Phase 2, configure the intended `DATABASE_URL`, then inspect that exact database read-only: verify its path, list tables, inspect `_prisma_migrations`, and record existing contents. This remains outstanding because no database is configured in the current workspace.
2. Preserve `EnvironmentCheck` if it exists. Do not reset, delete, rename, or overwrite existing data.
3. After explicit Phase 2 approval, create a Prisma 6.19.3 migration that adds the SplitSmart tables, indexes, foreign keys, checks, and required triggers. Review the SQL to ensure it only adds the intended structures.
4. Apply through migration deployment only. Never use `migrate reset`.
5. Verify migration status and preservation of every pre-existing table and its contents.

The first migration is a baseline for SplitSmart tables only; it does not rewrite migration history for the placeholder model. If inspection finds an existing database or migration state that makes an additive migration unsafe, stop and report the conflict.

## Resolved issues and status

- Direct expenses aggregate in one balance per unordered user pair, separate from group scopes; payment direction is explicit.
- Split remainders use the same payer-first, then stable user-ID rule for equal and percentage splits.
- Payments have unique idempotency keys, conditional transactional balance updates, and scope membership checks.
- Scope uniqueness, sorted direct IDs, and group/direct scope matching are assigned to SQL constraints, indexes, and transactional server validation.
- Reversals use original immutable revisions, account for prior payments through signed balances, and are atomic with replacement creation.
- Former-member access remains limited to authorized historical records and associated settlement/receipt history.
- **Outstanding inspection prerequisite:** `.env`, `DATABASE_URL`, installed Prisma packages/CLI, and a SQLite database are absent in this workspace. The actual database location and contents remain unverified; they must be resolved before Phase 2.

Phase 1 remains a proposal. No implementation has started; Phase 2 awaits your review and explicit approval.

---

# Final Phase 1 Preparation Notes

This addendum supersedes any conflicting dependency, environment, database-path, or share-constraint statements above. It is a design/preparation note only. No application code, Prisma schema, migration, database, or local `.env` file was created or changed.

## Corrected share constraint

- Expense amounts must be positive integer cents.
- Payment amounts must be positive integer cents.
- Individual participant shares must be nonnegative integer cents. A zero-cent share is valid when required by the exact allocation. For example, a very small expense split across many participants can yield zero-cent shares for some participants.
- Allocation still uses integer cents and basis points, payer-first remainder priority when included, then stable user-ID ordering; shares must sum exactly to the expense amount.

## Environment and dependency findings

Inspected from `prototype/`:

- `package.json` declares `@prisma/client: ^6.19.3` and `prisma: ^6.19.3`; `package-lock.json` resolves both to exactly **6.19.3**. The current manifest ranges permit later Prisma 6 releases if the lockfile is regenerated. To guarantee compatibility with the required CLI/client, Phase 2 should pin both dependencies to exactly `6.19.3`, retaining their synchronized versions.
- The current workspace has no installed `node_modules`: `npm ls prisma @prisma/client` is empty, and there is no local or global Prisma CLI. The package lock is present and supports a lockfile-based install.
- `prototype/prisma.config.ts` already imports `dotenv/config` and reads `DATABASE_URL`. `dotenv` is present in the lockfile at 16.6.1, but is not a direct `package.json` dependency. Phase 2 should make it an explicit dependency if the existing config import remains, so dotenv loading does not rely on a transitive package.
- `prototype/.env` is currently absent. `prototype/.gitignore` contains `.env*`, and `git check-ignore` confirms `.env` and `.env.local` are ignored. The repository root `.gitignore` contains `*.db`, which ignores the proposed database file.

## Proposed local database configuration

Create the local-only file `prototype/.env` with:

```dotenv
DATABASE_URL="file:./dev.db"
```

The existing `prisma.config.ts` is located at `prototype/prisma.config.ts`. Under Prisma 6 config path resolution, the relative SQLite file URL resolves beside that config, so the intended future database path is:

`/workspaces/CIS285_Lab8-SplitSmart/prototype/dev.db`

This is a proposed new local path, not a claim that a database currently exists. Before any migration command, check whether that exact path exists and inspect it read-only if it does. If it does not exist, do not create it until the migration plan and Phase 2 are explicitly approved. The `.env` and `.db` files are covered by existing ignore rules.

## Phase 2 preparation checklist

1. After approval to begin Phase 2 preparation, install the lockfile-resolved dependencies with `npm ci` from `prototype/`; do not run an install command that updates package-lock opportunistically.
2. Pin `prisma` and `@prisma/client` to `6.19.3` and make `dotenv` an explicit dependency if retaining `import "dotenv/config"`; then refresh the lockfile only through a controlled install.
3. Create `prototype/.env` locally with the exact `DATABASE_URL` above; verify it remains ignored with `git check-ignore`, without printing the file contents.
4. Check the proposed `prototype/dev.db` path. If present, inspect its tables, migration history, and contents read-only. If absent, record that no database exists and wait for explicit migration approval before creating one.
5. Verify `npm ls prisma @prisma/client`, `prisma --version`, and `prisma validate` against the installed 6.19.3 toolchain. These checks must not run migrations or create a database.

### Final preparation status

The corrected share constraint, dependency plan, ignored local configuration path, proposed SQLite location, and safe preparation checklist are documented. No dependencies were installed and no `.env` or database file was created. Phase 2 remains paused for final review and explicit approval.
