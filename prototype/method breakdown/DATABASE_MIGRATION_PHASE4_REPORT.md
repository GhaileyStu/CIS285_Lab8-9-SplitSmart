# SplitSmart Lab 9 — Phase 4 Migration Application Report

**Date:** 2026-11-19  
**Branch:** `feature/splitsmart-prototype`  
**Authorized action:** Create the configured SQLite database and apply the audited initial migration.

## Pre-checks

- Branch was `feature/splitsmart-prototype`.
- Initial Git status:

  ```text
  ## feature/splitsmart-prototype...origin/feature/splitsmart-prototype
  ?? prototype/DATABASE_MIGRATION_PREFLIGHT_PHASE4.md
  ```

- Prisma CLI: **6.19.3**.
- `@prisma/client`: **6.19.3**.
- `prototype/.env` contained the expected setting `DATABASE_URL="file:./dev.db"`; no secrets are reproduced here.
- The configured URL resolved to `/workspaces/CIS285_Lab8-SplitSmart/prototype/prisma/dev.db`, which did not exist before deployment.
- The migration directory contained exactly `20261119000000_init/migration.sql` and `migration_lock.toml`.
- The migration lock provider was `sqlite`.
- The migration matched the tracked/audited file. Its SHA-256 before application was `196a733f38880a3c52e07da77f3dcfe2d52f4bc0f3c9795beca54c1dde9f40c7`. It contained the audited `EnvironmentCheck` table, 40 triggers, and 45 explicit indexes. The file was not regenerated or rewritten.

All required pre-checks passed.

## Migration application

Executed from `prototype/`:

```sh
npx prisma migrate deploy
```

Result: **succeeded**. Prisma created the database at the verified configured path and applied migration `20261119000000_init` successfully.

## Database verification

Inspected the new database using a read-only SQLite connection.

- Exact database path exists: **yes** — `/workspaces/CIS285_Lab8-SplitSmart/prototype/prisma/dev.db`.
- Expected application tables: **19 of 19 present**, including `EnvironmentCheck`.
- `_prisma_migrations`: **present**, containing one row for `20261119000000_init`; `finished_at` is set, `rolled_back_at` is null, and `applied_steps_count` is 1.
- Custom triggers: **40 present**.
- Explicit indexes: **45 present**, including direct pair/currency uniqueness and the required payment and pairwise indexes.
- Foreign-key enforcement on the inspection connection: **enabled** (`PRAGMA foreign_keys = 1`).
- `PRAGMA foreign_key_check`: **zero violations**.
- All application tables were empty after creation; `_prisma_migrations` contained the one successful migration record.

## Additional requested checks

- `npx prisma validate`: **passed**; Prisma reported the schema is valid.
- `git diff --check`: **passed**.

## Warnings and boundaries

No failures occurred. The initial Git status contained the preflight report as an untracked file; no existing tracked schema or migration changes were present. The database file was newly created by the authorized migration command. No application implementation or dependency changes were made. Nothing was staged, committed, or pushed.

Final `git status --short --branch`:

```text
## feature/splitsmart-prototype...origin/feature/splitsmart-prototype
?? prototype/DATABASE_MIGRATION_PREFLIGHT_PHASE4.md
?? prototype/DATABASE_MIGRATION_PHASE4_REPORT.md
```

