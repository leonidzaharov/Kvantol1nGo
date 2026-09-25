-- CreateEnum
CREATE TYPE "AchievementMetric" AS ENUM ('lessons_completed', 'category_completed', 'level_reached', 'perfect_lessons');

-- DropForeignKey
ALTER TABLE "UserAchievement" DROP CONSTRAINT "UserAchievement_achievementId_fkey";

-- AlterTable
ALTER TABLE "Achievement" ADD COLUMN     "categoryId" INTEGER,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "metric" "AchievementMetric" NOT NULL DEFAULT 'lessons_completed',
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "code" DROP NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "showcaseAchievementId" INTEGER;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_showcaseAchievementId_fkey" FOREIGN KEY ("showcaseAchievementId") REFERENCES "Achievement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Achievement" ADD CONSTRAINT "Achievement_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAchievement" ADD CONSTRAINT "UserAchievement_achievementId_fkey" FOREIGN KEY ("achievementId") REFERENCES "Achievement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- Данные: переносим 8 «встроенных» ачивок из кода (REGISTRY в
-- lib/achievements.ts) в БД. Раньше строки создавались лениво при первом
-- прогрессе — поэтому часть может отсутствовать: INSERT … ON CONFLICT
-- покрывает оба случая, а прогресс учеников (UserAchievement) не трогаем.
-- ============================================================
INSERT INTO "Achievement" (code, title, description, icon, metric, "targetValue", "rewardCurrency", "sortOrder")
VALUES
  ('first_lesson', 'Первый урок завершён', 'Закрыл свой первый квест в Цитадели.', '🎯', 'lessons_completed', 1,  25,  10),
  ('lessons_5',    'Подмастерье',          'Пять уроков пройдено — рука уже не дрожит.', '📘', 'lessons_completed', 5,  50,  20),
  ('lessons_15',   'Книжный знаток',       'Пятнадцать свитков покорено.', '📚', 'lessons_completed', 15, 100, 30),
  ('level_3',      'Третья ступень',       'Достиг уровня 3.', '⭐', 'level_reached', 3, 75,  40),
  ('level_6',      'Магистр Цитадели',     'Достиг уровня 6 — финальный ранг курса.', '👑', 'level_reached', 6, 200, 50),
  ('scratch_done', 'Архитектор блоков',    'Все уроки Scratch пройдены.', '🐱', 'category_completed', 1, 250, 60),
  ('html_done',    'Зодчий разметки',      'Все уроки HTML пройдены.', '🏗️', 'category_completed', 1, 200, 70),
  ('js_done',      'Колдун JavaScript',    'Все уроки JavaScript пройдены.', '🧙', 'category_completed', 1, 300, 80)
ON CONFLICT (code) DO UPDATE SET
  icon = EXCLUDED.icon,
  metric = EXCLUDED.metric,
  "sortOrder" = EXCLUDED."sortOrder";

-- Привязываем категорийные ачивки к категориям по имени — единственный
-- раз, когда имя используется как ключ; дальше связь живёт по id и
-- переименование категории её не порвёт. Если категории нет — останется
-- NULL, движок такую ачивку просто не продвигает.
UPDATE "Achievement" a SET "categoryId" = c.id FROM "Category" c WHERE a.code = 'scratch_done' AND c.name = 'Scratch';
UPDATE "Achievement" a SET "categoryId" = c.id FROM "Category" c WHERE a.code = 'html_done'    AND c.name = 'HTML';
UPDATE "Achievement" a SET "categoryId" = c.id FROM "Category" c WHERE a.code = 'js_done'      AND c.name = 'JavaScript';
