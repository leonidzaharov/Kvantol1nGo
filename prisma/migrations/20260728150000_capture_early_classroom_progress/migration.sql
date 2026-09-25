-- A null activatedAt marks a hidden pre-session used to capture students who
-- open a published lesson before the mentor starts the live dashboard.
ALTER TABLE "ClassSession"
ADD COLUMN "activatedAt" TIMESTAMP(3);

-- Every session created before this migration was explicitly started by a
-- mentor, so its activation time is the original start time.
UPDATE "ClassSession"
SET "activatedAt" = "startedAt"
WHERE "activatedAt" IS NULL;

CREATE INDEX "ClassSession_groupId_activatedAt_endedAt_idx"
ON "ClassSession"("groupId", "activatedAt", "endedAt");
