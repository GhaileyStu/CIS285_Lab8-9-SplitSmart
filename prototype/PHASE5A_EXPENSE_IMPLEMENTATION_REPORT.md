# SplitSmart Lab 9 — Phase 5A Expense Allocation and Creation Review

**Date:** 2026-11-18
**Branch:** `feature/splitsmart-prototype`
**Status:** Phase 5A allocation and expense creation are implemented. The recorded automated checks passed. This report is a guided review of the delivered scope and its boundaries.

## 1. Phase goal and boundary

Phase 5A establishes reusable expense allocation and transactional expense creation on the existing Next.js, TypeScript, Prisma 6.19.3, and SQLite foundation. It does not implement the full product. In particular, this phase does not add the group approval workflow, payment settlement, reversals, authentication/session handling, notifications, reports, API routes, or user interface features.

The approved design and source-aligned allocation policy remain authoritative. The allocation rule is independent per-share `ROUND_HALF_UP`, followed by assigning the complete residual to the payer when they are a participant, otherwise to the first submitted participant. The residual recipient does not get priority during the initial rounding step.

## 2. Files delivered

| File | Purpose |
| --- | --- |
| `prototype/src/features/phase5a/expenses/allocation.ts` | Validates allocation inputs, calculates exact cent shares, applies the approved residual rule, and returns ordered allocations. |
| `prototype/tests/phase5a/expenses/allocation.test.ts` | Unit tests for equal and percentage allocation, rounding, remainder handling, validation, and reconciliation. |
| `prototype/src/features/phase5a/expenses/create-expense.ts` | Validates and creates group or direct expenses inside a Prisma transaction. |
| `prototype/tests/phase5a/expenses/create-expense.test.ts` | Service tests using isolated disposable SQLite databases. |
| `prototype/src/lib/prisma.ts` | Shared Prisma client singleton, with global caching outside production. |
| `prototype/PHASE5A_EXPENSE_IMPLEMENTATION_REPORT.md` | This review report. |

The approved database design document was also updated to restore the source-aligned allocation policy and record the nonnegative-share limitation. The Prisma schema and migrations were not changed. `npx prisma generate` generated the local Prisma client; it did not change dependencies or the schema.

## 3. Allocation behavior

### Inputs and exact arithmetic

The API accepts a decimal amount string, a split type (`EQUAL` or `PERCENTAGE`), payer ID, and the submitted participant list. Percentage splits additionally include each participant's integer basis points. Amount strings are parsed into `BigInt` cents. Ratio calculations use integer numerator/denominator arithmetic; no JavaScript floating-point arithmetic is used.

For equal splits, each participant's exact fraction of the total is rounded independently to cents using `ROUND_HALF_UP`. For percentage splits, the exact share is `amountCents × basisPoints / 10,000`, also rounded independently with `ROUND_HALF_UP`. The service then computes the residual between the expense total and the rounded shares and assigns the entire residual according to the payer/first-submitted-participant rule. This is the approved source policy, even when a different distribution might produce nonnegative shares.

### Validation

The allocator rejects empty or duplicate participant lists, missing payer IDs, malformed or non-positive amount strings, amounts above the SQLite signed 64-bit maximum, unsupported split types, negative/non-integer/out-of-range basis points, and percentage totals other than 10,000. It also verifies that the final shares are nonnegative, within supported integer bounds, and sum exactly to the source amount. Zero-cent shares are valid.

### Worked examples

All values below follow independent `ROUND_HALF_UP` first and then apply the full residual to the designated recipient.

| Input | Independent rounded shares | Residual recipient | Final result |
| --- | --- | --- | --- |
| $60.00 equal among 3 | $20.00, $20.00, $20.00 | None; residual $0.00 | $20.00, $20.00, $20.00 |
| $10.00 equal among 3; payer is participant 1 | $3.33, $3.33, $3.33 | Payer receives +$0.01 | $3.34, $3.33, $3.33 |
| $10.00 equal among 3; payer is participant 3 | $3.33, $3.33, $3.33 | Payer receives +$0.01 | $3.33, $3.33, $3.34 |
| $0.01 split 50%/50%; payer is participant 2 | $0.01, $0.01 | Payer receives −$0.01 | $0.01, $0.00 |
| $0.03 split 0%/50%/50%; payer has 0% | $0.00, $0.02, $0.02 | Payer would receive −$0.01 | Rejected: negative final share |
| $0.02 equal among 4; payer is participant 1 | $0.01, $0.01, $0.01, $0.01 | Payer would receive −$0.02 | Rejected: negative final share |

The last two rows expose an inherent limitation of the approved policy: independently rounded shares can exceed the total, leaving a negative residual. If that residual is assigned to a participant with too small a rounded share, a nonnegative share cannot be preserved. The allocator rejects such an input with a domain error (`UNALLOCATABLE_RESIDUAL`); it does not silently change the rule, allow a negative share, or persist an unreconciled expense. The approved design document records this limitation. Product/design review is needed if those valid-looking inputs must be accepted under a different policy.

## 4. Expense creation flow

`createExpense` accepts an explicit authenticated actor/user ID and a discriminated group/direct expense input. The service follows this sequence:

1. Validate required identifiers, description, expense date, currency format where applicable, amount, split definition, payer, and participants.
2. Confirm the actor, payer, and participants exist.
3. Resolve authorization and accounting scope. Group expenses use the group's configured currency and a group `BalanceScope`. Direct expenses require exactly two people across payer and participants, require the actor to be one of those people, and use/create the currency-specific direct scope for that unordered pair.
4. Calculate and validate the ordered shares.
5. Within one Prisma transaction, create the expense, its initial revision, and its ordered expense-share records. A failure rolls back all writes.
6. For direct expenses only, mark the expense approved and update the corresponding `PairwiseObligation` in that same transaction. Group expenses remain pending and do not affect pairwise balances in this phase.

Group expense creation requires the group to exist and the creator, payer, and every submitted participant to have active membership. Direct creator validation requires the actor to be the payer or one of the participants; the direct transaction is limited to the relevant two-user pair. Group currency comes from the group configuration. Direct balance scopes include both canonical user IDs and currency, so USD and CAD obligations remain separate.

The pairwise sign convention is maintained: a positive amount means the canonical low user owes the high user; a negative amount means the high user owes the low user. A participant's share creates an obligation to the payer; the payer's own share creates no self-obligation. Projection updates use checked integer arithmetic and reject signed 64-bit overflow.

The typed result contains identifiers, status, currency, integer-cent strings, participant IDs, basis points, and submitted order metadata. It does not return receipt contents or account data.

## 5. Initial statuses and projection effects

| Expense kind | Initial state | Approval rows | Pairwise projection |
| --- | --- | --- | --- |
| Group | `PENDING` | None created by this phase | No update while pending |
| Direct | `APPROVED` under the approved prototype default | None | Updated transactionally with expense creation |

Approval/rejection behavior for group expenses remains outside Phase 5A. No pending group expense is included in balances. Rebuilding projections, payments, and reversal handling also remain outside this phase.

## 6. Automated test coverage

`npx vitest run` passed **2 test files and 23 tests**.

**Allocation tests (13):** evenly divisible equal split; equal split remainder; payer at first or later submitted position; payer excluded and residual assigned to first participant; percentage `ROUND_HALF_UP`; tied rounded percentages; zero-cent shares; tiny amounts; invalid percentage total/values; duplicate or missing participants; missing payer; malformed, non-positive, or overflowing amounts; unsupported split type; negative residual rejection; exact reconciliation and nonnegative assertions for accepted allocations.

**Expense creation tests (10):** valid pending group expense with revision and ordered shares; invalid/inactive group membership; invalid payer/participant records; direct expense approval and no approval rows; separate USD/CAD scopes; actor neither payer nor participant; direct pair limitation; correct pairwise sign and no self-obligation; pending group has no projection effect; transaction rollback on projection overflow; invalid date, description, and currency.

Service tests build an isolated temporary SQLite database by running the existing migration SQL against that disposable file and point Prisma at it. The tests do not connect to the Phase 4 development database, and their temporary directory is removed afterward.

## 7. Verification results

| Check | Result |
| --- | --- |
| `npx vitest run` | Passed: 2 files, 23 tests |
| `npx tsc --noEmit` | Passed; existing TypeScript target unchanged |
| `npm run lint` | Passed |
| `npx prisma validate` | Passed |
| Prisma CLI / `@prisma/client` versions | Both 6.19.3 |
| `git diff --check` | Passed |

The Phase 4 database at `prototype/prisma/dev.db` was not used by the tests, reset, or replaced. Its recorded before/after SHA-256 remained `107b9b2fb10f65795c18292594e2f1d1826a407581edb93294d7abbab665cd5c` (405,504 bytes).

## 8. Scope and remaining limitations

- Prisma schema, migrations, package manifest, and lockfile were not modified; Prisma was not upgraded.
- The development database was not modified. Tests used only a disposable temporary database.
- The nonnegative-share guard means some inputs that pass the basic amount and percentage checks are rejected when the specified residual would make one share negative.
- Group approval/rejection, payment services, reversals, account/session authentication, notifications, reports, API endpoints, and UI work remain unimplemented by design in this phase.
- No changes were staged, committed, or pushed.

## 9. Final working-tree status

At the final verification on 2026-11-18, `git status --short --branch` was:

```text
## feature/splitsmart-prototype...origin/feature/splitsmart-prototype
```

There were no staged, modified, or untracked files at that verification. The earlier status snapshot from the original implementation report is superseded by this current clean status.

## 10. Independent final verification — 2026-11-18

The implementation, tests, approved design, and source requirements were independently reviewed again. These checks completed successfully:

| Check | Observed result |
| --- | --- |
| `npx vitest run` | Passed: 2 test files, 23 tests |
| `npx tsc --noEmit` | Passed |
| `npm run lint` | Passed |
| `npx prisma validate` | Passed |
| Prisma CLI and `@prisma/client` | Both 6.19.3 |
| `git diff --check` | Passed |

The verification found no inconsistency among the allocation implementation, its tests, and the approved design's ROUND_HALF_UP plus designated-residual policy. The tests explicitly reject negative-share residual cases, matching the design's documented limitation.

### Source-requirement gaps to retain for follow-up

- The SplitSmart specification literally requires `BigDecimal`. The TypeScript implementation uses exact `BigInt` rational arithmetic and reproduces the specified rounding without floating point, but does not use that named type. This is a technology-wording discrepancy to resolve for the TypeScript implementation context.
- The source requires valid approved allocations to reconcile. Under the specified independent rounding and designated residual rule, some positive amounts with valid percentages (and some small equal splits) would make the designated share negative. The implementation rejects those inputs to preserve the schema's nonnegative-share constraint. This limitation is explicitly documented and tested, but means those cases are not accepted.
- Group creator, payer, and participants are all required by the approved design to be active members. The specification explicitly requires a group creator/member and active participants, but does not expressly require an excluded payer to be a member; the design identifies the payer condition as the stricter prior decision.

### Database verification

The tests use an isolated SQLite file created in the system temporary directory and remove it afterward. No migration or database-changing command was run. The development database `prototype/prisma/dev.db` had SHA-256 `107b9b2fb10f65795c18292594e2f1d1826a407581edb93294d7abbab665cd5c` and size 405,504 bytes during final verification, matching the hash recorded in the earlier report. No verification command targeted that database.

### Remaining Lab 9 work

The Next.js routes still consist only of the starter home page, layout, and global stylesheet; no interactive application UI or API/server actions are present. Remaining work includes local account authentication, group and member management, expense entry and history UI, group approval/rejection, group balance views, payment settlement, reports and date filters, notifications, receipt handling, and responsive web UI. Android and iOS remain broader product requirements beyond this web prototype.

Recommended next implementation phase: build an authenticated interactive vertical slice for account access, group/member management, and expense creation/history. Follow with approval and group balances, then payment settlement and reports. This report update does not authorize or begin that implementation.

