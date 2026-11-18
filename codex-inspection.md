# SplitSmart Repository Inspection Report

## Repository state

- **Repository root:** `/workspaces/CIS285_Lab8-SplitSmart`
- **Current Git branch:** `main` (tracking `origin/main`)
- **Working tree before this report:** Clean

## File locations

- **User requirements:** `UserRequirement.md`
- **`requirements.md`:** `requirements.md`
- **SplitSmart functional specification:** `specs/001-expense-sharing/spec.md`
- **Specification checklist:** `specs/001-expense-sharing/checklists/requirements.md`
- **Prototype application:** `prototype/`
- **Main application page:** `prototype/src/app/page.tsx`
- **Prisma schema:** `prototype/prisma/schema.prisma`
- **Prisma configuration:** `prototype/prisma.config.ts`

## Technology stack and project structure

The prototype is configured with Next.js, React, TypeScript, Tailwind CSS, Prisma, and SQLite via `better-sqlite3`. It includes an npm lockfile and ESLint configuration.

The repository root contains requirements, specifications, and architecture/design documents. Application code and package configuration are under `prototype/`. The application page and metadata are still the default Next.js starter. The Prisma schema currently contains only an `EnvironmentCheck` model.

## Missing files, configuration problems, and inconsistencies

- The root `requirements.md` describes an online bookstore, not SplitSmart.
- `architecture.md` and `design.md` also describe an online bookstore, conflicting with the SplitSmart specification.
- The root README refers to `.devcontainer/` and `.github/skills/`, but those files/directories are absent.
- No Prisma migrations or environment file/sample were found.
- `package.json` uses Next.js `16.4.6` alongside `eslint-config-next` `15.5.29`, a major-version mismatch that may affect linting.
- The root README title says “CIS285 Lab 8,” though it describes work across Labs 6–9.

## Scope confirmation

This report was created without installing or updating dependencies, running migrations, or changing any other files.
