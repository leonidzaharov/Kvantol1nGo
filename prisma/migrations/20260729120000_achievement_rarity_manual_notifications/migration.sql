-- Сначала только расширяем схему. Замена каталога выполняется отдельной
-- контролируемой миграцией после проверки этих полей.
CREATE TYPE "AchievementRarity" AS ENUM (
  'common',
  'uncommon',
  'rare',
  'epic',
  'legendary',
  'mythic'
);

ALTER TYPE "AchievementMetric" ADD VALUE 'manual_award';

ALTER TABLE "Achievement"
ADD COLUMN "rarity" "AchievementRarity" NOT NULL DEFAULT 'common',
ADD COLUMN "hiddenHint" TEXT;

ALTER TABLE "UserAchievement"
ADD COLUMN "notifiedAt" TIMESTAMP(3);

-- Старые открытия уже были показаны прежним интерфейсом. Эта защита не даст
-- будущему механизму очереди повторно показать их как новые уведомления.
UPDATE "UserAchievement"
SET "notifiedAt" = COALESCE("unlockedAt", CURRENT_TIMESTAMP)
WHERE "isUnlocked" = true;
