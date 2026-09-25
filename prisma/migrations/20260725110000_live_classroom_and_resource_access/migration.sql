-- CreateEnum
CREATE TYPE "ClassSessionPhase" AS ENUM ('theory', 'tasks', 'bonus', 'completed');

-- CreateEnum
CREATE TYPE "LessonTaskSection" AS ENUM ('core', 'bonus');

-- AlterTable
ALTER TABLE "Resource"
ADD COLUMN "isPublished" BOOLEAN NOT NULL DEFAULT false;

-- Existing materials were visible to everybody before this migration.
UPDATE "Resource" SET "isPublished" = true;

-- CreateTable
CREATE TABLE "ClassSession" (
    "id" SERIAL NOT NULL,
    "groupId" INTEGER NOT NULL,
    "lessonId" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "ClassSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionStudentProgress" (
    "sessionId" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "phase" "ClassSessionPhase" NOT NULL DEFAULT 'theory',
    "currentQuestionIndex" INTEGER NOT NULL DEFAULT 0,
    "answeredCount" INTEGER NOT NULL DEFAULT 0,
    "totalQuestions" INTEGER NOT NULL DEFAULT 0,
    "bonusAnsweredCount" INTEGER NOT NULL DEFAULT 0,
    "bonusTotalQuestions" INTEGER NOT NULL DEFAULT 0,
    "wrongAttempts" INTEGER NOT NULL DEFAULT 0,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "SessionStudentProgress_pkey" PRIMARY KEY ("sessionId","userId")
);

-- CreateTable
CREATE TABLE "SessionQuestionProgress" (
    "sessionId" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "section" "LessonTaskSection" NOT NULL,
    "questionIndex" INTEGER NOT NULL,
    "wrongAttempts" INTEGER NOT NULL DEFAULT 0,
    "isSolved" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SessionQuestionProgress_pkey" PRIMARY KEY ("sessionId","userId","section","questionIndex")
);

-- CreateTable
CREATE TABLE "ResourceGroupAssignment" (
    "resourceId" INTEGER NOT NULL,
    "groupId" INTEGER NOT NULL,

    CONSTRAINT "ResourceGroupAssignment_pkey" PRIMARY KEY ("resourceId","groupId")
);

-- Preserve the old audience: every existing material is assigned to every
-- existing group. New materials remain drafts with no audience.
INSERT INTO "ResourceGroupAssignment" ("resourceId", "groupId")
SELECT r."id", g."id"
FROM "Resource" r
CROSS JOIN "Group" g
ON CONFLICT DO NOTHING;

-- CreateIndex
CREATE INDEX "ClassSession_groupId_endedAt_idx" ON "ClassSession"("groupId", "endedAt");

-- CreateIndex
CREATE INDEX "ClassSession_groupId_lessonId_endedAt_idx" ON "ClassSession"("groupId", "lessonId", "endedAt");

-- CreateIndex
CREATE INDEX "SessionStudentProgress_userId_lastActivityAt_idx" ON "SessionStudentProgress"("userId", "lastActivityAt");

-- CreateIndex
CREATE INDEX "SessionQuestionProgress_sessionId_section_questionIndex_idx" ON "SessionQuestionProgress"("sessionId", "section", "questionIndex");

-- CreateIndex
CREATE INDEX "ResourceGroupAssignment_groupId_idx" ON "ResourceGroupAssignment"("groupId");

-- AddForeignKey
ALTER TABLE "ClassSession" ADD CONSTRAINT "ClassSession_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassSession" ADD CONSTRAINT "ClassSession_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionStudentProgress" ADD CONSTRAINT "SessionStudentProgress_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ClassSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionStudentProgress" ADD CONSTRAINT "SessionStudentProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionQuestionProgress" ADD CONSTRAINT "SessionQuestionProgress_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ClassSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionQuestionProgress" ADD CONSTRAINT "SessionQuestionProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceGroupAssignment" ADD CONSTRAINT "ResourceGroupAssignment_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceGroupAssignment" ADD CONSTRAINT "ResourceGroupAssignment_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
