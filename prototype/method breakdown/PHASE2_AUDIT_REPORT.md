# SplitSmart Lab 9 — Phase 2 Read-Only Audit Report

## Scope

This report records read-only audit and repository checks. No files, dependencies, schema, migrations, or database were changed. No fix, commit, or push was performed.

## `npm audit`

`npm audit` exited with status **1** and reported three high-severity affected packages:

| Package | Installed version | Finding |
|---|---:|---|
| `deepmerge-ts` | 7.1.5 | Stack exhaustion when merging recursive object graphs; advisory affects versions below 8.0.0. |
| `@prisma/config` | 6.19.3 | Affected through its dependency on `deepmerge-ts`. |
| `prisma` | 6.19.3 | Affected through `@prisma/config`. |

The audit's suggested fix is `prisma@7.10.1` through `npm audit fix --force`, which is a major upgrade. No fix preserving the required Prisma 6.19.3 was offered. No audit fix was run. An earlier zero-vulnerability summary came from the offline lockfile-only update; it was not a substitute for this audit.

## Git and dependency state

- `git status --short` from the repository root returned no modified or untracked files.
- `git status --short --ignored` showed the relevant ignored paths `prototype/.env` and `prototype/node_modules/`.
- `package.json` and `package-lock.json` agree exactly:
  - `@prisma/client`: `6.19.3`
  - `prisma`: `6.19.3`
  - `dotenv`: `16.6.1`
- The lockfile resolves all three packages to those versions.
- `git check-ignore` confirmed `prototype/.env` and `prototype/dev.db` are ignored.

## Schema and database state

- No schema diff was found.
- `prototype/prisma/migrations/` remains absent.
- `prototype/dev.db` remains absent.
- No migration or database command was run.

## Result

The requested read-only checks are complete. No application or database implementation has started.
