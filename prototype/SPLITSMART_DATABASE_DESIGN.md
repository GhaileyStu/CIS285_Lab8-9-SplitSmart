# SplitSmart — Implementation-Ready Database Design

**Status:** Design proposal for review. This document does not authorize schema, migration, database, application, or dependency changes.

**Target:** SQLite with Prisma 6.19.3 for the repository's existing Next.js/React/TypeScript application. The source specification separately describes a Java Swing MVP and requires web, Android, and iOS for the complete product; this database proposal does not claim that a Swing MVP satisfies the complete-product platform requirement. Store all money as integer cents; use basis points for percentage allocations.

## 1. Design principles

- Immutable revisions, shares, approval decisions, reversals, reversal entries, and payments are the financial audit source.
- `Expense.status`, `Expense.currentBalanceScopeId`, and `PairwiseObligation` are mutable current-state projections. They must be rebuildable from source records.
- Confirmed prior design decision (stricter than the source minimum): a group expense creator, payer, and every participant must be active members of that group when the revision is submitted. The source requires the creator to be a group member and participants to be active members, but does not explicitly require an excluded payer to be an active member. A direct expense contains exactly two distinct users across payer and participants; its authenticated creator must be one of them. Direct accounting scopes are currency-specific: the same unordered pair may have independent scopes in multiple currencies, and values from different currencies are never combined.
- Deletion must not cascade through financial history. Financial owners are retained; correction uses reversal and replacement.
- Prisma represents relational shape and common uniqueness. SQL checks and triggers supplement Prisma where SQLite supports constraints Prisma schema cannot express. Server-side transactional validation remains required for rules spanning multiple rows.

## 2. Model-by-model field and relationship specification

All string IDs use `String @id @default(cuid())` unless stated otherwise. `DateTime` values are UTC instants. SQLite stores `BigInt` money as integer values; serialize BigInt values as decimal strings at JSON boundaries. Enum-like columns are strings with allowed-value checks in migration SQL.

### User

- `id String` — PK.
- `username String` — required, normalized by the server using Unicode NFKC followed by locale-independent Unicode default case-folding; the resulting canonical value is unique. Preserve display spelling separately if needed. This normalization is a proposed default requiring final product confirmation.
- `email String` — required, normalized by server, unique.
- `passwordHash String` — required.
- `displayName String` — required.
- `createdAt DateTime`, `updatedAt DateTime` — required.
- Relations: sessions; owned groups; memberships; invitations sent/accepted; expenses created; revisions created/paid by; shares as participant; approvals; reversals created; notifications; payments as debtor, creditor, and recorder; pairwise-scope users.
- `onDelete`: `Restrict` for every relation that represents group ownership or financial/history participation. Sessions and notifications may use `Cascade` because neither is a financial record. The application does not expose hard account deletion.

### Session

- `id String` — PK.
- `userId String` — required FK to User.
- `tokenHash String` — required unique; raw cookie token is never stored.
- `createdAt DateTime`, `expiresAt DateTime` — required; `revokedAt DateTime?` — optional.
- Relation: User.
- `onDelete`: `Cascade` from User; session revocation/deletion cannot remove financial history.

### LoginThrottleBucket

- `id String` — PK.
- `kind String` — required: account, source, or account/source bucket.
- `keyHash String` — required, HMAC/hash of canonical bucket key; unique with `kind`.
- `failureCount Int`, `windowStartedAt DateTime`, `delayLevel Int`, `updatedAt DateTime` — required.
- `blockedUntil DateTime?` — optional.
- No User FK; account keys can represent nonexistent usernames and source identifiers are not stored in plaintext.

### Group

- `id String` — PK.
- `ownerId String` — required FK to User.
- `name String`, `currencyCode String`, `createdAt DateTime`, `updatedAt DateTime` — required.
- Relations: owner; memberships; invitations; expenses; one group BalanceScope.
- `onDelete`: `Restrict` from owner, membership, invitation, expense, and scope relations. No hard group deletion.

### GroupMembership

- `id String` — PK.
- `groupId String`, `userId String` — required FKs.
- `role String`, `status String` — required; `createdAt DateTime`, `deactivatedAt DateTime?`.
- Relations: Group, User, membership periods.
- Unique `(groupId, userId)`; soft deactivation and reactivation update current status without deleting period history.
- `onDelete`: `Restrict` from Group, User, and MembershipPeriod relations.

### MembershipPeriod

- `id String` — PK.
- `membershipId String` — required FK to GroupMembership.
- `joinedAt DateTime` — required; `leftAt DateTime?` — open period when null.
- Relation: GroupMembership.
- A rejoin creates a new period after closing the prior period; it never overwrites or erases prior periods.
- `onDelete`: `Restrict` from GroupMembership.

### Invitation

- `id String` — PK.
- `groupId String`, `invitedByUserId String` — required FKs.
- `acceptedByUserId String?` — optional FK to User.
- `emailNormalized String`, `tokenHash String`, `status String`, `expiresAt DateTime`, `createdAt DateTime` — required.
- `acceptedAt DateTime?`, `revokedAt DateTime?` — optional.
- Relations: Group, inviter, optional accepting user.
- Unique `tokenHash`; indexes for group/status/expiry and normalized email/status.
- `onDelete`: `Restrict` for Group and inviter; `SetNull` for optional accepting-user reference so the invitation record is preserved.

### BalanceScope

- `id String` — PK.
- `kind String` — required: `GROUP` or `DIRECT`.
- `groupId String?` — optional FK to Group, unique when nonnull.
- `directLowUserId String?`, `directHighUserId String?` — optional FKs to User; for direct scope, both required and ordered lexicographically with low < high.
- `currencyCode String` — required ISO 4217 code from the product-supported set. For GROUP it must equal the group's configured currency. For DIRECT it identifies this pair's currency-specific scope. The supported set and whether only two-decimal currencies are allowed remain product decisions.
- `createdAt DateTime` — required.
- Relations: optional Group; optional low/high User; expenses/revisions; pairwise projections; reversals and payments through source records.
- One group scope per group. One direct scope per unordered pair **and currency**. A pair can have separate USD, CAD, EUR, or other supported-currency scopes. The unique identity of a DIRECT scope is `(directLowUserId, directHighUserId, currencyCode)`. Scope rows are retained while referenced by any financial source record.
- `onDelete`: `Restrict` from Group, User, Expense, ExpenseRevision, Reversal, and Payment. Pairwise projection rows may cascade with scope deletion only after no source records reference the scope; operationally scopes are not deleted.

### Expense

- `id String` — PK.
- `kind String` — required: `GROUP` or `DIRECT`.
- `groupId String?` — optional FK to Group; required for GROUP, null for DIRECT.
- `createdByUserId String` — required FK to User.
- `currentRevisionNumber Int` — required projection selecting the latest revision.
- `currentBalanceScopeId String?` — optional FK to BalanceScope; **current-state projection only** and not the authoritative accounting scope.
- `status String` — required projection: `PENDING`, `APPROVED`, `REJECTED`, or `REVERSED`. Group expenses start PENDING. Under the proposed prototype default direct expenses start APPROVED; if direct participant review is selected they start PENDING.
- `createdAt DateTime`, `updatedAt DateTime` — required.
- Relations: creator, optional group, optional current scope projection, revisions, notifications.
- Indexes: `(groupId, createdAt)`, `(createdByUserId, createdAt)`, `(status, createdAt)`, `(currentBalanceScopeId)`.
- `onDelete`: `Restrict` from creator, Group, current scope, and revisions.

### ExpenseRevision

- `id String` — PK.
- `expenseId String` — required FK to Expense.
- `revisionNumber Int` — required, starts at 1 and increases monotonically.
- `createdByUserId String` — required FK to User; records who created this exact revision.
- `createdAt DateTime` — required; records when this exact revision was created.
- `payerUserId String` — required FK to User.
- `balanceScopeId String` — required FK to BalanceScope; **authoritative immutable accounting scope for this revision**.
- `amountCents BigInt` — required and > 0.
- `currencyCode String` — required.
- `expenseDate DateTime`, `description String`, `splitMethod String` — required.
- Relations: Expense, revision creator, payer, scope, shares, approvals, optional receipt, optional reversal.
- Unique `(expenseId, revisionNumber)`; indexes `(balanceScopeId, expenseDate)`, `(payerUserId, expenseDate)`, `(createdByUserId, createdAt)`.
- `onDelete`: `Restrict` from Expense, creator, payer, scope, shares, approvals, receipt, and reversal.
- Revisions are immutable. A pending edit inserts a new revision and updates the Expense current-revision/status/scope projections transactionally. Superseded revisions remain unchanged. Once a revision is approved, neither it nor its expense contents may be edited; any correction must reverse the approved revision and create a replacement expense/revision.

### ExpenseShare

- `id String` — PK.
- `revisionId String` — required FK to ExpenseRevision.
- `participantUserId String` — required FK to User.
- `shareCents BigInt` — required and >= 0; zero-cent shares are valid.
- `percentageBasisPoints Int?` — null for equal split; 0–10,000 for percentage split.
- `allocationOrder Int` — required, immutable participant order from the submitted revision, used to identify the first submitted participant for residual adjustment when the payer is excluded.
- Relations: revision, participant.
- Unique `(revisionId, participantUserId)` and `(revisionId, allocationOrder)`; index `(participantUserId, revisionId)`.
- `onDelete`: `Restrict` from revision and participant. Shares are immutable.

### Approval

- `id String` — PK.
- `revisionId String` — required FK to ExpenseRevision.
- `participantUserId String` — required FK to User.
- `decision String` — required: `APPROVE` or `REJECT`.
- `createdAt DateTime` — required.
- Relations: revision, participant.
- Unique `(revisionId, participantUserId)`; indexes `(participantUserId, createdAt)`, `(revisionId, decision)`.
- `onDelete`: `Restrict` from revision and participant. Decisions are immutable.

### Reversal

- `id String` — PK.
- `revisionId String` — required FK to the original approved ExpenseRevision; unique, so a revision can be reversed once.
- `createdByUserId String` — required FK to User.
- `replacementExpenseId String?` — optional FK to replacement Expense, unique when nonnull.
- `reason String`, `createdAt DateTime` — required.
- A committed Reversal row represents a finalized reversal only. Create the Reversal, its complete entry set, projection updates, replacement (if any), and final consistency checks in one transaction; never commit a partial or unfinalized reversal.
- Relations: original revision, creator, optional replacement, reversal entries.
- `onDelete`: `Restrict` from original revision, creator, replacement, and entries.
- Reversal entries below explicitly record every inverse payer/participant obligation for each non-payer source share with nonzero cents. A reversal cannot finalize unless it has exactly one such entry for every eligible source share and no entry for any other share.

### ReversalEntry

- `id String` — PK.
- `reversalId String` — required FK to Reversal.
- `sourceShareId String` — required FK to the original ExpenseShare.
- `balanceScopeId String` — required FK to the original revision’s scope.
- `debtorUserId String`, `creditorUserId String` — required FKs to User.
- `amountCents BigInt` — required and > 0; zero shares produce no obligation/reversal entry.
- Relations: reversal, source share, scope, debtor, creditor.
- Unique `(reversalId, sourceShareId)` prevents reversing a share twice; index `(balanceScopeId, debtorUserId, creditorUserId)`.
- `onDelete`: `Restrict` from every relation.

### Notification

- `id String` — PK.
- `recipientUserId String` — required FK to User.
- `revisionId String` — required FK to ExpenseRevision.
- `kind String`, `createdAt DateTime` — required; `readAt DateTime?` optional.
- Unique `(recipientUserId, revisionId, kind)`; index `(recipientUserId, readAt, createdAt)`.
- `onDelete`: `Cascade` from User and ExpenseRevision; notifications are not financial audit records. Expense revisions themselves are protected from deletion by financial-history restrictions, so this cascade does not permit deleting financial history.

### Receipt

- `id String` — PK and server-generated opaque identifier.
- `revisionId String` — required unique FK to ExpenseRevision.
- `content Bytes` — required private bytes; proposed maximum 5 MB enforced by server, pending product confirmation.
- `detectedContentType String`, `sizeBytes Int`, `sha256 String`, `createdAt DateTime` — required.
- Relation: ExpenseRevision.
- `onDelete`: `Restrict` from revision. Content is not served publicly; download requires expense authorization.

### Payment

- `id String` — PK.
- `balanceScopeId String` — required FK to BalanceScope.
- `debtorUserId String`, `creditorUserId String`, `recordedByUserId String` — required FKs to User; `recordedByUserId` must equal debtor.
- `amountCents BigInt` — required and > 0 under the proposed prototype validation default. The source requires no overpayment but leaves zero/negative payment treatment open.
- `idempotencyKey String`, `requestHash String` — required. Idempotency key unique; request hash is a canonical fingerprint of scope, debtor, creditor, amount, currency, and payment date.
- `paymentDate DateTime`, `createdAt DateTime` — required.
- Relations: scope, debtor, creditor, recorder.
- Unique `idempotencyKey`; indexes `(balanceScopeId, paymentDate)`, `(debtorUserId, creditorUserId, createdAt)`, and `(requestHash)`.
- `onDelete`: `Restrict` from scope and all user relations. Payment rows are immutable.
- Same key and same canonical request hash returns the original Payment result. Same key with a different hash is rejected.

### PairwiseObligation

- `id String` — PK.
- `balanceScopeId String` — required FK to BalanceScope.
- `userLowId String`, `userHighId String` — required FKs to User, ordered low < high.
- `signedBalanceCents BigInt` — required, defaults to 0.
- `updatedAt DateTime` — required.
- Unique `(balanceScopeId, userLowId, userHighId)`; indexes `(userLowId, balanceScopeId)`, `(userHighId, balanceScopeId)`.
- `onDelete`: `Cascade` from BalanceScope is allowed only for this rebuildable projection. Source ledger relations restrict deletion of any scope with financial history.

Sign convention: positive means low-ID user owes high-ID user; negative means high-ID user owes low-ID user; zero means settled. For a debt from debtor D to creditor C, add a positive amount if D is low, otherwise subtract it. A payment from low to high subtracts from the signed amount; a payment from high to low adds toward zero. Every write must validate the current signed direction and sufficient amount.

## 3. Unique constraints and indexes

In addition to the model-specific constraints above:

- User: unique canonical username and normalized email.
- Session: unique token hash; user/expiry and expiry indexes.
- Login throttle: unique `(kind, keyHash)`; index `blockedUntil`.
- GroupMembership: unique `(groupId, userId)`; indexes by group/status and user/status.
- Invitation: unique token hash; lookup indexes by normalized email/status and group/status/expiry.
- BalanceScope: unique nonnull `groupId`; unique direct `(directLowUserId, directHighUserId, currencyCode)`; optional unique canonical scope key including currency.
- ExpenseRevision: unique `(expenseId, revisionNumber)`.
- ExpenseShare: unique `(revisionId, participantUserId)` and `(revisionId, allocationOrder)`.
- Approval: unique `(revisionId, participantUserId)`.
- Reversal: unique `revisionId`; unique nonnull replacement expense ID.
- ReversalEntry: unique `(reversalId, sourceShareId)`.
- Receipt: unique `revisionId` and opaque ID.
- Payment: unique idempotency key.
- PairwiseObligation: unique `(balanceScopeId, userLowId, userHighId)`.

SQLite permits multiple NULL values in unique indexes, so the scope uniqueness indexes must target the nonnull fields for each scope kind. Add partial unique indexes for one GROUP scope per group and one DIRECT scope per `(directLowUserId, directHighUserId, currencyCode)`; do not use a pair-only uniqueness key. Direct scope lookups and foreign-key relationships from revisions, payments, reversals, and pair obligations retain the selected currency-specific scope.

## 4. SQL checks, triggers, and transactional application rules

### SQL `CHECK` constraints

- Expense revision `amountCents > 0`.
- Payment `amountCents > 0` under the proposed prototype validation default; the source leaves zero/negative settlement treatment open.
- Expense share `shareCents >= 0`; zero is allowed.
- Percentage basis points are null or between 0 and 10,000.
- Allowed values for scope kind, expense kind/status, split method, membership status/role, invitation status, approval decision, and notification kind.
- Scope shape: GROUP requires `groupId` and forbids direct IDs; DIRECT requires both direct IDs and forbids `groupId`. Currency code is uppercase and must match the group's configured currency for GROUP scopes. DIRECT scope uniqueness includes currency.
- Direct user order: low ID < high ID. Pair projection user order must be low < high.
- Payment debtor != creditor and `recordedByUserId = debtorUserId`.
- Every persisted monetary amount fits SQLite's signed 64-bit integer range; nonnegative values are at most `9,223,372,036,854,775,807`, and signed projections fit `[-9,223,372,036,854,775,808, 9,223,372,036,854,775,807]`.

Cross-row percentage totals and share sum are verified in the server transaction before persistence. They are not row-level CHECK constraints.

### Custom SQLite triggers

- **Membership periods:** reject overlapping half-open periods `[joinedAt, leftAt)` for the same membership. Allow closing an open period once; disallow changing its start, reopening it, or changing a closed end. Rejoin inserts a new period after the old period is closed.
- **Revision/scope consistency:** require revision scope kind, group, and currency to match its parent Expense and BalanceScope. The revision’s scope is immutable. A trigger on Expense current-revision/current-scope projection updates verifies that the selected latest revision exists and its scope matches the projection.
- **Group currency:** under the proposed prototype default, reject a Group.currencyCode update after the group has any financial ExpenseRevision. A change before financial activity remains subject to supported-currency validation.
- **Approval validity:** before inserting an Approval, require its participant to have an ExpenseShare on that exact revision; require that revision to be the current highest revision number and the Expense projection to be PENDING. For group expenses this is required by the source specification. If product selects participant review for direct expenses, the same exact-revision checks apply; under the proposed prototype default direct expenses are auto-approved and do not collect Approval rows. This blocks nonparticipants and approvals on superseded revisions. Unique `(revisionId, participantUserId)` prevents duplicate decisions.
- **Scope/pair consistency:** a direct PairwiseObligation pair must equal its direct BalanceScope low/high users. Its scope fixes currency. A direct Payment debtor/creditor pair must be exactly those two users in either direction and the payment uses the scope currency. An Expense finalization trigger checks that a DIRECT revision’s union of payer and participants is exactly the scope’s two users, and that its creator is one of them. A GROUP revision must refer to the group scope for its Expense group and match the group currency.
- **Reversal validity:** reject a reversal unless its source revision is approved, has not already been reversed, and each ReversalEntry references a non-payer source share from that revision with nonzero shareCents, uses its payer/participant direction and original currency-specific scope, and matches that share amount. At finalization require an exact set match: one entry per non-payer source share with nonzero cents, no missing or extra entries. Unique `(reversalId, sourceShareId)` prevents duplicates; a finalization trigger or server transaction checks completeness.
- **Money overflow safety:** before aggregating or updating projections, validate all amounts and results using arbitrary-precision integer intermediates. Reject any amount, sum, delta, reversal, payment, or rebuild result outside signed 64-bit range before SQLite arithmetic can overflow. The proposed maximum per monetary amount is `9,223,372,036,854,775,807` cents; this cap and currency-specific product limits require final product confirmation.
- **Username uniqueness:** store or derive a canonical username key using Unicode NFKC followed by locale-independent Unicode default case-folding and enforce uniqueness on that key. Pin the Unicode/library version and migration policy before implementation. This is a proposed default requiring final product confirmation.
- **Financial immutability:** reject UPDATE and DELETE on ExpenseRevision, ExpenseShare, Approval, Reversal, ReversalEntry, Payment, and Receipt. Corrections are represented by new reversal/replacement records. Expense’s status/current revision/current scope fields are projections and may be updated through guarded transactions.
- **Ledger event idempotence:** the conditional Expense status transition and unique Reversal/Payment keys prevent duplicate projection changes; the transaction applies each source event once.

### Expense allocation policy: ROUND_HALF_UP and designated residual

For equal and percentage splits, calculate each participant's exact monetary share, round each share independently to two decimal places using `ROUND_HALF_UP`, then assign the full residual needed to reconcile to the expense total to the payer if the payer is a participant, otherwise to the first participant in submitted order. Use exact decimal arithmetic or integer/rational arithmetic that produces precisely the same `ROUND_HALF_UP` result; never use JavaScript floating-point arithmetic. For percentage splits, integer basis-point allocations must total exactly 10,000. Preserve participant order in `ExpenseShare.allocationOrder`, permit zero-cent shares, and require exact total reconciliation.

The payer receives the designated residual regardless of another participant's fractional remainder. When the payer is excluded, the first submitted participant receives it. Do not substitute largest-remainder allocation or distribute a residual among multiple participants.

**Nonnegative-share validation limitation:** `ExpenseShare.shareCents` is constrained to be nonnegative. After applying the source's designated residual, validate the adjusted share. If it would be negative, reject the allocation and do not create the expense. Some otherwise positive amounts and valid percentage totals therefore cannot be represented under the combination of the source allocation rule and the existing nonnegative-share constraint. For example, $0.03 split 0%, 50%, 50% rounds to $0.00, $0.02, $0.02; assigning the −$0.01 residual to a participating payer with a zero share would produce −$0.01, so this input must be rejected. Likewise, $0.02 split equally among four rounds to $0.01 each, then a −$0.02 residual would make the designated recipient's share negative; reject it. This limitation is documented rather than resolved by changing the source rule, database constraint, or allocation method.

Required allocation examples and assertions:

| Case | Result in submitted participant order |
|---|---|
| $60.00 equally among 3 | $20.00, $20.00, $20.00 |
| $10.00 equally among 3, payer first | $3.34, $3.33, $3.33 |
| $10.00 equally among 3, payer third | $3.33, $3.33, $3.34; payer receives the residual despite not being first |
| $10.00 at 33.33%, 33.33%, 33.34%, payer third | $3.33, $3.33, $3.34 |
| $0.01 at 100%, 0%, payer first | $0.01, $0.00; zero-cent share is preserved |
| $0.03 at 0%, 50%, 50%, payer first | rejected because the designated residual would create a negative share |
| $0.02 equally among 4 | rejected because the designated residual would create a negative share |

Tests must also cover percentage rounding ties, a payer who is not first, zero-cent shares, invalid percentage totals, exact reconciliation, and nonnegative final shares. For every accepted case, assert `sum(shareCents) === amountCents` and `shareCents >= 0` for every participant.

### Source-specification alignment and limitation

This allocation rule restores the source specification's NFR-002, AC-006, SC-002, and assumption requirements: BigDecimal `ROUND_HALF_UP` to two decimal places, with discrepancy assigned to the payer if included and otherwise to the first participant. The source documents remain unchanged. The nonnegative-share validation limitation above is an additional constraint from the approved database design and schema; the source does not specify how to handle a designated residual that would make a share negative. The prototype rejects such an allocation rather than persisting a negative share or silently changing the source algorithm.

### Prisma-enforceable vs server-side transactional validation

Prisma schema can express scalar types, required/optional fields, FKs, relations, ordinary unique constraints, and indexes. SQL migration additions are required for CHECK constraints, partial unique indexes, and triggers.

The server must transactionally validate:

- Authenticated actor and active group membership of group-expense creator, payer, and participants at submission/revision creation, following the confirmed stricter design decision in Section 11. The source itself explicitly requires the creator to be a group member and participants to be active; payer membership is a stricter prior design rule.
- Direct expense's two-user set and creator membership in that set.
- **Expense allocation follows the `ROUND_HALF_UP` and designated-residual policy in Section 4**, using exact decimal, integer, or rational arithmetic without binary floating point. Reject the allocation if the designated residual would make a share negative. Percentage allocations use basis points and must total exactly 10,000. Persist final shares as integer cents and preserve participant submission order in immutable share rows. Validate checked results and signed 64-bit bounds before persistence.
- Currency consistency across scope, group, revision, reversal entry, payment, and source events. A direct expense reuses or transactionally creates the scope for the unordered pair plus currency. Never add or report totals across currencies without an explicit conversion rule; payments settle only within the same currency scope.
- Enforce the configured supported-currency allowlist and two-decimal precision policy. Under the proposed owner-only prototype permission default, only the group owner can invite users or change membership/settings; all authorization is checked server-side. Validate report start/end ordering and use the approved timezone policy when product confirms it.
- Checked arbitrary-precision intermediate arithmetic and signed 64-bit bounds before every persisted sum, delta, and projection update.
- Approval decision belongs to participant on exact current revision; all approvals are required for approval; any rejection blocks approval.
- Under the proposed direct auto-approval default, direct submission, `APPROVED` state, and its obligation updates commit in one transaction. If direct participant review is selected, submission is `PENDING` with no balance effect; the final approval applies obligations atomically, while any rejection leaves it ineffective.
- State transition from PENDING occurs conditionally and only once. The final approval and all affected PairwiseObligation updates commit in one transaction.
- Payment scope, debtor, creditor, active/authorized actor, idempotency payload, and sufficient outstanding balance. Conditional projection update and Payment insert occur in one SQLite transaction.
- Former-member access uses MembershipPeriod and the creator/payer/participant relationship to authorize historical records and settlement; it does not use active membership as the sole rule for settling historical obligations. Proposed default: former participants may approve or reject only the exact pending revision in which they participated, even after leaving, but cannot create new group expenses.
- Proposed reversal authorization defaults: group reversal requires the group owner or original expense creator; direct reversal requires an involved user (original creator, payer, or participant). These defaults require final product confirmation.
- Report date filters use the viewer's local timezone, converted to UTC start-inclusive/end-exclusive query boundaries. This is a proposed default requiring final product confirmation.

## 5. Accounting, reversal, and payment behavior

For every effective approved revision, each participant other than the payer owes their full share to the payer. The payer’s own share creates no obligation. Each nonzero participant obligation updates the payer/participant pair in that revision’s `balanceScopeId`; the group-wide signed positions sum to zero. Group revisions become effective only after all participants approve. Direct revisions are immediately approved under the **proposed prototype default**; if product instead requires participant review for direct expenses, they remain pending, create no obligations, and contribute nothing to balances until all participants approve.

A reversal reverses **every** original non-payer participant obligation with a nonzero share, not just a net expense total. For each eligible original share, create exactly one ReversalEntry with the original debtor (participant), creditor (payer), currency-specific scope, and share cents. Zero-cent shares and the payer's own share produce no entry. Reject incomplete, duplicate, or extra entries at finalization. Apply the exact inverse signed delta to each pair and check signed 64-bit bounds. If previous payments settled some or all of an obligation, the signed pair balance may cross zero: e.g. a $30 debt paid by $10 leaves $20; reversing the full $30 yields $10 in the opposite direction. A fully paid $30 debt reverses to $30 in the opposite direction. All values in an example belong to one currency scope.

Reversal record, complete ReversalEntry set, projection inverse updates, and replacement Expense/Revision/Shares are committed atomically. A group replacement remains pending and creates no obligation until approved. Under the proposed prototype default, a direct replacement is immediately approved and its new obligations are applied in the same transaction as reversal and replacement creation. If direct participant review is selected, the direct replacement remains pending and creates no obligation until approval. If validation fails, reversal entries are incomplete, or arithmetic would overflow, the entire correction transaction rolls back and the reversal cannot finalize.

Payments aggregate against the scope/user pair balance, not against an individual expense. Each payment remains separately recorded and reportable. Idempotency key plus canonical request hash protects retries. Concurrent requests use a conditional update against the latest signed amount and SQLite’s serialized writer; the payment row and projection change either both commit or neither commits.

## 6. Approval, membership history, and historical access

Approvals target an exact ExpenseRevision and a user with a matching ExpenseShare. New Approval rows are rejected if the revision is not the current highest revision, so superseded revisions cannot receive decisions. Group revisions require participant approval as specified. Direct revisions are auto-approved only under the proposed prototype default; if direct review is selected, participant decisions on that exact pending revision govern approval/rejection in the same way. A conditional PENDING-to-APPROVED/REJECTED transition ensures that rejection prevents approval, and approval obligations are applied once.

Membership periods are half-open intervals. A trigger rejects overlap for the same GroupMembership. Deactivation closes the open interval. Rejoining reactivates the membership projection and inserts a new non-overlapping period, preserving old periods.

Former members retain access only to historical records where they were creator, payer, or participant during a MembershipPeriod, including related approvals, payments, and receipts. They may settle outstanding historical obligations. They cannot access records created after deactivation. Current active group members can access group history. Authorization is checked server-side on each read/download/action.

## 7. Projection rebuild and reconciliation

`PairwiseObligation` is disposable derived state; rebuilding it never updates or deletes immutable financial records.

For each scope and unordered pair within that scope's single currency, recompute the signed amount as:

1. Add obligations from each effective approved revision. A group revision is effective only if every share participant has an APPROVE record on that revision and no participant rejected it. Under the proposed prototype default, direct revisions are immediately approved and effective. If direct participant review is selected, a direct revision is effective only after all participants approve it; pending or rejected direct revisions contribute no obligation.
2. Subtract the original obligations represented by each ReversalEntry.
3. Apply each Payment in its recorded debtor-to-creditor direction, reducing the signed balance toward zero or, if a later reversal changes the net direction, applying the payment ledger delta exactly as recorded.

For a deterministic rebuild, sum source deltas by `(balanceScopeId, lowUserId, highUserId)` using checked arbitrary-precision integer intermediates, then validate signed 64-bit bounds. Currency is determined by the scope and is never dropped from reconciliation grouping or combined with another scope. Payment validity at recording time is separately validated against the then-current projection. Recompute Expense status/current-revision/current-scope projections from the latest revision, its approvals, and reversal record.

Reconciliation runs in a transaction or maintenance window: compute expected projections into a temporary result, compare against PairwiseObligation, report discrepancies, and replace only projection rows after explicit reconciliation action. Never “repair” by editing financial source rows. Verify group member signed positions sum to zero after rebuilding. Direct pairs are reconciled independently from group scopes.

## 8. Foreign-key deletion policies

Financial and historical relations use `onDelete: Restrict`:

- User to Group owner, membership, invite creator, Expense creator, revision creator/payer, share participant, approver, reversal actor, payment debtor/creditor/recorder, and direct scope user.
- Group to memberships, invitations, expenses, and group scope.
- GroupMembership to MembershipPeriod.
- Expense to ExpenseRevision; ExpenseRevision to ExpenseShare, Approval, Receipt, and Reversal use `Restrict`. Notifications are nonfinancial and may cascade when a revision is removed through an authorized cleanup path; financial-history restrictions still prevent deleting revisions with financial records.
- BalanceScope to Expense/Revision/Reversal/Payment source records.
- Reversal to ReversalEntry and replacement Expense; ReversalEntry to source share, scope, debtor, and creditor.
- Payment to scope and all involved users.

Permitted nonfinancial cleanup: User deletion may cascade Sessions and Notifications; Invitation’s optional accepted-user FK may `SetNull` while retaining the invitation. PairwiseObligation may cascade from a BalanceScope only because it is a projection; source-record FKs prevent deleting a scope with financial history. The application does not expose hard deletion of groups, memberships, users with financial references, expenses, revisions, or payments.

## 9. Unique constraints and indexes summary

- User: unique canonical username and normalized email.
- Session: unique token hash; `(userId, expiresAt)` and `expiresAt` indexes.
- LoginThrottleBucket: unique `(kind, keyHash)`; `blockedUntil` index.
- GroupMembership: unique `(groupId, userId)`; group/status and user/status indexes.
- MembershipPeriod: membership/start index; overlap is enforced by triggers.
- Invitation: unique token hash; email/status and group/status/expiry indexes.
- BalanceScope: unique nonnull group ID; unique nonnull direct low/high/currency tuple; optional unique scope key including currency.
- Expense: group/created, creator/created, status/created, current scope indexes.
- ExpenseRevision: unique `(expenseId, revisionNumber)`; scope/date, payer/date, creator/created indexes.
- ExpenseShare: unique revision/participant and revision/order; participant/revision index.
- Approval: unique revision/participant; participant/date and revision/decision indexes.
- Reversal: unique source revision and unique nonnull replacement ID.
- ReversalEntry: unique reversal/source share; scope/debtor/creditor index.
- Notification: unique recipient/revision/kind; recipient/read/created index.
- Receipt: unique revision and opaque ID.
- Payment: unique idempotency key; scope/date, debtor/creditor/date, and request-hash indexes.
- PairwiseObligation: unique scope/userLow/userHigh; indexes by either user and scope.

## 10. Migration integrity and data preservation

Current inspection found no `prototype/dev.db` and no migration directory; do not infer that a database exists elsewhere. Before implementation, inspect the configured database path read-only and stop if an unexpected database or migration history is found.

Proposed sequence, only after approval:

1. Verify branch and working tree; confirm exact `DATABASE_URL`, database path, existing tables/row counts, and `_prisma_migrations` state read-only.
2. Preserve `EnvironmentCheck` and every existing table/row. If the target DB is absent, record that fact before any creation. If a database exists without migration history, compare actual schema with the intended baseline and resolve its baseline state without resetting or dropping data. When introducing currency-specific direct scopes, preserve each expense/payment/reversal's original currency and map its pair to the matching `(low user, high user, currency)` scope; never merge balances from distinct currencies. Abort for review if existing records cannot be assigned an unambiguous currency.
3. Prepare the Prisma 6.19.3 migration as additive create/alter operations; review generated SQL before applying. Add CHECK constraints, partial indexes, and triggers in authored SQL within the migration directory.
4. Preserve every applied migration file as immutable history. Future migrations that alter/rebuild SQLite tables must explicitly recreate any affected custom CHECK constraints, partial indexes, and triggers. Prisma schema diff may not model all custom SQL, so review every generated migration for unintended drops and manually carry forward custom DDL.
5. Validate migrations by replaying the complete migration history against a disposable database only after implementation approval. Inspect `sqlite_master` for required checks/indexes/triggers and run schema/data verification against the real database without reset.
6. Verify that `_prisma_migrations` entries match the reviewed migration files and that all pre-existing data remains intact. Reconcile each currency scope independently and verify all migrated amounts and recomputed sums fit the signed 64-bit range.

## 11. Decisions, proposed defaults, and remaining questions

### Confirmed design decisions

- **Expense allocation:** round each equal or percentage allocation half-up to cents, then assign the full residual to the payer if participating or otherwise to the first submitted participant. Use exact arithmetic without binary floating point, preserve zero-cent shares and order, reconcile exactly, and reject the case if the designated share would become negative.
- **Direct-pair currency:** separate direct balances per unordered user pair and currency. Scope identity is `(directLowUserId, directHighUserId, currencyCode)`. Expenses and payments use the matching currency-specific scope; balances are never combined across currencies. Group expenses continue to use the group's configured currency.
- **Financial correction:** approved expense revisions cannot be edited. Correct them through reversal and replacement.
- **Reversal completeness:** finalization requires exactly one reversal entry for every non-payer source share with nonzero cents; missing, duplicate, and extra entries are rejected.
- **Group payer membership:** group expense creator, payer, and participants are all required to be active group members at submission. This retains the prior stricter design decision; the source expressly requires group creator membership and active participants but does not expressly state the payer condition.
- **Former members:** historical access and settlement of authorized historical obligations remain available. Former members cannot create new group expenses.

### Proposed defaults requiring final product confirmation

- **Money limits:** cap each nonnegative monetary amount at SQLite's signed 64-bit maximum (`9,223,372,036,854,775,807` cents), with signed projection range checks and checked arbitrary-precision intermediate arithmetic. Confirm this product-level maximum and whether lower per-currency limits are needed.
- **Direct-expense approval:** source documents leave participant review open. Proposed prototype default: direct expenses are immediately approved on creation. If review is selected, direct expenses remain pending, produce no balance effect until every participant approves, and rejected/pending revisions are excluded from reversals and projection rebuilds; only an approved direct expense may be reversed.
- **Group currency changes:** proposed default is to make a group currency immutable after the first financial revision. For a different currency, create a new group or require an explicit migration that preserves the original scope and currency for every historical revision; do not retarget existing revisions.
- **Supported currency catalog:** proposed scope is currencies compatible with two-decimal amounts because the source mandates two-decimal monetary precision and this design persists integer cents; confirm the catalog.
- **Account/group deletion:** proposed default is soft deactivation and no hard deletion while financial/history references exist. Retention duration and erasure policy remain open.
- **Receipt handling:** proposed maximum is 5 MB; formats, retention, and SQLite versus private external storage remain open.
- **Account recovery and detailed group permissions:** proposed prototype default is owner-only group settings/membership administration. Recovery workflow and delegated roles are not specified by the source.
- **Report dates:** proposed interpretation is viewer-local dates converted to UTC start-inclusive/end-exclusive bounds. Confirm timezone source; extra report parameters are unspecified.
- **Settlement validation:** debtor-only partial/full payments and no overpayment are source requirements. Positive-only payment amounts are a proposed validation default.
- **Username normalization:** Unicode NFKC plus locale-independent case-folding is a proposed canonicalization policy; confirm compatibility and Unicode version.
- **Former-member decisions and reversal permissions:** proposed defaults allow a former participant to decide only the exact pending revision they participated in; group reversal by owner or original creator; direct reversal by an involved user.

### Unresolved product decisions

1. Direct-expense approval: the specification leaves this open; the immediate-approval default and review alternative are described in Section 5.
2. Supported currency catalog, group currency changes, account/group erasure and retention duration, account recovery, delegated group roles, notification failure and future channels, additional report filters and timezone source, receipt formats/storage/retention, zero/negative payment treatment, and proposed permission defaults.

### Deferred future-product capabilities

- Android/iOS clients, push and other web/mobile notification channels, account recovery, expanded report filters, delegated group roles, and cross-currency conversion are outside this database prototype. FR-010 remains a complete-product requirement; this database prototype does not satisfy it by itself.

## 12. Source requirement reconciliation

Compared this proposal with `UserRequirement.md` and `specs/001-expense-sharing/spec.md`, treating the specification as the authoritative elaboration of UserRequirement.md. The requirements checklist confirms that Open Questions remain available for clarification/planning; absence of [NEEDS CLARIFICATION] markers does not mean those questions have been decided.

### Explicit source requirements and exact gaps

1. FR-003 requires the group expense creator to be a group member; FR-004 requires each group participant to be an active member. Neither says that an excluded payer must be a member. The prior stricter rule that creator, payer, and participants must all be active group members is retained as a confirmed design decision, clearly distinguished from source text. Recommended rule: retain it because it was previously established, it provides consistent group-scoped authorization for all expense actors, and it does not conflict with the source, while recognizing that the payer condition is stricter than the stated minimum.
2. FR-005 explicitly requires participant approval for group expenses. AC-005 says direct expenses are recorded without group approval, but Open Question 2 explicitly asks whether direct expenses also need participant review. Direct-expense approval therefore remains a genuine product decision; the immediate-approval rule is only the proposed prototype default and its alternative effects are specified consistently in Sections 5–7.
3. NFR-002, AC-006, SC-002, and the source assumptions require BigDecimal `ROUND_HALF_UP` for each share and assign the allocation discrepancy to the payer or first participant. Section 4 follows that source rule. The source does not define the case where the designated residual would make a share negative; because the database requires nonnegative shares, the prototype rejects that allocation and documents this limitation. Source documents are not modified. Persist results as integer cents and enforce checked 64-bit bounds.
4. The source specifies group-configured currency and selected currency for a direct expense, but does not enumerate supported currencies or decide group currency changes. The separate direct pair/currency scope is a confirmed design decision; no cross-currency aggregation or implicit conversion is permitted.
5. The source requires debtor-only payment and rejects overpayment; zero/negative payments remain open. It requires date-range reporting, but leaves extra filters/timezone unresolved. It also leaves receipt formats/size/retention, account recovery, detailed group roles, and notification delivery failures/future channels open.

### Platform scope

The database target remains the existing Next.js/React/TypeScript application, SQLite, and Prisma 6.19.3. The specification separately defines a Java Swing MVP subset and states that the complete customer-requested product must support web, Android, and iOS; a Swing-only MVP does not satisfy FR-010.

Notification cleanup is nonfinancial and cannot delete immutable financial history. This correction pass changes only this design document and does not authorize implementation.

## 13. Final Design Approval Checklist

Database implementation remains on hold until the product owner confirms or accepts these proposed defaults:

- [ ] Direct-expense approval: immediate approval for the prototype, or participant review.
- [ ] Supported currency list, two-decimal currency restriction, and group currency immutability after financial activity.
- [ ] Account/group erasure and retention duration, while preserving the prohibition on deleting referenced financial history.
- [ ] Receipt formats, proposed 5 MB cap, storage location, and retention.
- [ ] Account recovery and whether group management remains owner-only or delegated.
- [ ] Notification failure handling and future web/mobile channels.
- [ ] Report timezone source and additional report filters.
- [ ] Rejection of zero/negative payments in addition to source-required debtor authorization and no overpayment.
- [ ] Signed 64-bit monetary maximum and any lower product limits.
- [ ] Username normalization compatibility/version policy.
- [ ] Former-member approval and group/direct reversal permissions.

The stricter active-group-payer rule remains a prior confirmed design decision; the source specification gap is documented in Section 12. No schema, migration, database, application, or dependency implementation is authorized until explicit approval.
