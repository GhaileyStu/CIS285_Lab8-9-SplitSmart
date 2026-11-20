# SplitSmart Lab 9 — Phase 2 Environment Preparation Report

## Scope

This report records the authorized Phase 2 environment-preparation work only. No application features were implemented. No Prisma schema or migration was created or modified. The SQLite database was not created, initialized, reset, or modified. No commit or push was made.

## Branch and initial state

- Branch: `feature/splitsmart-prototype`.
- Existing review documents were preserved.
- Before preparation, `prototype/dev.db`, `prototype/.env`, and `prototype/prisma/migrations/` were absent.

## Changes made

- `package.json`: pinned `@prisma/client` to `6.19.3` as a runtime dependency; pinned `prisma` to `6.19.3` as a development dependency; added `dotenv` `16.6.1` as a development dependency for the existing Prisma config import.
- `package-lock.json`: updated in offline lockfile-only mode to reflect the package declarations.
- `.env`: created in `prototype/` with exactly:

  ```dotenv
  DATABASE_URL="file:./dev.db"
  ```

- `node_modules/`: installed from the existing lockfile via `npm ci` (Git-ignored).

The configured URL targets `prototype/dev.db`. That file remains absent. The `.env` file is excluded by `prototype/.gitignore` (`.env*`); database files are excluded by the root `.gitignore` (`*.db`). `git check-ignore` confirmed both rules.

## Verification results

| Check | Result |
|---|---|
| `npm ci` from `prototype/` | Passed; installed 395 packages from the existing lockfile. |
| `npm ls prisma @prisma/client` | Passed; both resolve to 6.19.3. |
| `npx prisma --version` | Passed; Prisma CLI and client report 6.19.3. |
| `npx prisma validate` | Passed; existing `prisma/schema.prisma` is valid. |
| Git ignore check for `.env` and `dev.db` | Passed; both paths are ignored. |
| Database and migration check | `prototype/dev.db` remains absent; `prototype/prisma/migrations/` remains absent. |

## Warnings

`npm ci` displayed a deprecated ESLint warning and reported 3 high-severity vulnerabilities. The subsequent offline lockfile-only update reported 0 vulnerabilities. These audit summaries differed; no further audit investigation was performed.

## Git state

The authorized tracked changes are `prototype/package.json` and `prototype/package-lock.json`. The local `prototype/.env` and installed `node_modules/` are ignored. The pre-existing untracked `IMPLEMENTATION_DESIGN.md` and `PHASE1_SCHEMA_PLAN.md` remain preserved. `PHASE2_ENVIRONMENT_REPORT.md` is this new review report.

## Status

Environment preparation is complete. Schema and migration work remains paused pending the user's review and explicit approval.
