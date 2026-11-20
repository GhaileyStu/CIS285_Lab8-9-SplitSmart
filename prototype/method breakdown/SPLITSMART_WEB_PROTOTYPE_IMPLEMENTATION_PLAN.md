# SplitSmart Lab 9 — Revised Implementation Design

## Requirements summary

The web prototype will provide persistent accounts; owner-managed groups and invitations; group and direct expenses; equal and percentage splits; participant approvals; in-app notifications; balances; partial payments; and date-filtered expense, balance, and payment reports.

Core rules: each expense has exactly one payer and at least one participant; the payer may be excluded from participants. Amounts must be positive. Percentage splits must sum to exactly 10,000 basis points. Group participants must be active members. Group expenses remain pending until every participant approves; one rejection rejects the expense. Pending and rejected expenses do not affect balances. Direct two-person expenses are approved immediately. Only a debtor may record payment, and payment cannot exceed current outstanding debt.

The specified target includes web, Android, and iOS. This repository is a web application, so this deliverable is a web prototype and does not satisfy the separate mobile-client requirement.

## Domain model

- **User** — unique username and email, password hash, display name.
- **Session** — hashed opaque session token, user ID, creation/expiry/revocation timestamps. The browser receives the raw token only in a secure, HTTP-only cookie.
- **Group** — name, currency, owner, timestamps.
- **Membership** — user, group, role, active status; unique user/group pair.
- **Invitation** — group, email, inviter, hashed token, status, expiry; acceptance requires a signed-in account with the matching email.
- **Expense** — optional group, creator, separate payer ID, amount cents, date, description, split method, status, receipt metadata.
- **ExpenseShare** — expense, participant, allocated cents, and percentage basis points for percentage allocations.
- **Approval** — expense, participant, decision, decision timestamp; unique expense/participant pair.
- **Notification** — recipient, expense, created/read timestamps.
- **PairwiseObligation** — scope (group ID or direct-expense context), debtor, creditor, outstanding cents. Unique scope/debtor/creditor key. This is the transactionally maintained amount available for settlement; the expense and payment records remain the audit ledger.
- **Payment** — scope, debtor, creditor, positive amount cents, date, created timestamp. Each row represents one partial or full settlement event.
- **Receipts** — private bytes stored in the database (or a private non-public storage location) with content type and metadata. No receipt is placed under `public/`.

Balances and reports are derived from approved expenses, payments, and pairwise obligations; there is no independently editable user balance. Prisma remains at 6.19.3 with SQLite. All persisted monetary amounts use integer cents; percentage rates use integer basis points.

## Split calculation and determinism

Participants are deduplicated and sorted by stable user ID ascending before allocation. Equal splits use integer division: each starts with `floor(totalCents / participantCount)`, and leftover cents are assigned one at a time in that stable order. Percentage splits require integer basis points summing to 10,000. Each raw share is rounded to the nearest cent using half-up integer arithmetic. The difference between the rounded shares and the expense total is then assigned deterministically: first to the payer if they are a participant, otherwise to the first participant in stable ID order. The implementation will assert that every share is nonnegative and the share sum equals the original total before saving.

Examples:

- **$10.00 equally among three**: sorted participants A, B, C. Base shares are 333 cents; one remainder cent goes to A, yielding **$3.34, $3.33, $3.33**. If the payer is a participant, the payer receives the discrepancy cent as specified; otherwise the first sorted participant receives it.
- **$10.00 by percentage**: 3,333, 3,333, and 3,334 basis points yield rounded amounts of $3.33, $3.33, and $3.33; one discrepancy cent goes to the payer if participating, otherwise first sorted participant. Final shares reconcile to **$10.00**. A simpler exact example, 2,500/3,500/4,000 basis points, yields **$2.50/$3.50/$4.00**.
- **Invalid percentage split**: 3,333 + 3,333 + 3,333 = 9,999 basis points is rejected before persistence.

## Balance and debt rules

The payer does not have to be a participant. A participant payer's own share is their consumption of the amount they advanced, so it creates no self-debt and no self-transfer. For each approved expense, every participant other than the payer owes their full allocated share to that expense's payer. If the payer is not participating, all participant shares are obligations to the payer. This means the expense's payer-funded credit equals the sum of debts created for other participants; group member net positions therefore sum to zero.

For the same scope and ordered debtor/creditor pair, approved expense obligations are added together and successful payments are subtracted. The displayed pairwise debt is the remaining nonnegative obligation; opposing obligations are shown as separate directional rows rather than silently netted across unrelated group/direct scopes. Group-wide member position is computed as total receivable minus total payable within that group. Summing these signed positions across all members must equal zero before and after payments. Direct expenses and their payments are shown in their own direct context and never leak into unrelated groups.

Payments reduce the matching debtor-to-creditor pairwise obligation by exactly the payment cents. The debtor's payable and creditor's receivable decrease by the same amount, preserving group-wide zero-sum reconciliation. Reports distinguish gross approved expense shares, payment events, outstanding pairwise debts, and signed net positions.

## Authentication and authorization

Passwords will be hashed with Node's `scrypt` using a unique random salt and a suitable work factor; plaintext passwords are never persisted. Each successful sign-in creates a persistent `Session` with a cryptographically random opaque token. Only a hash of that token is stored. A secure, HTTP-only, same-site cookie carries the raw token, with `Secure` enabled in production. Sessions expire (planned fixed lifetime: 7 days) and can be revoked at logout; expired or revoked sessions are denied.

Every protected server action/route resolves the session to a user and performs authorization in that operation. Group reads/writes require active membership, and membership changes/invitations require owner permission. Expense reads and edits require authorized group membership or being the payer/participant of a direct expense. Approval requires being a participant in a pending group expense. Payment requires being the debtor and an outstanding matching obligation. Receipt download performs the same authorization server-side before returning bytes. Reports are scoped to the requesting user's authorized groups and direct-expense relationships. UI hiding is not an authorization boundary.

## Expense, approval, payment, and notification workflows

- Expense submission validates positive cents, valid date, description, exactly one payer, unique nonempty participants, access to payer/participants, group membership, and split validity server-side. It stores shares. Group expenses start pending and create in-app notices for relevant members; direct expenses are immediately approved.
- Only a participant can approve or reject a pending group expense. Approvals are recorded once per participant. All approvals move it to approved; any rejection moves it to rejected. Status and resulting pairwise obligation updates are committed transactionally.
- Approval can only add obligations once: the status transition is conditional on `Pending`, preventing repeat approval from duplicating debt.
- A payment request is checked against the authenticated debtor and current outstanding pairwise obligation. It is stored as a separate immutable payment event, so partial payments naturally appear as multiple rows. Payment insertion and obligation decrement are one database transaction.
- To prevent concurrent overpayment, payment writes use SQLite's serialized writer behavior plus an atomic conditional update of the obligation (`outstandingCents >= requestedCents`) inside the transaction. If no row updates, the request is rejected as stale/too large. The transaction rolls back on any failure. A database uniqueness key prevents duplicate pairwise obligation rows. If Prisma/SQLite cannot provide the required transactional conditional update reliably, implementation will use a guarded raw SQL update in the same Prisma transaction.
- Notifications are persisted in-app only. Email invitation delivery and mobile push are not configured external integrations.

## Receipt security

Receipt content is not stored in a publicly served directory. A receipt endpoint loads the record server-side, authenticates the request, checks group membership or direct-expense participation/payer access, and only then streams the content with a restricted content type and private/no-store caching. Receipt metadata and access follow the same authorization as the parent expense.

## Interface and reports

The responsive UI will include a dashboard with balances and recent activity; groups and member information; expense history, creation, and editing; a participant approval queue; payment recording; and filtered reports. It will include loading, empty, validation, and error states. Simulated behavior (in-app invitations/notices, no external payment or email transfer) will be labeled clearly.

Reports filter expenses and payments by date range, authorized group/direct context, and status where applicable. Invalid ranges return validation errors; valid ranges without activity return empty records and zero totals. Balance summaries use current ledger state while dated activity totals use event dates.

## Testing and verification plan

After implementation, verify:

- $10.00 equal split among three participants, including deterministic remainder and payer inclusion/exclusion.
- Valid percentage splits totaling exactly 10,000 basis points and exact share reconciliation.
- Invalid percentage totals, zero/negative amounts, invalid dates, and missing payer/participants are rejected.
- Pending and rejected expenses produce no balance changes; all approvals add obligations exactly once.
- Partial payments reduce the correct pairwise obligation; excessive and concurrent overpayments are rejected.
- Unauthorized account, group, expense, report, approval, payment, and receipt access is denied.
- Group-wide signed balances reconcile to zero before and after expense/payment workflows.
- Data persists after refresh; report filters and empty results are correct.
- Prisma schema validation, lint, and production build succeed.

## Constraints, assumptions, and limitations

- Preserve the existing project layout and dependencies where possible. Continue with Next.js, React, TypeScript, Tailwind, SQLite, and Prisma 6.19.3. Do not upgrade Prisma.
- Use additive migrations only; do not reset or delete the existing database. The current schema contains only a placeholder `EnvironmentCheck` model; migration history/database state will be inspected before migration work.
- Do not modify Lab 6 or Lab 7 deliverables. Stay on `feature/splitsmart-prototype`; do not commit or push.
- Invitation acceptance is in-app because email delivery is not configured. Payment recording tracks user-entered settlements and does not transfer money externally. Notifications are in-app. Android/iOS clients and push delivery remain outside this web prototype.
- Receipt limits (file type and size) will be enforced as prototype safeguards; long-term retention and multi-currency conversion are not specified.
- SQLite supports a single writer, which helps serialize settlement changes. Correct conditional updates and transactions remain essential to prevent stale concurrent payment requests.

## Revised implementation plan

1. Recheck branch, working tree, configured database path, and Prisma migration state. Preserve all existing database contents and history.
2. Design Prisma 6.19.3 models and an additive SQLite migration for accounts, sessions, groups, membership, invitations, expenses, shares, approvals, notifications, pairwise obligations, payments, and private receipts.
3. Implement server-only database access, scrypt password handling, persistent expiring/revocable sessions, secure HTTP-only cookies, and reusable per-operation authorization checks.
4. Implement cents/basis-points allocation and ledger functions; test rounding, directional pairwise aggregation, payment reductions, and zero-sum group positions.
5. Implement authorized server operations and transactions for groups/invitations, expense create/edit, approvals/rejections, notifications, payments, receipt retrieval, and reports. Use conditional obligation updates for concurrent payment safety.
6. Build the responsive dashboard and required group, expense, approval, payment, and report interfaces with clear validation and simulated-integration labels.
7. Run the requested schema validation, lint, production build, calculation/workflow/access/persistence/report tests, and report any unmet requirement or limitation.

## Issues to correct before final approval

These are unresolved design gaps, not implementation changes. Please correct or explicitly accept each item before approving implementation.

1. **Rounding-rule conflict:** The design says equal-split remainder cents go to participants in stable ID order, but also says the payer receives a rounding discrepancy whenever they participate. The specification's discrepancy rule gives priority to the payer, while deterministic participant ordering is needed for other ties. State one consistent algorithm for equal and percentage splits, including whether the payer override applies to all rounding differences or only percentage rounding.
2. **Group payer membership:** The design validates group participants as active members but does not state whether a group expense's payer must also be an active member. The specification explicitly restricts participants and the expense creator, but does not clearly resolve payer eligibility. Define this rule.
3. **Approved expense editing:** The UI plan includes editing expenses, but the design does not define who may edit, whether only pending expenses are editable, or how edits to an approved expense affect prior approvals, pairwise obligations, and audit history. Define permitted transitions and use reversing ledger entries or another auditable correction approach.
4. **Membership removal and historical access:** The design does not define what happens to outstanding obligations, prior expenses, reports, and receipts when a member is removed or leaves a group. Define whether inactive members retain read access to historical group records and whether settlement remains possible.
5. **Invitation acceptance without email delivery:** The design requires matching the invitation email but has no email delivery or email verification mechanism. Define how an invitee receives/uses an invitation token in the prototype and how the app prevents an unrelated account from claiming an email invitation.
6. **Direct-expense scope and payment context:** `PairwiseObligation` refers to a “direct-expense context,” but no stable direct scope identifier is defined. Decide whether direct obligations are per expense or aggregated across all direct expenses between a pair, and define how a payment selects the obligation(s) it settles.
7. **Concurrent approval and obligation creation:** The design states approval and obligation creation are transactional but does not fully specify how each participant decision races with another or how duplicate obligation creation is prevented. Define a conditional status transition plus uniqueness/idempotency guarantees and the transaction boundaries.
8. **Balance table versus ledger source of truth:** The proposed pairwise obligation is both described as transactionally maintained settlement state and as a balance derived from the ledger. That creates two sources of truth unless carefully reconciled. Define whether it is an authoritative materialized balance updated atomically with immutable expense/payment ledger events, or a cache rebuilt from the ledger, and specify a consistency/reconciliation check.
9. **CSRF and session-cookie policy:** Cookie attributes are listed, but mutation endpoints' CSRF protection and exact production/development cookie behavior are unspecified. Define same-site policy, origin/CSRF validation, and how secure cookies work on local HTTP development.
10. **Password and session policy details:** Scrypt is selected, but the work parameters, password minimums, login throttling, session rotation/revocation on password changes, and session cleanup policy are not specified. Set prototype-appropriate values and behavior.
11. **Receipt storage limits:** The plan mentions prototype limits but leaves allowed image types, maximum size, filename handling, and download headers undefined. Set limits and ensure content is served as an attachment or safely constrained image with authorization and no public URL.
12. **Requirement coverage statement:** The revised plan labels Android/iOS and external delivery out of scope, and reports date/group/status filters, but the spec's customer requirements include web, Android, and iOS and its report parameters are open-ended. Keep the final product claim explicitly limited to a web prototype and list these as unmet or deferred criteria.

## Review status

This is the revised design with unresolved issues listed for correction. No application code has been written. Implementation remains paused until the issues are corrected or accepted and the revised plan is explicitly approved.

---

# Final Corrected Design for Review

This section supersedes the earlier design and unresolved-issues sections above. No application code or database files have been changed.

## 1. Requirements summary

The web prototype will provide persistent local accounts, groups and invitations, group and direct expenses, equal and percentage splits, participant approval and rejection, in-app notifications, pairwise balances, partial payments, and filtered reports.

Business rules:

- Each expense has exactly one payer and at least one participant. The payer may be included in or excluded from the participants.
- Group expense creators, payers, and participants must all be active members of that group.
- A direct expense involves exactly two distinct users across the payer and participant list. The authenticated creator must be one of those two users, as payer or participant; this is enforced server-side. It is created outside a group and is approved immediately.
- Expense amounts must be positive integer cents. Percentage allocations must total exactly 10,000 basis points.
- A group expense affects balances only after every participant approves it. Any participant rejection rejects it.
- Only the debtor can record a payment, and the payment cannot exceed that debtor’s current outstanding obligation to the creditor.

## 2. Prisma domain model and relationships

Use SQLite and Prisma **6.19.3**. Preserve the existing database and use additive migrations.

- **User** — unique username and email, password hash, display name; has sessions, memberships, created expenses, shares, approvals, notifications, and payments.
- **Session** — user, hashed opaque token, creation, expiry, and revocation timestamps.
- **Group** — owner, name, currency, timestamps; has memberships, invitations, expenses, notifications, and group-scoped obligations.
- **Membership** — group, user, role, active/deactivated state, joined/deactivated timestamps; unique per user/group. Deactivate rather than delete.
- **Invitation** — group, normalized invite email, inviter, hashed single-use token, status and expiry timestamps.
- **Expense** — optional group, creator, payer, current status, and revision history. Direct expenses have no group.
- **ExpenseRevision** — immutable expense snapshot: payer ID, amount cents, date, description, split method, receipt reference, revision number, revision creator user ID, and creation timestamp. Participant shares are stored as related immutable ExpenseShare rows. Together, these records reconstruct the payer, all participant shares, amount, date, description, split method, who created each revision, and when it was created. Prior revisions are preserved and the full revision history is auditable. Editing a pending expense creates a new revision.
- **ExpenseShare** — revision, participant, share cents, and basis points when percentage based.
- **Approval** — expense revision, participant, decision, timestamp, and whether the decision remains current. Unique per revision/participant. Earlier decisions remain auditable after an edit.
- **Reversal** — approved expense/revision being reversed, reason, actor, timestamp, and the ledger adjustments produced. A correction links a replacement expense to the reversal.
- **Notification** — recipient, expense/revision, created/read timestamps.
- **Payment** — scope, debtor, creditor, amount cents, date, actor, and timestamp.
- **PairwiseObligation** — materialized signed balance projection for a scope and unordered user pair. Its sign identifies the direction of debt.
- **Receipt data** — private file bytes and metadata associated with an expense revision; stored in the database or another non-public location.

Expense revisions, approvals, reversals, and payments are immutable audit records. Pairwise obligations are a projection of those records, not the accounting authority.

## 3. Split and balance algorithms

### Splits

Participants are deduplicated and sorted by stable user ID. All calculations use integer arithmetic.

For either split method, calculate each participant’s **base share** in cents, then distribute the remaining cents in a deterministic order:

1. If the payer is a participant, put the payer first.
2. Follow with all other participants in ascending stable user ID.
3. Add one cent at a time in that order until the shares equal the expense total.

For equal splits, base shares are integer division of total cents by participant count.

For percentage splits, require basis points to total exactly 10,000. Calculate each base as the integer floor of `amountCents × participantBasisPoints ÷ 10,000`. The remaining cents are distributed using the same payer-first, then stable-ID order. This gives each participant their floor share plus at most one remainder cent because the sum of the floors leaves fewer cents than participants. Validate and assert that all shares are nonnegative and their sum equals the original expense amount before persistence.

Examples:

- **$10.00 equally among A, B, C:** Base shares are 333 cents each, leaving one cent. If B is the payer, shares are A **$3.33**, B **$3.34**, C **$3.33**. If the payer is excluded, the first participant by stable ID receives the remainder cent.
- **$10.00 at 25%, 35%, 40%:** Bases are $2.50, $3.50, and $4.00; no remainder is needed.
- **$10.00 at 33.34%, 33.33%, 33.33%:** Bases are 333, 333, and 333 cents, leaving one cent. The payer receives it if participating; otherwise the first participant by stable ID receives it.
- A percentage total of **9,999 basis points** is rejected.

### Balances

The payer is not required to participate. A payer who is a participant incurs their own share as consumption of the expense; that share creates no self-debt. Each other participant owes their entire share to the payer. If the payer is not a participant, all participant shares are obligations to the payer.

For each group and unordered user pair, keep a separate signed net position. All direct expenses between the same unordered pair of users aggregate into exactly one direct pairwise balance, separate from every group balance. A direct scope is identified by the stable sorted pair of user IDs. Each payment record stores the debtor and creditor IDs explicitly, so its direction within that pair is unambiguous; it also references the direct pair scope (or the specific group scope). Multiple direct expenses add obligations to that pair balance; partial payments reduce the requested debtor-to-creditor direction, and later expenses can increase it again. Underlying expense revisions and individual payment records remain intact for reporting and audit even as their amounts aggregate in the projection. If a later reversal exceeds the remaining debt because some amount was already paid, the signed balance can cross zero, representing a debt in the opposite direction. Payments themselves must still settle only a currently positive obligation in the requested direction.

Each group expense produces equal and opposite signed member positions. Therefore the sum of signed positions across group members is zero, before and after payments and reversals. Direct scopes are separate from groups.

## 4. Expense, approval, reversal, and payment workflows

- **Creation:** Validate the authenticated creator, payer, participants, group membership or direct-pair rule, positive amount, date, description, and split. For a direct expense, enforce server-side that the authenticated creator is one of the exactly two involved users. Group expenses start pending; direct expenses are immediately approved.
- **Pending edit:** Only pending expenses may be edited. Create a new immutable revision, retain prior revision data, and mark its approvals obsolete. The new revision starts with no approvals and requires fresh decisions from its participants.
- **Approval/rejection:** Only a participant on the current revision can decide. A participant gets one decision per revision. Rejection prevents approval. Approval becomes effective only if the expense is still pending and every current participant has approved.
- **Approved correction:** Approved expenses cannot be edited or deleted. Correction creates an auditable reversal for the original approved revision and a linked replacement expense. The reversal and replacement creation are atomic; the replacement group expense requires fresh approvals. The reversal applies the exact inverse of the original revision’s obligation entries, reconstructed from that immutable revision's payer ID and shares, never from mutable current expense data. If payments have already settled some of those entries, the signed pairwise balance may reverse direction, preserving the full accounting history.
- **Payment:** The authenticated debtor selects a scope and creditor and records a positive amount no greater than the current outstanding obligation. Each partial payment is a separate immutable payment row. The projection is reduced by the same cents in the same transaction.

## 5. Authentication, authorization, invitations, and receipt security

### Accounts and sessions

- Hash passwords with Node.js `scrypt`; use a unique random salt of at least 16 bytes, a derived key of at least 32 bytes, documented work parameters (`N=2^15`, `r=8`, `p=1`) and a 64 MB memory limit.
- Require passwords of 12–128 characters. Never persist plaintext passwords.
- Store only a cryptographic hash of each random session token. The raw token is only in the browser cookie.
- Use an HTTP-only, `SameSite=Lax` cookie, seven-day expiration, and `Secure` in production. Disable `Secure` only for local HTTP development. Do not enable unnecessary cross-origin access.
- Validate request `Origin` on every state-changing operation and reject missing or untrusted origins. SameSite cookies provide additional CSRF mitigation.
- Apply throttling using rolling 15-minute buckets by normalized account name, by source IP, and by account/source pair. After 5 failed attempts for an account/source pair, impose delays of 1, 2, 4, 8, then 16 seconds (cap at 16 seconds) on further attempts. After 10 failures for that pair within 15 minutes, temporarily reject attempts for that pair for 15 minutes. Independently, after 30 failures from one source within 15 minutes, temporarily throttle that source for 15 minutes. Successful authentication clears the account/source failure bucket. These are temporary controls only: never permanently lock an account, and return the same generic login response whether an account exists or is throttled to reduce account enumeration and denial-of-access abuse.
- Revoke sessions on logout and after password changes. Expired sessions are denied and cleaned up periodically.

### Authorization and access

Every protected server operation authenticates the session and enforces authorization server-side. Group operations require active membership, with ownership required for membership and group administration. Expense, approval, payment, report, and receipt permissions are checked on each operation; hiding a UI control is not an authorization mechanism.

Former members cannot see new group activity. They retain historical access to group records for expenses where they were the creator, payer, or a participant while their membership was active. This includes associated approvals, payment history, and receipts, subject to the same server-side authorization checks. They may continue settling outstanding historical obligations from those records. Current active members can access group history and records while their membership is active. Deactivation preserves all records and does not grant former members access to expenses or other activity created after deactivation.

### Invitations

Owners create copyable, single-use invitation links/tokens. Tokens are stored hashed, expire, and cannot be reused after acceptance or expiry. The invitee must sign in and the account email must match the invitation email. The prototype has no email verification service: matching an email address does **not** independently prove email ownership. The UI must disclose this and must not claim email verification or email delivery.

### Receipts

Allow JPEG, PNG, WebP, and PDF files up to 5 MB. Validate actual content, not just the submitted MIME type; use server-controlled identifiers. Store files privately, never under a public directory or public URL. Require expense-level authorization before download and return suitable content-disposition and private caching headers.

## 6. Transactions and ledger consistency

Immutable expense revisions, effective approval decisions, reversals, and payments are authoritative. Pairwise obligations are a materialized projection.

- Expense creation and shares persist atomically.
- Participant decisions are unique per revision. Approval/rejection uses a conditional transition from pending, so concurrent decisions cannot approve an already rejected expense or approve it twice.
- When the final approval arrives, the status transition and obligation projection updates occur in one transaction. A uniqueness constraint on the source ledger event and pair prevents duplicate obligation creation.
- Payment insertion and a conditional projection update occur in one transaction. The update succeeds only if the current signed balance represents sufficient debt in that direction. SQLite’s serialized writes plus the conditional update prevent concurrent overpayment; a failed conditional update rejects the stale request.
- Reversal records and inverse projection updates occur atomically. The replacement expense is linked to the reversal.
- A reconciliation operation can replay effective approved revisions, reversals, and payments in ledger order and compare/rebuild PairwiseObligation. Group signed positions must total zero. Reconciliation reports discrepancies rather than silently discarding the authoritative history.

## 7. Testing requirements

Verify at minimum:

- $10.00 equal split among three, with payer included and excluded and deterministic remainder.
- Valid percentage splits totaling exactly 10,000 basis points, including a remainder case.
- Invalid percentage totals, zero/negative amounts, malformed dates, missing payer, and empty participants rejected.
- Payer, creator, and participants must be active group members for group expenses.
- Direct expenses require exactly two distinct users, require the authenticated creator to be one of them (server-side), and remain separate from group balances.
- Pending and rejected expenses do not affect balances.
- All approvals add obligations once; rejection blocks approval; concurrent participant decisions do not duplicate obligations.
- Pending edits invalidate approvals; each immutable revision records its creator and timestamp; approved corrections preserve revision history and apply inverse obligations using the original revision’s payer and shares.
- Partial payments reduce the correct pairwise obligation; excessive and concurrent overpayments are rejected.
- Unauthorized access to accounts, groups, expenses, reports, approvals, payments, and receipts is denied.
- Membership deactivation preserves historical records and settlement capability while blocking new activity.
- Invitation expiry, acceptance, email-match, and single-use behavior.
- Session expiration, logout, password-change revocation, cookie and Origin checks, and login throttling.
- Receipt type/content and size limits, private storage, and access checks.
- Group-wide signed balances reconcile to zero.
- Persistence after refresh, report filtering, empty report results, Prisma validation, lint, and production build.

## 8. Implementation sequence

1. Confirm branch and inspect working tree, database path, existing database, and migration state without resetting or deleting anything.
2. Design and add Prisma 6.19.3 models and additive SQLite migrations.
3. Implement database access, password/session handling, cookie policy, Origin checks, login throttling, and server authorization helpers.
4. Implement deterministic split and signed balance ledger/projection logic, with reconciliation.
5. Implement groups, invitations, expenses and revisions, approvals, reversals, notifications, payments, receipt retrieval, and reports using the transaction rules above.
6. Build the responsive dashboard and group, expense, approval, payment, and reporting interfaces with validation, loading, error, and empty states.
7. Run the specified validation and workflow/security/persistence checks; document any unmet criteria.

## 9. Deferred requirements and limitations

This deliverable is a **web prototype**. It does not deliver:

- Android or iOS applications.
- External email delivery.
- Mobile push notifications.
- External payment processing or money transfer.
- Email ownership verification.

Reports will support date range, group/direct scope, expense status, and member filters, subject to the requester’s authorization. Direct expenses aggregate into the stable unordered user pair scope while individual expenses and debtor/creditor payment directions remain available in report details. The specification leaves report parameters open-ended, so any additional custom report dimensions beyond these are not claimed as implemented. Multi-currency conversion is also outside the prototype.

## 10. Readiness

This design resolves the requested corrections and is ready for one final review. **Implementation has not begun and should remain paused until you explicitly approve this final design.**

### Final clarification checklist

- [x] A direct expense’s authenticated creator must be one of the two involved users; server-side enforcement is required.
- [x] Every immutable expense revision records its creator user ID and creation timestamp, preserves prior revisions, and supports auditable history.

## Review error list and resolution status

The following issues were identified during design review and are addressed in this final design:

1. **Inconsistent rounding rules** — unified with integer-cent allocation, payer priority, and stable participant ordering.
2. **Group payer eligibility unspecified** — creator, payer, and participants must all be active group members.
3. **Expense correction behavior unspecified** — only pending expenses are editable; approved corrections use immutable reversal and replacement records.
4. **Membership removal behavior unspecified** — memberships are deactivated; historical access is limited and new activity is blocked.
5. **Invitation acceptance without email delivery unspecified** — copyable single-use expiring tokens require sign-in and matching account email; lack of ownership verification is disclosed.
6. **Direct-expense aggregation scope unspecified** — direct balances aggregate across all expenses for one stable unordered user pair, separately from groups; payment rows store debtor and creditor direction.
7. **Concurrent approval safety unspecified** — unique decisions, conditional transitions, and transactional obligation creation prevent duplicates.
8. **Ledger/projection source of truth ambiguous** — immutable ledger records are authoritative; pairwise obligations are a rebuildable projection with reconciliation.
9. **Cookie and CSRF policy incomplete** — cookie flags and server-side Origin validation are specified.
10. **Password/session policy incomplete** — scrypt parameters, password length, concrete account/source throttling thresholds and temporary lockout, expiry, revocation, and cleanup are specified.
11. **Receipt security limits incomplete** — allowed types, 5 MB maximum, content validation, private storage, authorization, and download headers are specified.
12. **Prototype coverage could overclaim requirements** — web-only scope and deferred mobile, email, push, payment processing, email verification, and extra report parameters are listed.
