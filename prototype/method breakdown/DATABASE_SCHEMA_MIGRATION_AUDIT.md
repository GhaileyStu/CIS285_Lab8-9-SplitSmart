# SplitSmart Lab 9 — Phase 3 Database Implementation and Audit Report

**Date:** 2026-11-19  
**Branch:** `feature/splitsmart-prototype`  
**Scope:** Phase 3 schema/migration preparation, followed by the Phase 3B audit and authorized corrections.  
**Database safety:** All migration and integrity cases ran against disposable in-memory SQLite databases. The project database was not opened or modified, and the migration was not applied.

## Files reviewed

- `prototype/SPLITSMART_DATABASE_DESIGN.md`
- `prototype/prisma/schema.prisma`
- `prototype/prisma/migrations/20261119000000_init/migration.sql`
- `prototype/prisma/migrations/migration_lock.toml`
- Earlier implementation run notes, now consolidated into this report.
- `specs/001-expense-sharing/spec.md`
- `UserRequirement.md`

The source requirements specify group participant approval and say valid direct expenses are recorded without group approval. They leave participant review for direct expenses as an open question. The approved design uses immediate direct approval as its proposed prototype default; this audit preserved that default and did not change the design document.

## Phase 3 implementation run

- Added the approved models and relations to `prototype/prisma/schema.prisma`, retaining the existing `EnvironmentCheck` model.
- Ran `npx prisma validate`; it passed.
- Generated the initial SQLite migration with:

  ```sh
  npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script --output prisma/migrations/20261119000000_init/migration.sql
  ```

- Added the SQLite migration lock file and authored the checks, partial unique index, and custom triggers that Prisma's schema cannot express.
- The first SQL parsing check caught a syntax error in the direct-expense approval trigger. It was fixed. At that stage, migration SQL parsed successfully with `EnvironmentCheck` present, 20 total SQLite tables (19 application tables plus internal `sqlite_sequence`), and 39 triggers. The Phase 3B audit later added one trigger and additional corrections documented below.
- Ran `git diff --check`; it passed. The migration was not applied, the project database was not created or modified, application source and dependencies were left unchanged, and nothing was staged, committed, or pushed.

## Issues found and corrections made

1. **Direct approvals were insertable.** The approval trigger accepted a participant approval for a pending direct expense, allowing a review workflow that conflicts with the approved immediate-approval prototype default. The trigger now restricts Approval rows to group expenses. A pending direct expense can transition to APPROVED without Approval rows.
2. **Sequential payments could reuse the same outstanding projection.** The payment validation trigger checked the current PairwiseObligation but did not update it after a successful payment. A second payment could therefore validate against the original amount if inserted directly. Added an `AFTER INSERT` trigger that applies the payment to the signed pairwise projection in the same SQLite statement/transaction. A second payment is now checked against the reduced outstanding balance.
3. **Membership period identity could change while closing a period.** The close-once trigger allowed changing the period ID or membership ID in the same update that set `leftAt`. It now rejects both identity changes.
4. **Split method and percentage field could disagree.** The share trigger did not require `percentageBasisPoints` to be null for equal splits and present for percentage splits. It now enforces that row-level pairing. Percentage totals and share totals remain transactional validation rules as specified by the design.

Only `prototype/prisma/migrations/20261119000000_init/migration.sql` was corrected. The Prisma schema and migration lock file were not changed during this audit.

## Schema and migration coverage

The Prisma schema retains `EnvironmentCheck` and represents all 18 approved SplitSmart models, their declared scalar fields, relations, indexes, uniqueness constraints, and deletion policies. The migration creates those 19 application tables (18 SplitSmart tables plus `EnvironmentCheck`); SQLite also creates its internal `sqlite_sequence` table for the autoincrement key.

The migration includes integer `BigInt` monetary columns, basis-point fields, allowed-value and amount checks, signed 64-bit range checks, currency-specific direct scope uniqueness, foreign keys, and 40 custom SQLite triggers. It enforces direct pair ordering and currency separation; group/direct scope shapes and group currency matching; active group creator, payer, and participant checks at submission; exact-current-revision group approvals; immediate direct approval without approval rows; membership-period non-overlap and one-time closure; immutable financial rows; reversal-entry validity and complete-set finalization; debtor-only payment checks and outstanding-balance checks; payment idempotency-key uniqueness; and payment projection updates.

Direct-scope uniqueness is an authored partial unique index in migration SQL because Prisma's ordinary `@@index` cannot represent the partial unique index. The direct currency policy remains one scope per unordered user pair and currency.

## Tests executed and actual results

All behavioral cases used Python's SQLite module and a disposable `:memory:` database with `PRAGMA foreign_keys=ON`.

- Applied the complete migration to an empty in-memory database: **passed**. Found 19 application tables, 40 triggers, and 45 named application indexes (excluding SQLite internal objects).
- Created a valid group scope and direct scopes: **passed**.
- Tried duplicate direct pair/currency scope: **rejected** by unique index. Added the same pair with a second currency: **allowed**.
- Tried a reversed direct pair and a group scope with a currency different from its group: **rejected**.
- Tried overlapping membership periods and changing period identity during closure: **rejected**. Adjacent non-overlapping periods: **allowed**.
- Tried approval by a nonparticipant and by a participant on a superseded revision: **rejected**.
- Tried group approval before all participants had approved: **rejected**. Approved after every participant, including zero-share participants, had approved: **passed**.
- Tried inserting an approval row for a pending direct expense: **rejected**. Approved the direct expense without review rows: **passed**.
- Tried to attach percentage basis points to an equal-split share: **rejected**. Equal-split share with null percentage: **allowed**.
- Tried to finalize an incomplete reversal: **rejected**. Duplicate source share, payer share, and zero-share entries: **rejected**. Complete exact entry set: **finalized successfully**.
- Recorded a partial payment: **passed**, and signed pairwise balance changed from -1,000 to -600 cents. A second payment for 601 cents was **rejected** against the remaining 600 cents. A final 600-cent payment succeeded and brought the projection to zero.
- Reused an idempotency key: **rejected** by unique constraint. Tried payment by a nondebtor: **rejected**. Tried payment exceeding the obligation: **rejected**.
- Tried updating a revision, updating/deleting a payment, deleting a financially referenced user, and deleting a used balance scope: **rejected**.
- Tried setting a signed projection beyond SQLite's signed 64-bit range: **rejected** by CHECK constraint.
- Confirmed the test connection had foreign-key enforcement enabled: **passed**.
- Ran `npx prisma validate --schema prisma/schema.prisma` from `prototype/`: **passed**; Prisma reported the schema is valid.
- Ran `git diff --check`: **passed**.

The first direct-approval behavior check failed before correction because the migration accepted that row; the correction and rerun passed. Two early harness attempts also stopped on harness mistakes (an expected index count of 47 instead of the observed 45, and an update aimed at a payment row that had not been inserted). Those were corrected; they were not migration failures. The complete post-correction suite above ran to completion.

## Remaining requirements and enforcement limits

- The source requirement's BigDecimal `ROUND_HALF_UP` allocation calculation, exact share-total reconciliation, percentage-total validation, username Unicode normalization, canonical request-hash construction, and checked arbitrary-precision intermediate arithmetic cannot be implemented by this schema alone. They require application services. No services were implemented or audited here.
- Expense approval and reversal projection rebuilding still require application transactions to write the corresponding PairwiseObligation deltas atomically with their source records. SQLite rejects finalizing an incomplete reversal, but SQLite has no commit trigger to prevent an application from committing a standalone, not-yet-finalized Reversal row. The application must create the reversal, all entries, replacement (if any), and projection changes in one transaction as the design requires.
- The unique idempotency key is enforced in SQL. Returning the original result for a retry with the same canonical request hash, and rejecting a mismatched hash with a useful application result, remains service behavior; SQL alone rejects duplicate key insertion.
- Group membership-period status synchronization and reversal creator authorization also need to be enforced in application transactions. The audit verified period interval overlap/closure rules and reversal source-entry integrity, but did not claim these service-level policies are implemented by the database.
- Supported currency membership, per-currency precision/limits, and the product-level monetary cap remain product decisions documented in the approved design. SQL enforces uppercase three-letter currency codes and SQLite integer bounds.
- SQLite foreign keys are connection-specific. The audit enabled them explicitly for each disposable test connection; application database connections must likewise have foreign-key enforcement enabled.

These are service-layer or explicitly open product decisions already identified in the approved design, not reasons to change the design during this audit.

## Final status and safety confirmation

No project database was created, initialized, reset, opened, or modified. No migration was applied. No application source, requirements, design document, or dependency was changed. Nothing was staged, committed, or pushed.

Final `git status --short --branch`:

```text
## feature/splitsmart-prototype...origin/feature/splitsmart-prototype
 M prototype/prisma/schema.prisma
?? prototype/DATABASE_SCHEMA_MIGRATION_AUDIT.md
?? prototype/prisma/migrations/
```

