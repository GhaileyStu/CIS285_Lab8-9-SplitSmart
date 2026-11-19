-- CreateTable
CREATE TABLE "EnvironmentCheck" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "message" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    "revokedAt" DATETIME,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LoginThrottleBucket" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "windowStartedAt" DATETIME NOT NULL,
    "delayLevel" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL,
    "blockedUntil" DATETIME,
    CONSTRAINT "LoginThrottleBucket_kind_check" CHECK ("kind" IN ('account', 'source', 'account_source')),
    CONSTRAINT "LoginThrottleBucket_counts_check" CHECK ("failureCount" >= 0 AND "delayLevel" >= 0)
);

-- CreateTable
CREATE TABLE "Group" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Group_currencyCode_check" CHECK (length("currencyCode") = 3 AND "currencyCode" GLOB '[A-Z][A-Z][A-Z]'),
    CONSTRAINT "Group_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GroupMembership" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "groupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deactivatedAt" DATETIME,
    CONSTRAINT "GroupMembership_role_check" CHECK ("role" IN ('OWNER', 'MEMBER')),
    CONSTRAINT "GroupMembership_status_check" CHECK ("status" IN ('ACTIVE', 'INACTIVE')),
    CONSTRAINT "GroupMembership_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "GroupMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MembershipPeriod" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "membershipId" TEXT NOT NULL,
    "joinedAt" DATETIME NOT NULL,
    "leftAt" DATETIME,
    CONSTRAINT "MembershipPeriod_range_check" CHECK ("leftAt" IS NULL OR julianday("leftAt") > julianday("joinedAt")),
    CONSTRAINT "MembershipPeriod_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "GroupMembership" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Invitation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "groupId" TEXT NOT NULL,
    "invitedByUserId" TEXT NOT NULL,
    "acceptedByUserId" TEXT,
    "emailNormalized" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" DATETIME,
    "revokedAt" DATETIME,
    CONSTRAINT "Invitation_status_check" CHECK ("status" IN ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED')),
    CONSTRAINT "Invitation_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Invitation_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Invitation_acceptedByUserId_fkey" FOREIGN KEY ("acceptedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BalanceScope" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "groupId" TEXT,
    "directLowUserId" TEXT,
    "directHighUserId" TEXT,
    "currencyCode" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BalanceScope_kind_shape_check" CHECK (
        ("kind" = 'GROUP' AND "groupId" IS NOT NULL AND "directLowUserId" IS NULL AND "directHighUserId" IS NULL)
        OR
        ("kind" = 'DIRECT' AND "groupId" IS NULL AND "directLowUserId" IS NOT NULL AND "directHighUserId" IS NOT NULL AND "directLowUserId" < "directHighUserId")
    ),
    CONSTRAINT "BalanceScope_currency_check" CHECK (length("currencyCode") = 3 AND "currencyCode" GLOB '[A-Z][A-Z][A-Z]'),
    CONSTRAINT "BalanceScope_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "BalanceScope_directLowUserId_fkey" FOREIGN KEY ("directLowUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "BalanceScope_directHighUserId_fkey" FOREIGN KEY ("directHighUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "groupId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "currentRevisionNumber" INTEGER NOT NULL,
    "currentBalanceScopeId" TEXT,
    "status" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Expense_kind_check" CHECK ("kind" IN ('GROUP', 'DIRECT')),
    CONSTRAINT "Expense_shape_check" CHECK (("kind" = 'GROUP' AND "groupId" IS NOT NULL) OR ("kind" = 'DIRECT' AND "groupId" IS NULL)),
    CONSTRAINT "Expense_status_check" CHECK ("status" IN ('PENDING', 'APPROVED', 'REJECTED', 'REVERSED')),
    CONSTRAINT "Expense_revision_projection_check" CHECK ("currentRevisionNumber" >= 1),
    CONSTRAINT "Expense_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Expense_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Expense_currentBalanceScopeId_fkey" FOREIGN KEY ("currentBalanceScopeId") REFERENCES "BalanceScope" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ExpenseRevision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "expenseId" TEXT NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payerUserId" TEXT NOT NULL,
    "balanceScopeId" TEXT NOT NULL,
    "amountCents" BIGINT NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "expenseDate" DATETIME NOT NULL,
    "description" TEXT NOT NULL,
    "splitMethod" TEXT NOT NULL,
    CONSTRAINT "ExpenseRevision_amount_check" CHECK ("amountCents" > 0 AND "amountCents" <= 9223372036854775807),
    CONSTRAINT "ExpenseRevision_number_check" CHECK ("revisionNumber" >= 1),
    CONSTRAINT "ExpenseRevision_currency_check" CHECK (length("currencyCode") = 3 AND "currencyCode" GLOB '[A-Z][A-Z][A-Z]'),
    CONSTRAINT "ExpenseRevision_split_check" CHECK ("splitMethod" IN ('EQUAL', 'PERCENTAGE')),
    CONSTRAINT "ExpenseRevision_description_check" CHECK (length(trim("description")) > 0),
    CONSTRAINT "ExpenseRevision_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ExpenseRevision_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ExpenseRevision_payerUserId_fkey" FOREIGN KEY ("payerUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ExpenseRevision_balanceScopeId_fkey" FOREIGN KEY ("balanceScopeId") REFERENCES "BalanceScope" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ExpenseShare" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "revisionId" TEXT NOT NULL,
    "participantUserId" TEXT NOT NULL,
    "shareCents" BIGINT NOT NULL,
    "percentageBasisPoints" INTEGER,
    "allocationOrder" INTEGER NOT NULL,
    CONSTRAINT "ExpenseShare_amount_check" CHECK ("shareCents" >= 0 AND "shareCents" <= 9223372036854775807),
    CONSTRAINT "ExpenseShare_percentage_check" CHECK ("percentageBasisPoints" IS NULL OR "percentageBasisPoints" BETWEEN 0 AND 10000),
    CONSTRAINT "ExpenseShare_order_check" CHECK ("allocationOrder" >= 0),
    CONSTRAINT "ExpenseShare_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "ExpenseRevision" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ExpenseShare_participantUserId_fkey" FOREIGN KEY ("participantUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Approval" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "revisionId" TEXT NOT NULL,
    "participantUserId" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Approval_decision_check" CHECK ("decision" IN ('APPROVE', 'REJECT')),
    CONSTRAINT "Approval_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "ExpenseRevision" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Approval_participantUserId_fkey" FOREIGN KEY ("participantUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Reversal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "revisionId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "replacementExpenseId" TEXT,
    "reason" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Reversal_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "ExpenseRevision" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Reversal_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Reversal_replacementExpenseId_fkey" FOREIGN KEY ("replacementExpenseId") REFERENCES "Expense" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReversalEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reversalId" TEXT NOT NULL,
    "sourceShareId" TEXT NOT NULL,
    "balanceScopeId" TEXT NOT NULL,
    "debtorUserId" TEXT NOT NULL,
    "creditorUserId" TEXT NOT NULL,
    "amountCents" BIGINT NOT NULL,
    CONSTRAINT "ReversalEntry_amount_check" CHECK ("amountCents" > 0 AND "amountCents" <= 9223372036854775807),
    CONSTRAINT "ReversalEntry_users_check" CHECK ("debtorUserId" <> "creditorUserId"),
    CONSTRAINT "ReversalEntry_reversalId_fkey" FOREIGN KEY ("reversalId") REFERENCES "Reversal" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ReversalEntry_sourceShareId_fkey" FOREIGN KEY ("sourceShareId") REFERENCES "ExpenseShare" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ReversalEntry_balanceScopeId_fkey" FOREIGN KEY ("balanceScopeId") REFERENCES "BalanceScope" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ReversalEntry_debtorUserId_fkey" FOREIGN KEY ("debtorUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ReversalEntry_creditorUserId_fkey" FOREIGN KEY ("creditorUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "recipientUserId" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" DATETIME,
    CONSTRAINT "Notification_kind_check" CHECK ("kind" IN ('EXPENSE_CREATED')),
    CONSTRAINT "Notification_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Notification_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "ExpenseRevision" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Receipt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "revisionId" TEXT NOT NULL,
    "content" BLOB NOT NULL,
    "detectedContentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Receipt_size_check" CHECK ("sizeBytes" BETWEEN 1 AND 5242880),
    CONSTRAINT "Receipt_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "ExpenseRevision" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "balanceScopeId" TEXT NOT NULL,
    "debtorUserId" TEXT NOT NULL,
    "creditorUserId" TEXT NOT NULL,
    "recordedByUserId" TEXT NOT NULL,
    "amountCents" BIGINT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "paymentDate" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Payment_amount_check" CHECK ("amountCents" > 0 AND "amountCents" <= 9223372036854775807),
    CONSTRAINT "Payment_users_check" CHECK ("debtorUserId" <> "creditorUserId" AND "recordedByUserId" = "debtorUserId"),
    CONSTRAINT "Payment_balanceScopeId_fkey" FOREIGN KEY ("balanceScopeId") REFERENCES "BalanceScope" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Payment_debtorUserId_fkey" FOREIGN KEY ("debtorUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Payment_creditorUserId_fkey" FOREIGN KEY ("creditorUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Payment_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PairwiseObligation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "balanceScopeId" TEXT NOT NULL,
    "userLowId" TEXT NOT NULL,
    "userHighId" TEXT NOT NULL,
    "signedBalanceCents" BIGINT NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PairwiseObligation_pair_check" CHECK ("userLowId" < "userHighId"),
    CONSTRAINT "PairwiseObligation_balance_check" CHECK ("signedBalanceCents" BETWEEN -9223372036854775808 AND 9223372036854775807),
    CONSTRAINT "PairwiseObligation_balanceScopeId_fkey" FOREIGN KEY ("balanceScopeId") REFERENCES "BalanceScope" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PairwiseObligation_userLowId_fkey" FOREIGN KEY ("userLowId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PairwiseObligation_userHighId_fkey" FOREIGN KEY ("userHighId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_expiresAt_idx" ON "Session"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE INDEX "LoginThrottleBucket_blockedUntil_idx" ON "LoginThrottleBucket"("blockedUntil");

-- CreateIndex
CREATE UNIQUE INDEX "LoginThrottleBucket_kind_keyHash_key" ON "LoginThrottleBucket"("kind", "keyHash");

-- CreateIndex
CREATE INDEX "GroupMembership_groupId_status_idx" ON "GroupMembership"("groupId", "status");

-- CreateIndex
CREATE INDEX "GroupMembership_userId_status_idx" ON "GroupMembership"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "GroupMembership_groupId_userId_key" ON "GroupMembership"("groupId", "userId");

-- CreateIndex
CREATE INDEX "MembershipPeriod_membershipId_joinedAt_idx" ON "MembershipPeriod"("membershipId", "joinedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_tokenHash_key" ON "Invitation"("tokenHash");

-- CreateIndex
CREATE INDEX "Invitation_groupId_status_expiresAt_idx" ON "Invitation"("groupId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "Invitation_emailNormalized_status_idx" ON "Invitation"("emailNormalized", "status");

-- CreateIndex
CREATE UNIQUE INDEX "BalanceScope_groupId_key" ON "BalanceScope"("groupId");

-- CreateIndex
CREATE INDEX "BalanceScope_directLowUserId_directHighUserId_currencyCode_idx" ON "BalanceScope"("directLowUserId", "directHighUserId", "currencyCode");

-- CreateIndex
CREATE INDEX "Expense_groupId_createdAt_idx" ON "Expense"("groupId", "createdAt");

-- CreateIndex
CREATE INDEX "Expense_createdByUserId_createdAt_idx" ON "Expense"("createdByUserId", "createdAt");

-- CreateIndex
CREATE INDEX "Expense_status_createdAt_idx" ON "Expense"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Expense_currentBalanceScopeId_idx" ON "Expense"("currentBalanceScopeId");

-- CreateIndex
CREATE INDEX "ExpenseRevision_balanceScopeId_expenseDate_idx" ON "ExpenseRevision"("balanceScopeId", "expenseDate");

-- CreateIndex
CREATE INDEX "ExpenseRevision_payerUserId_expenseDate_idx" ON "ExpenseRevision"("payerUserId", "expenseDate");

-- CreateIndex
CREATE INDEX "ExpenseRevision_createdByUserId_createdAt_idx" ON "ExpenseRevision"("createdByUserId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseRevision_expenseId_revisionNumber_key" ON "ExpenseRevision"("expenseId", "revisionNumber");

-- CreateIndex
CREATE INDEX "ExpenseShare_participantUserId_revisionId_idx" ON "ExpenseShare"("participantUserId", "revisionId");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseShare_revisionId_participantUserId_key" ON "ExpenseShare"("revisionId", "participantUserId");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseShare_revisionId_allocationOrder_key" ON "ExpenseShare"("revisionId", "allocationOrder");

-- CreateIndex
CREATE INDEX "Approval_participantUserId_createdAt_idx" ON "Approval"("participantUserId", "createdAt");

-- CreateIndex
CREATE INDEX "Approval_revisionId_decision_idx" ON "Approval"("revisionId", "decision");

-- CreateIndex
CREATE UNIQUE INDEX "Approval_revisionId_participantUserId_key" ON "Approval"("revisionId", "participantUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Reversal_revisionId_key" ON "Reversal"("revisionId");

-- CreateIndex
CREATE UNIQUE INDEX "Reversal_replacementExpenseId_key" ON "Reversal"("replacementExpenseId");

-- CreateIndex
CREATE INDEX "ReversalEntry_balanceScopeId_debtorUserId_creditorUserId_idx" ON "ReversalEntry"("balanceScopeId", "debtorUserId", "creditorUserId");

-- CreateIndex
CREATE UNIQUE INDEX "ReversalEntry_reversalId_sourceShareId_key" ON "ReversalEntry"("reversalId", "sourceShareId");

-- CreateIndex
CREATE INDEX "Notification_recipientUserId_readAt_createdAt_idx" ON "Notification"("recipientUserId", "readAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_recipientUserId_revisionId_kind_key" ON "Notification"("recipientUserId", "revisionId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_revisionId_key" ON "Receipt"("revisionId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_idempotencyKey_key" ON "Payment"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Payment_balanceScopeId_paymentDate_idx" ON "Payment"("balanceScopeId", "paymentDate");

-- CreateIndex
CREATE INDEX "Payment_debtorUserId_creditorUserId_createdAt_idx" ON "Payment"("debtorUserId", "creditorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "Payment_requestHash_idx" ON "Payment"("requestHash");

-- CreateIndex
CREATE INDEX "PairwiseObligation_userLowId_balanceScopeId_idx" ON "PairwiseObligation"("userLowId", "balanceScopeId");

-- CreateIndex
CREATE INDEX "PairwiseObligation_userHighId_balanceScopeId_idx" ON "PairwiseObligation"("userHighId", "balanceScopeId");

-- CreateIndex
CREATE UNIQUE INDEX "PairwiseObligation_balanceScopeId_userLowId_userHighId_key" ON "PairwiseObligation"("balanceScopeId", "userLowId", "userHighId");

-- Partial uniqueness for one direct scope per unordered pair and currency.
CREATE UNIQUE INDEX "BalanceScope_direct_pair_currency_key"
ON "BalanceScope"("directLowUserId", "directHighUserId", "currencyCode")
WHERE "kind" = 'DIRECT';

-- Membership periods are immutable intervals. Only one close of an open period is allowed.
CREATE TRIGGER "MembershipPeriod_no_overlap_insert"
BEFORE INSERT ON "MembershipPeriod"
WHEN EXISTS (
    SELECT 1 FROM "MembershipPeriod" p
    WHERE p."membershipId" = NEW."membershipId"
      AND julianday(NEW."joinedAt") < julianday(COALESCE(p."leftAt", '9999-12-31T23:59:59.999Z'))
      AND julianday(p."joinedAt") < julianday(COALESCE(NEW."leftAt", '9999-12-31T23:59:59.999Z'))
)
BEGIN
    SELECT RAISE(ABORT, 'membership periods cannot overlap');
END;

CREATE TRIGGER "MembershipPeriod_close_once"
BEFORE UPDATE ON "MembershipPeriod"
WHEN OLD."leftAt" IS NOT NULL
  OR NEW."id" <> OLD."id"
  OR NEW."membershipId" <> OLD."membershipId"
  OR NEW."joinedAt" <> OLD."joinedAt"
  OR NEW."leftAt" IS NULL
  OR julianday(NEW."leftAt") <= julianday(OLD."joinedAt")
  OR EXISTS (
      SELECT 1 FROM "MembershipPeriod" p
      WHERE p."membershipId" = NEW."membershipId"
        AND p."id" <> OLD."id"
        AND julianday(NEW."joinedAt") < julianday(COALESCE(p."leftAt", '9999-12-31T23:59:59.999Z'))
        AND julianday(p."joinedAt") < julianday(NEW."leftAt")
  )
BEGIN
    SELECT RAISE(ABORT, 'membership periods may only be closed once without overlap');
END;

CREATE TRIGGER "MembershipPeriod_no_delete"
BEFORE DELETE ON "MembershipPeriod"
BEGIN
    SELECT RAISE(ABORT, 'membership history is immutable');
END;

CREATE TRIGGER "BalanceScope_group_currency_insert"
BEFORE INSERT ON "BalanceScope"
WHEN NEW."kind" = 'GROUP'
 AND NOT EXISTS (SELECT 1 FROM "Group" g WHERE g."id" = NEW."groupId" AND g."currencyCode" = NEW."currencyCode")
BEGIN
    SELECT RAISE(ABORT, 'group scope currency must match group currency');
END;

CREATE TRIGGER "BalanceScope_group_currency_update"
BEFORE UPDATE OF "kind", "groupId", "currencyCode" ON "BalanceScope"
WHEN NEW."kind" = 'GROUP'
 AND NOT EXISTS (SELECT 1 FROM "Group" g WHERE g."id" = NEW."groupId" AND g."currencyCode" = NEW."currencyCode")
BEGIN
    SELECT RAISE(ABORT, 'group scope currency must match group currency');
END;

CREATE TRIGGER "Group_currency_immutable_after_financial_activity"
BEFORE UPDATE OF "currencyCode" ON "Group"
WHEN NEW."currencyCode" <> OLD."currencyCode"
 AND EXISTS (
     SELECT 1 FROM "Expense" e JOIN "ExpenseRevision" r ON r."expenseId" = e."id"
     WHERE e."groupId" = OLD."id"
 )
BEGIN
    SELECT RAISE(ABORT, 'group currency cannot change after financial activity');
END;

CREATE TRIGGER "ExpenseRevision_validate_scope_and_actors"
BEFORE INSERT ON "ExpenseRevision"
BEGIN
    SELECT CASE WHEN NOT EXISTS (
        SELECT 1 FROM "Expense" e
        JOIN "BalanceScope" s ON s."id" = NEW."balanceScopeId"
        WHERE e."id" = NEW."expenseId"
          AND e."status" = 'PENDING'
          AND NEW."revisionNumber" = (SELECT COALESCE(MAX(prior."revisionNumber"), 0) + 1 FROM "ExpenseRevision" prior WHERE prior."expenseId" = e."id")
          AND (
              (e."kind" = 'GROUP' AND s."kind" = 'GROUP' AND s."groupId" = e."groupId"
               AND s."currencyCode" = NEW."currencyCode"
               AND EXISTS (SELECT 1 FROM "Group" g WHERE g."id" = e."groupId" AND g."currencyCode" = NEW."currencyCode")
               AND EXISTS (SELECT 1 FROM "GroupMembership" m WHERE m."groupId" = e."groupId" AND m."userId" = e."createdByUserId" AND m."status" = 'ACTIVE')
               AND EXISTS (SELECT 1 FROM "GroupMembership" m WHERE m."groupId" = e."groupId" AND m."userId" = NEW."payerUserId" AND m."status" = 'ACTIVE'))
              OR
              (e."kind" = 'DIRECT' AND e."groupId" IS NULL AND s."kind" = 'DIRECT'
               AND s."currencyCode" = NEW."currencyCode"
               AND e."createdByUserId" IN (s."directLowUserId", s."directHighUserId")
               AND NEW."payerUserId" IN (s."directLowUserId", s."directHighUserId"))
          )
    ) THEN RAISE(ABORT, 'revision scope, currency, actor, or expense state is invalid') END;
END;

CREATE TRIGGER "ExpenseShare_validate_participant"
BEFORE INSERT ON "ExpenseShare"
BEGIN
    SELECT CASE WHEN NOT EXISTS (
        SELECT 1 FROM "ExpenseRevision" r
        JOIN "Expense" e ON e."id" = r."expenseId"
        JOIN "BalanceScope" s ON s."id" = r."balanceScopeId"
        WHERE r."id" = NEW."revisionId"
          AND e."status" = 'PENDING'
          AND r."revisionNumber" = (SELECT MAX(latest."revisionNumber") FROM "ExpenseRevision" latest WHERE latest."expenseId" = e."id")
          AND ((r."splitMethod" = 'EQUAL' AND NEW."percentageBasisPoints" IS NULL)
               OR (r."splitMethod" = 'PERCENTAGE' AND NEW."percentageBasisPoints" IS NOT NULL))
          AND (
              (e."kind" = 'GROUP' AND EXISTS (
                  SELECT 1 FROM "GroupMembership" m WHERE m."groupId" = e."groupId"
                    AND m."userId" = NEW."participantUserId" AND m."status" = 'ACTIVE'))
              OR
              (e."kind" = 'DIRECT' AND NEW."participantUserId" IN (s."directLowUserId", s."directHighUserId"))
          )
    ) THEN RAISE(ABORT, 'share participant is invalid for this revision') END;
END;

CREATE TRIGGER "Approval_validate_current_participant"
BEFORE INSERT ON "Approval"
BEGIN
    SELECT CASE WHEN NOT EXISTS (
        SELECT 1 FROM "ExpenseRevision" r
        JOIN "Expense" e ON e."id" = r."expenseId"
        JOIN "ExpenseShare" sh ON sh."revisionId" = r."id" AND sh."participantUserId" = NEW."participantUserId"
        WHERE r."id" = NEW."revisionId"
          AND r."revisionNumber" = e."currentRevisionNumber"
          AND e."status" = 'PENDING'
          AND e."kind" = 'GROUP'
    ) THEN RAISE(ABORT, 'approval must belong to a participant on the current pending revision') END;
END;

CREATE TRIGGER "Expense_validate_approved_transition"
BEFORE UPDATE OF "status" ON "Expense"
WHEN OLD."status" = 'PENDING' AND NEW."status" = 'APPROVED'
BEGIN
    SELECT CASE WHEN NOT EXISTS (
        SELECT 1 FROM "ExpenseRevision" r
        WHERE r."expenseId" = NEW."id" AND r."revisionNumber" = NEW."currentRevisionNumber"
          AND r."balanceScopeId" = NEW."currentBalanceScopeId"
          AND (SELECT COUNT(*) FROM "ExpenseShare" sh WHERE sh."revisionId" = r."id") > 0
    ) THEN RAISE(ABORT, 'expense must have shares on its current revision and scope') END;
    SELECT CASE WHEN NEW."kind" = 'GROUP' AND EXISTS (
        SELECT 1 FROM "ExpenseRevision" r
        WHERE r."expenseId" = NEW."id" AND r."revisionNumber" = NEW."currentRevisionNumber"
          AND ((SELECT COUNT(*) FROM "Approval" a WHERE a."revisionId" = r."id" AND a."decision" = 'APPROVE')
               <> (SELECT COUNT(*) FROM "ExpenseShare" sh WHERE sh."revisionId" = r."id")
               OR EXISTS (SELECT 1 FROM "Approval" a WHERE a."revisionId" = r."id" AND a."decision" = 'REJECT'))
    ) THEN RAISE(ABORT, 'every group expense participant must approve before approval') END;
    SELECT CASE WHEN NEW."kind" = 'DIRECT' AND EXISTS (
        SELECT 1 FROM "ExpenseRevision" r
        WHERE r."expenseId" = NEW."id" AND r."revisionNumber" = NEW."currentRevisionNumber"
          AND (SELECT COUNT(*) FROM "Approval" a WHERE a."revisionId" = r."id") > 0
          AND ((SELECT COUNT(*) FROM "Approval" a WHERE a."revisionId" = r."id" AND a."decision" = 'APPROVE')
               <> (SELECT COUNT(*) FROM "ExpenseShare" sh WHERE sh."revisionId" = r."id")
               OR EXISTS (SELECT 1 FROM "Approval" a WHERE a."revisionId" = r."id" AND a."decision" = 'REJECT'))
    ) THEN RAISE(ABORT, 'direct expense approval or pair scope is incomplete') END;
END;

CREATE TRIGGER "Expense_validate_direct_pair_scope"
BEFORE UPDATE OF "status" ON "Expense"
WHEN OLD."status" = 'PENDING' AND NEW."status" = 'APPROVED' AND NEW."kind" = 'DIRECT'
BEGIN
    SELECT CASE WHEN NOT EXISTS (
        SELECT 1 FROM "ExpenseRevision" r JOIN "BalanceScope" s ON s."id" = r."balanceScopeId"
        WHERE r."expenseId" = NEW."id" AND r."revisionNumber" = NEW."currentRevisionNumber"
          AND s."kind" = 'DIRECT'
          AND (s."directLowUserId" = r."payerUserId" OR EXISTS (SELECT 1 FROM "ExpenseShare" sh WHERE sh."revisionId" = r."id" AND sh."participantUserId" = s."directLowUserId"))
          AND (s."directHighUserId" = r."payerUserId" OR EXISTS (SELECT 1 FROM "ExpenseShare" sh WHERE sh."revisionId" = r."id" AND sh."participantUserId" = s."directHighUserId"))
          AND NOT EXISTS (SELECT 1 FROM "ExpenseShare" sh WHERE sh."revisionId" = r."id" AND sh."participantUserId" NOT IN (s."directLowUserId", s."directHighUserId"))
    ) THEN RAISE(ABORT, 'direct expense participants must match its pair scope') END;
END;

CREATE TRIGGER "Expense_validate_rejected_transition"
BEFORE UPDATE OF "status" ON "Expense"
WHEN OLD."status" = 'PENDING' AND NEW."status" = 'REJECTED'
BEGIN
    SELECT CASE WHEN NOT EXISTS (
        SELECT 1 FROM "ExpenseRevision" r JOIN "Approval" a ON a."revisionId" = r."id"
        WHERE r."expenseId" = NEW."id" AND r."revisionNumber" = NEW."currentRevisionNumber"
          AND a."decision" = 'REJECT'
    ) THEN RAISE(ABORT, 'expense rejection requires a participant rejection on the current revision') END;
END;

CREATE TRIGGER "Expense_validate_reversed_transition"
BEFORE UPDATE OF "status" ON "Expense"
WHEN OLD."status" = 'APPROVED' AND NEW."status" = 'REVERSED'
BEGIN
    SELECT CASE WHEN NOT EXISTS (
        SELECT 1 FROM "ExpenseRevision" r JOIN "Reversal" v ON v."revisionId" = r."id"
        WHERE r."expenseId" = NEW."id" AND r."revisionNumber" = NEW."currentRevisionNumber"
    ) THEN RAISE(ABORT, 'expense can be reversed only with a reversal of its approved current revision') END;
    SELECT CASE WHEN EXISTS (
        SELECT 1 FROM "ExpenseRevision" r
        WHERE r."expenseId" = NEW."id" AND r."revisionNumber" = NEW."currentRevisionNumber"
          AND (
              EXISTS (SELECT 1 FROM "ExpenseShare" sh WHERE sh."revisionId" = r."id" AND sh."participantUserId" <> r."payerUserId" AND sh."shareCents" > 0
                      AND NOT EXISTS (SELECT 1 FROM "Reversal" v JOIN "ReversalEntry" ve ON ve."reversalId" = v."id" WHERE v."revisionId" = r."id" AND ve."sourceShareId" = sh."id"))
              OR EXISTS (SELECT 1 FROM "Reversal" v JOIN "ReversalEntry" ve ON ve."reversalId" = v."id" JOIN "ExpenseShare" sh ON sh."id" = ve."sourceShareId"
                         WHERE v."revisionId" = r."id" AND (sh."revisionId" <> r."id" OR sh."participantUserId" = r."payerUserId" OR sh."shareCents" = 0))
          )
    ) THEN RAISE(ABORT, 'reversal must contain exactly one entry for every non-payer nonzero share') END;
END;

CREATE TRIGGER "Expense_validate_projection_update"
BEFORE UPDATE OF "currentRevisionNumber", "currentBalanceScopeId" ON "Expense"
WHEN NEW."currentRevisionNumber" <> OLD."currentRevisionNumber" OR NEW."currentBalanceScopeId" IS NOT OLD."currentBalanceScopeId"
BEGIN
    SELECT CASE WHEN NOT EXISTS (
        SELECT 1 FROM "ExpenseRevision" r
        WHERE r."expenseId" = NEW."id" AND r."revisionNumber" = NEW."currentRevisionNumber"
          AND r."balanceScopeId" IS NEW."currentBalanceScopeId"
          AND NEW."status" = 'PENDING'
    ) THEN RAISE(ABORT, 'expense current revision and scope must match a pending source revision') END;
END;

CREATE TRIGGER "Expense_validate_status_transition"
BEFORE UPDATE OF "status" ON "Expense"
WHEN NEW."status" <> OLD."status"
 AND NOT ((OLD."status" = 'PENDING' AND NEW."status" IN ('APPROVED', 'REJECTED'))
          OR (OLD."status" = 'APPROVED' AND NEW."status" = 'REVERSED'))
BEGIN
    SELECT RAISE(ABORT, 'invalid expense status transition');
END;

CREATE TRIGGER "ExpenseRevision_no_update"
BEFORE UPDATE ON "ExpenseRevision"
BEGIN
    SELECT RAISE(ABORT, 'expense revisions are immutable');
END;

CREATE TRIGGER "ExpenseRevision_no_delete"
BEFORE DELETE ON "ExpenseRevision"
BEGIN
    SELECT RAISE(ABORT, 'expense revisions are immutable');
END;

CREATE TRIGGER "ExpenseShare_no_update"
BEFORE UPDATE ON "ExpenseShare"
BEGIN
    SELECT RAISE(ABORT, 'expense shares are immutable');
END;

CREATE TRIGGER "ExpenseShare_no_delete"
BEFORE DELETE ON "ExpenseShare"
BEGIN
    SELECT RAISE(ABORT, 'expense shares are immutable');
END;

CREATE TRIGGER "Approval_no_update"
BEFORE UPDATE ON "Approval"
BEGIN
    SELECT RAISE(ABORT, 'approval decisions are immutable');
END;

CREATE TRIGGER "Approval_no_delete"
BEFORE DELETE ON "Approval"
BEGIN
    SELECT RAISE(ABORT, 'approval decisions are immutable');
END;

CREATE TRIGGER "Reversal_no_update"
BEFORE UPDATE ON "Reversal"
BEGIN
    SELECT RAISE(ABORT, 'reversals are immutable');
END;

CREATE TRIGGER "Reversal_no_delete"
BEFORE DELETE ON "Reversal"
BEGIN
    SELECT RAISE(ABORT, 'reversals are immutable');
END;

CREATE TRIGGER "ReversalEntry_no_update"
BEFORE UPDATE ON "ReversalEntry"
BEGIN
    SELECT RAISE(ABORT, 'reversal entries are immutable');
END;

CREATE TRIGGER "ReversalEntry_no_delete"
BEFORE DELETE ON "ReversalEntry"
BEGIN
    SELECT RAISE(ABORT, 'reversal entries are immutable');
END;

CREATE TRIGGER "Payment_no_update"
BEFORE UPDATE ON "Payment"
BEGIN
    SELECT RAISE(ABORT, 'payments are immutable');
END;

CREATE TRIGGER "Payment_no_delete"
BEFORE DELETE ON "Payment"
BEGIN
    SELECT RAISE(ABORT, 'payments are immutable');
END;

CREATE TRIGGER "Receipt_no_update"
BEFORE UPDATE ON "Receipt"
BEGIN
    SELECT RAISE(ABORT, 'receipts are immutable');
END;

CREATE TRIGGER "Receipt_no_delete"
BEFORE DELETE ON "Receipt"
BEGIN
    SELECT RAISE(ABORT, 'receipts are immutable');
END;

CREATE TRIGGER "Reversal_validate_original"
BEFORE INSERT ON "Reversal"
BEGIN
    SELECT CASE WHEN NOT EXISTS (
        SELECT 1 FROM "ExpenseRevision" r JOIN "Expense" e ON e."id" = r."expenseId"
        WHERE r."id" = NEW."revisionId" AND e."status" = 'APPROVED'
          AND r."revisionNumber" = e."currentRevisionNumber"
    ) THEN RAISE(ABORT, 'only the approved current expense revision may be reversed') END;
END;

CREATE TRIGGER "ReversalEntry_validate_source"
BEFORE INSERT ON "ReversalEntry"
BEGIN
    SELECT CASE WHEN NOT EXISTS (
        SELECT 1 FROM "Reversal" v
        JOIN "ExpenseRevision" r ON r."id" = v."revisionId"
        JOIN "ExpenseShare" sh ON sh."revisionId" = r."id"
        WHERE v."id" = NEW."reversalId"
          AND sh."id" = NEW."sourceShareId"
          AND sh."participantUserId" <> r."payerUserId"
          AND sh."shareCents" > 0
          AND NEW."amountCents" = sh."shareCents"
          AND NEW."balanceScopeId" = r."balanceScopeId"
          AND NEW."debtorUserId" = sh."participantUserId"
          AND NEW."creditorUserId" = r."payerUserId"
    ) THEN RAISE(ABORT, 'reversal entry must exactly invert an eligible source share') END;
END;

CREATE TRIGGER "PairwiseObligation_validate_scope_insert"
BEFORE INSERT ON "PairwiseObligation"
BEGIN
    SELECT CASE WHEN NOT EXISTS (
        SELECT 1 FROM "BalanceScope" s WHERE s."id" = NEW."balanceScopeId"
          AND (
              (s."kind" = 'DIRECT' AND NEW."userLowId" = s."directLowUserId" AND NEW."userHighId" = s."directHighUserId")
              OR
              (s."kind" = 'GROUP' AND EXISTS (SELECT 1 FROM "GroupMembership" m WHERE m."groupId" = s."groupId" AND m."userId" = NEW."userLowId")
               AND EXISTS (SELECT 1 FROM "GroupMembership" m WHERE m."groupId" = s."groupId" AND m."userId" = NEW."userHighId"))
          )
    ) THEN RAISE(ABORT, 'pairwise obligation users must belong to its scope') END;
END;

CREATE TRIGGER "PairwiseObligation_identity_immutable"
BEFORE UPDATE OF "balanceScopeId", "userLowId", "userHighId" ON "PairwiseObligation"
BEGIN
    SELECT RAISE(ABORT, 'pairwise obligation identity is immutable');
END;

CREATE TRIGGER "Payment_validate_outstanding_obligation"
BEFORE INSERT ON "Payment"
BEGIN
    SELECT CASE WHEN NOT EXISTS (
        SELECT 1 FROM "BalanceScope" s
        WHERE s."id" = NEW."balanceScopeId"
          AND (
              (s."kind" = 'DIRECT' AND NEW."debtorUserId" IN (s."directLowUserId", s."directHighUserId")
               AND NEW."creditorUserId" IN (s."directLowUserId", s."directHighUserId"))
              OR
              (s."kind" = 'GROUP'
               AND EXISTS (SELECT 1 FROM "GroupMembership" m WHERE m."groupId" = s."groupId" AND m."userId" = NEW."debtorUserId")
               AND EXISTS (SELECT 1 FROM "GroupMembership" m WHERE m."groupId" = s."groupId" AND m."userId" = NEW."creditorUserId"))
          )
          AND EXISTS (
              SELECT 1 FROM "PairwiseObligation" p
              WHERE p."balanceScopeId" = s."id"
                AND p."userLowId" = CASE WHEN NEW."debtorUserId" < NEW."creditorUserId" THEN NEW."debtorUserId" ELSE NEW."creditorUserId" END
                AND p."userHighId" = CASE WHEN NEW."debtorUserId" < NEW."creditorUserId" THEN NEW."creditorUserId" ELSE NEW."debtorUserId" END
                AND ((NEW."debtorUserId" < NEW."creditorUserId" AND p."signedBalanceCents" > 0
                      AND NEW."amountCents" <= p."signedBalanceCents")
                     OR (NEW."debtorUserId" > NEW."creditorUserId" AND p."signedBalanceCents" < 0
                         AND (p."signedBalanceCents" = -9223372036854775808 OR NEW."amountCents" <= -p."signedBalanceCents")))
          )
    ) THEN RAISE(ABORT, 'payment must settle an outstanding authorized obligation within its scope') END;
END;

CREATE TRIGGER "Payment_apply_to_pairwise_projection"
AFTER INSERT ON "Payment"
BEGIN
    UPDATE "PairwiseObligation"
       SET "signedBalanceCents" = CASE
           WHEN NEW."debtorUserId" < NEW."creditorUserId"
               THEN "signedBalanceCents" - NEW."amountCents"
           ELSE "signedBalanceCents" + NEW."amountCents"
       END
     WHERE "balanceScopeId" = NEW."balanceScopeId"
       AND "userLowId" = CASE WHEN NEW."debtorUserId" < NEW."creditorUserId" THEN NEW."debtorUserId" ELSE NEW."creditorUserId" END
       AND "userHighId" = CASE WHEN NEW."debtorUserId" < NEW."creditorUserId" THEN NEW."creditorUserId" ELSE NEW."debtorUserId" END;
END;

CREATE TRIGGER "Expense_identity_immutable_after_revision"
BEFORE UPDATE OF "kind", "groupId", "createdByUserId", "createdAt" ON "Expense"
WHEN EXISTS (SELECT 1 FROM "ExpenseRevision" r WHERE r."expenseId" = OLD."id")
BEGIN
    SELECT RAISE(ABORT, 'expense identity is immutable after a revision exists');
END;

CREATE TRIGGER "BalanceScope_identity_immutable_after_use"
BEFORE UPDATE OF "kind", "groupId", "directLowUserId", "directHighUserId", "currencyCode" ON "BalanceScope"
WHEN EXISTS (SELECT 1 FROM "ExpenseRevision" r WHERE r."balanceScopeId" = OLD."id")
  OR EXISTS (SELECT 1 FROM "Payment" p WHERE p."balanceScopeId" = OLD."id")
  OR EXISTS (SELECT 1 FROM "PairwiseObligation" p WHERE p."balanceScopeId" = OLD."id")
  OR EXISTS (SELECT 1 FROM "ReversalEntry" v WHERE v."balanceScopeId" = OLD."id")
BEGIN
    SELECT RAISE(ABORT, 'financially used balance scope identity is immutable');
END;

CREATE TRIGGER "GroupMembership_identity_immutable"
BEFORE UPDATE OF "groupId", "userId", "createdAt" ON "GroupMembership"
BEGIN
    SELECT RAISE(ABORT, 'membership identity is immutable; deactivate and create a new period instead');
END;

CREATE TRIGGER "GroupMembership_no_delete"
BEFORE DELETE ON "GroupMembership"
BEGIN
    SELECT RAISE(ABORT, 'membership rows are retained as historical identity');
END;

CREATE TRIGGER "Receipt_validate_blob_size"
BEFORE INSERT ON "Receipt"
WHEN length(NEW."content") <> NEW."sizeBytes"
BEGIN
    SELECT RAISE(ABORT, 'receipt sizeBytes must match the stored content length');
END;

