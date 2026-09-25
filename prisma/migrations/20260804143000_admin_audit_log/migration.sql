CREATE TYPE "AdminAuditAction" AS ENUM (
  'created',
  'updated',
  'deleted',
  'published',
  'unpublished',
  'archived',
  'audience_updated',
  'pin_reset',
  'awarded',
  'accepted',
  'returned',
  'session_started',
  'session_ended'
);

CREATE TYPE "AdminAuditEntity" AS ENUM (
  'student',
  'group',
  'course',
  'lesson',
  'resource',
  'review_assignment',
  'review_submission',
  'achievement',
  'class_session'
);

CREATE TABLE "AdminAuditLog" (
  "id" SERIAL NOT NULL,
  "actorId" TEXT,
  "action" "AdminAuditAction" NOT NULL,
  "entityType" "AdminAuditEntity" NOT NULL,
  "entityId" TEXT,
  "entityLabel" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AdminAuditLog_createdAt_idx" ON "AdminAuditLog"("createdAt");
CREATE INDEX "AdminAuditLog_actorId_createdAt_idx" ON "AdminAuditLog"("actorId", "createdAt");

ALTER TABLE "AdminAuditLog"
ADD CONSTRAINT "AdminAuditLog_actorId_fkey"
FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
