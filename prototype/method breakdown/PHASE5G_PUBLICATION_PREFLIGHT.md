# SplitSmart Lab 9 — Phase 5G Publication Preflight

## Decision

The reviewed files are suitable for publication to the existing feature branch. This is a Git publication decision. Course submission still depends on confirming the rubric, required branch and artifacts, and completing the final browser walkthrough.

The checked-out branch is `feature/splitsmart-prototype`, tracking `origin/feature/splitsmart-prototype`. Both fetch and push use `https://github.com/GhaileyStu/CIS285_Lab8-SplitSmart`. Local HEAD, the upstream tracking ref, and the live remote feature ref all matched `bed18cb581a593a598a395116878f200e35043d3`. The remote feature branch had no unexpected advance at preflight. Live `main` was `5a92e52140e12e7cb85663067d3c931a672c3bca` and does not contain the Phase 5F feature tip. The index was empty.

## Exact publication set

| Path | Review finding |
| --- | --- |
| `README.md` | Grader index linking setup, final verification, source, schema, migration, tests, and browser evidence. Existing attribution and Lab 8 introduction are preserved. |
| `prototype/README.md` | Reproducible setup and demo using a disposable SQLite target and synthetic accounts. |
| `prototype/PHASE5F_IMPLEMENTATION_REPORT.md` | Adds user-reported group browser results, including the approved, paid, and outstanding figures. |
| `prototype/PHASE5G_IMPLEMENTATION_REPORT.md` | Records the test results, date fix, data preservation, and remaining submission checks. |
| `prototype/PHASE5G_PREPARATION_REVIEW.md` | Maps the implementation to the repository assignment guidance and identifies rubric gaps. |
| `prototype/PHASE5G_PUBLICATION_PREFLIGHT.md` | Documents this audit and the publication commands. |
| `prototype/src/features/phase5a/expenses/create-expense.ts` | Rejects impossible date-only inputs. Valid timestamp and Date inputs remain supported. |
| `prototype/src/features/phase5b/ui/balance-dashboard.tsx` | Removes the redundant overview badge while retaining currency labels on amounts. |
| `prototype/tests/phase5a/expenses/create-expense.test.ts` | Covers impossible dates and valid UTC instants using disposable SQLite. |
| `prototype/tests/phase5b/expenses/balances.test.ts` | Verifies rendered USD/CAD amounts and the absence of redundant badges. |

The existing Phase 5G run records 103 passing tests, Prisma validation, lint, TypeScript, the production build, and a successful migration against disposable SQLite. Preflight only changed documentation and did not rerun application checks.

## Secrets and artifact review

Reviewed tracked diffs, the untracked reports, the index, tracked path names, and Git ignore decisions. The explicit file set consists of Markdown, application TypeScript, and TypeScript tests. No credential or secret was found in the proposed changes. The fixture identifiers and browser verification figures are demo evidence. The README’s SQLite URL uses a temporary directory variable and carries no credential.

Git confirmed ignore rules for `prototype/.env`, `prototype/prisma/dev.db`, its WAL path, `prototype/.next/`, `prototype/node_modules/`, and `prototype/tsconfig.tsbuildinfo`. No SQLite database, environment file, private key, logs, or generated build artifact is in the proposed set. The database hash was `4705b0b842a04c486f6cb1046d1e05e94bea274232d63f332757d13ea1dffefa` before and after preflight.

## Proposed publication commands

Run from the repository root after publication is authorized. Confirm the active branch and that the live remote feature SHA still matches local HEAD before staging. If the remote moved, inspect the difference before publishing. Use a normal push so Git rejects any non-fast-forward update.

```bash
git branch --show-current
git rev-parse HEAD
git ls-remote origin refs/heads/feature/splitsmart-prototype
git add -- README.md prototype/README.md \
  prototype/PHASE5F_IMPLEMENTATION_REPORT.md \
  prototype/PHASE5G_IMPLEMENTATION_REPORT.md \
  prototype/PHASE5G_PREPARATION_REVIEW.md \
  prototype/PHASE5G_PUBLICATION_PREFLIGHT.md \
  prototype/src/features/phase5a/expenses/create-expense.ts \
  prototype/src/features/phase5b/ui/balance-dashboard.tsx \
  prototype/tests/phase5a/expenses/create-expense.test.ts \
  prototype/tests/phase5b/expenses/balances.test.ts
git diff --cached --name-status
git diff --cached --check
git commit -m "Lab 9: finalize SplitSmart integration and grading guide"
git push origin HEAD:refs/heads/feature/splitsmart-prototype
git ls-remote origin refs/heads/feature/splitsmart-prototype
```

Review the staged file list and whitespace check before committing. Verify the final remote SHA against local HEAD after the push.

## Course submission questions

Confirm the required branch or PR, submission channel and link, screenshots or video, AI attribution or disclosure format, and any additional required workflows or minimum testing evidence. The README on main describes Lab 9 implementation but has no separate grading rubric. The final browser walkthrough remains unverified. Keep the existing Phase 5F browser observations identified as user-reported evidence.

Only the requested root README update and this report were written during preflight. Nothing was staged, committed, merged, or pushed.
