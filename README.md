# SplitSmart — CIS285 Lab 8

This repository is a working copy of my Lab 6 Split Smart project materials transferred here for continued development after the Codex AI removed the Lab 8 folder from my last repo. The source repository's Git history is not included in this copy. GitHub support recommends I use a brand new repo to avoid this mix up happening again since I can't avoid using AI for my coursework.

# Repository File Organization by Lab

This repository contains the deliverables and development environment files for CIS 285 Labs 6–9.

## Lab 6 – Requirements and Architecture

These files document the initial SplitSmart requirements and architecture design.

- `UserRequirement.md` – User requirements for SplitSmart.
- `requirements.md` – Project requirements.
- `design.md` – System design documentation.
- `architecture_base.md` – Baseline architecture proposal.
- `architecture_alternative.md` – Alternative architecture proposal.
- `architecture.md` – Architecture documentation.
- `architecture_review_report.md` – Comparison and review of architecture proposals.
- `consolidation_instructions.md` – Instructions for consolidating the architecture designs.
- `specs/001-expense-sharing/spec.md` – Detailed expense-sharing feature specification.
- `specs/001-expense-sharing/checklists/requirements.md` – Requirements checklist.

## Lab 7 – Architecture Refinement and Design Preparation

The following files support the continued design and refinement of SplitSmart:

- `architecture_base.md`
- `architecture_alternative.md`
- `architecture.md`
- `architecture_review_report.md`
- `consolidation_instructions.md`
- `design.md`

These documents should be treated as design artifacts carried forward into the implementation phase.

## Lab 8 – Development Environment Setup

These files configure the development environment and provide the starter application.

- `.devcontainer/Dockerfile` – Development container configuration.
- `.devcontainer/devcontainer.json` – Dev Container settings.
- `.gitignore` – Files and directories excluded from Git.
- `prototype/package.json` – Node.js project configuration and dependencies.
- `prototype/package-lock.json` – Dependency lockfile.
- `prototype/next.config.ts` – Next.js configuration.
- `prototype/tsconfig.json` – TypeScript configuration.
- `prototype/eslint.config.mjs` – ESLint configuration.
- `prototype/postcss.config.mjs` – PostCSS configuration.
- `prototype/prisma.config.ts` – Prisma configuration.
- `prototype/prisma/schema.prisma` – Initial Prisma database schema.
- `prototype/src/app/page.tsx` – Starter Next.js application page.
- `prototype/src/app/layout.tsx` – Application root layout.
- `prototype/src/app/globals.css` – Global application styles.
- `prototype/public/` – Static assets used by the starter application.
- `prototype/README.md` – Prototype setup instructions.

## Lab 9 – AI-Assisted Source Code Generation

Lab 9 uses the requirements, specifications, architecture, and Lab 8 development environment as the foundation for implementing the SplitSmart prototype.

The following existing files are expected to be updated or extended during implementation:

- `prototype/prisma/schema.prisma` – Expand the database model for groups, members, expenses, shares, approvals, and payments.
- `prototype/src/app/page.tsx` – Build the SplitSmart dashboard and application interface.
- `prototype/src/app/layout.tsx` – Update application metadata and layout.
- `prototype/src/app/globals.css` – Add application styling.
- `prototype/package.json` – Add any required scripts or dependencies while preserving the existing configuration.

Additional implementation files may include:

- `prototype/src/lib/prisma.ts` – Shared Prisma client.
- `prototype/src/lib/split.ts` – Expense-splitting and balance calculations.
- `prototype/src/lib/split.test.ts` – Tests for expense splitting and balance calculations.
- `prototype/src/app/actions.ts` – Server actions for application operations.
- `prototype/src/app/components/` – Reusable interface components.
- `prototype/.env` – Local environment configuration (not committed if it contains secrets).
- `prototype/prisma/migrations/` – Database migration files.

**Note:** The Lab 9 implementation files listed above are planned files, not confirmation that they have already been created.

## Shared Development Tools

The following directories contain tooling used across the project:

- `.github/skills/` – Spec Kit and AI-assisted development skills.
- `.specify/` – Spec Kit configuration, templates, workflows, and scripts.

## Project Overview

SplitSmart is an expense-sharing application intended for groups such as roommates, friends, families, and coworkers. The project progresses from requirements and architecture design (Labs 6–7), to development environment setup (Lab 8), and finally to AI-assisted application implementation (Lab 9).
