-- CreateEnum
CREATE TYPE "ReviewAssignmentStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ReviewResponseType" AS ENUM ('TEXT', 'LINK', 'CODE');

-- CreateEnum
CREATE TYPE "ReviewCodeLanguage" AS ENUM ('PYTHON', 'JAVASCRIPT', 'HTML', 'CSS', 'OTHER');

-- CreateEnum
CREATE TYPE "ReviewSubmissionStatus" AS ENUM ('SUBMITTED', 'REVISION_REQUESTED', 'ACCEPTED');

-- CreateTable
CREATE TABLE "ReviewAssignment" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "instructions" TEXT NOT NULL,
    "responseType" "ReviewResponseType" NOT NULL,
    "codeLanguage" "ReviewCodeLanguage",
    "status" "ReviewAssignmentStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "ReviewAssignment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ReviewAssignment_code_language_check" CHECK (
        ("responseType" = 'CODE' AND "codeLanguage" IS NOT NULL)
        OR
        ("responseType" <> 'CODE' AND "codeLanguage" IS NULL)
    )
);

-- CreateTable
CREATE TABLE "ReviewAssignmentGroup" (
    "assignmentId" INTEGER NOT NULL,
    "groupId" INTEGER NOT NULL,

    CONSTRAINT "ReviewAssignmentGroup_pkey" PRIMARY KEY ("assignmentId","groupId")
);

-- CreateTable
CREATE TABLE "ReviewAssignmentUser" (
    "assignmentId" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "ReviewAssignmentUser_pkey" PRIMARY KEY ("assignmentId","userId")
);

-- CreateTable
CREATE TABLE "ReviewSubmission" (
    "id" SERIAL NOT NULL,
    "assignmentId" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "ReviewSubmissionStatus" NOT NULL DEFAULT 'SUBMITTED',
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReviewSubmission_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ReviewSubmission_current_version_check" CHECK ("currentVersion" >= 1)
);

-- CreateTable
CREATE TABLE "ReviewSubmissionVersion" (
    "submissionId" INTEGER NOT NULL,
    "version" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "status" "ReviewSubmissionStatus" NOT NULL DEFAULT 'SUBMITTED',
    "mentorComment" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "ReviewSubmissionVersion_pkey" PRIMARY KEY ("submissionId","version"),
    CONSTRAINT "ReviewSubmissionVersion_version_check" CHECK ("version" >= 1)
);

-- CreateIndex
CREATE INDEX "ReviewAssignment_status_createdAt_idx" ON "ReviewAssignment"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ReviewAssignmentGroup_groupId_assignmentId_idx" ON "ReviewAssignmentGroup"("groupId", "assignmentId");

-- CreateIndex
CREATE INDEX "ReviewAssignmentUser_userId_assignmentId_idx" ON "ReviewAssignmentUser"("userId", "assignmentId");

-- CreateIndex
CREATE INDEX "ReviewSubmission_assignmentId_status_idx" ON "ReviewSubmission"("assignmentId", "status");

-- CreateIndex
CREATE INDEX "ReviewSubmission_userId_status_idx" ON "ReviewSubmission"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewSubmission_assignmentId_userId_key" ON "ReviewSubmission"("assignmentId", "userId");

-- CreateIndex
CREATE INDEX "ReviewSubmissionVersion_submissionId_submittedAt_idx" ON "ReviewSubmissionVersion"("submissionId", "submittedAt");

-- AddForeignKey
ALTER TABLE "ReviewAssignmentGroup" ADD CONSTRAINT "ReviewAssignmentGroup_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "ReviewAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewAssignmentGroup" ADD CONSTRAINT "ReviewAssignmentGroup_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewAssignmentUser" ADD CONSTRAINT "ReviewAssignmentUser_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "ReviewAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewAssignmentUser" ADD CONSTRAINT "ReviewAssignmentUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewSubmission" ADD CONSTRAINT "ReviewSubmission_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "ReviewAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewSubmission" ADD CONSTRAINT "ReviewSubmission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewSubmissionVersion" ADD CONSTRAINT "ReviewSubmissionVersion_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "ReviewSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
