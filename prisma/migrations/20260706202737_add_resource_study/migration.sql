-- AlterTable
ALTER TABLE "Resource" ADD COLUMN     "coinReward" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "UserResource" (
    "userId" TEXT NOT NULL,
    "resourceId" INTEGER NOT NULL,
    "studiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserResource_pkey" PRIMARY KEY ("userId","resourceId")
);

-- AddForeignKey
ALTER TABLE "UserResource" ADD CONSTRAINT "UserResource_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserResource" ADD CONSTRAINT "UserResource_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Данные: существующим материалам проставляем тарифы по типу
-- (совет/ссылка 1, Scratch 2, видео 3) — до этого у всех дефолт 1.
UPDATE "Resource" SET "coinReward" = CASE "type"
  WHEN 'video' THEN 3
  WHEN 'scratch' THEN 2
  ELSE 1
END;
