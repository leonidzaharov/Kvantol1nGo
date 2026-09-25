ALTER TABLE "Category" ADD COLUMN "isPublished" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Lesson" ADD COLUMN "isPublished" BOOLEAN NOT NULL DEFAULT false;

-- Existing classroom content must remain visible after deployment.
UPDATE "Category" SET "isPublished" = true;
UPDATE "Lesson" SET "isPublished" = true;

CREATE TABLE "CategoryGroupAssignment" (
    "categoryId" INTEGER NOT NULL,
    "groupId" INTEGER NOT NULL,
    CONSTRAINT "CategoryGroupAssignment_pkey" PRIMARY KEY ("categoryId", "groupId")
);

CREATE TABLE "LessonGroupAssignment" (
    "lessonId" INTEGER NOT NULL,
    "groupId" INTEGER NOT NULL,
    CONSTRAINT "LessonGroupAssignment_pkey" PRIMARY KEY ("lessonId", "groupId")
);

CREATE INDEX "CategoryGroupAssignment_groupId_idx" ON "CategoryGroupAssignment"("groupId");
CREATE INDEX "LessonGroupAssignment_groupId_idx" ON "LessonGroupAssignment"("groupId");

ALTER TABLE "CategoryGroupAssignment" ADD CONSTRAINT "CategoryGroupAssignment_categoryId_fkey"
FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CategoryGroupAssignment" ADD CONSTRAINT "CategoryGroupAssignment_groupId_fkey"
FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LessonGroupAssignment" ADD CONSTRAINT "LessonGroupAssignment_lessonId_fkey"
FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LessonGroupAssignment" ADD CONSTRAINT "LessonGroupAssignment_groupId_fkey"
FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Preserve the old track-based audience for all existing courses.
INSERT INTO "CategoryGroupAssignment" ("categoryId", "groupId")
SELECT c."id", g."id"
FROM "Category" c
JOIN "Group" g ON g."track" = c."track";
