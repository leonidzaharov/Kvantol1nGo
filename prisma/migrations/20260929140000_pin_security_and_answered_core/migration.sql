ALTER TABLE "LoginAttempt" ADD COLUMN "ipHash" TEXT;
CREATE INDEX "LoginAttempt_ipHash_attemptedAt_idx" ON "LoginAttempt"("ipHash", "attemptedAt");

ALTER TABLE "UserLessonProgress" ADD COLUMN "answeredCore" INTEGER[] NOT NULL DEFAULT '{}';
