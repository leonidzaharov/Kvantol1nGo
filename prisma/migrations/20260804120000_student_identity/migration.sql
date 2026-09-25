-- В приложении User.name остаётся публичным ником, чтобы не ломать профиль,
-- лидерборд и достижения. Наставник получает отдельную приватную подпись.
ALTER TABLE "User"
ADD COLUMN "mentorLabel" TEXT,
ADD COLUMN "profileConfiguredAt" TIMESTAMP(3),
ADD COLUMN "pinFingerprint" TEXT;

CREATE UNIQUE INDEX "User_pinFingerprint_key" ON "User"("pinFingerprint");

-- Существующее имя становится начальной приватной подписью и будет показано
-- ученику в форме первого входа. Сам публичный ник он подтвердит отдельно.
UPDATE "User"
SET "mentorLabel" = "name"
WHERE "isAdmin" = false;
