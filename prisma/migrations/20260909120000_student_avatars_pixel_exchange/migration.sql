ALTER TABLE "User" ADD COLUMN "avatarId" TEXT NOT NULL DEFAULT 'fox',
  ADD COLUMN "pixelsRedeemed" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD CONSTRAINT "User_pixelsRedeemed_range" CHECK ("pixelsRedeemed" BETWEEN 0 AND 60);
CREATE TABLE "PixelRedemption" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "actorId" TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "pixels" INTEGER NOT NULL CHECK ("pixels" BETWEEN 1 AND 60),
  "coins" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PixelRedemption_rate" CHECK ("coins" = "pixels" * 20)
);
CREATE INDEX "PixelRedemption_userId_createdAt_idx" ON "PixelRedemption"("userId", "createdAt");
ALTER TABLE "Lesson" ALTER COLUMN "coinReward" SET DEFAULT 20;
ALTER TABLE "Resource" ALTER COLUMN "coinReward" SET DEFAULT 2;
-- Standardise FUTURE rewards. Existing balances and completed progress are preserved.
UPDATE "Lesson" SET "coinReward" = 20 WHERE "coinReward" > 0;
UPDATE "Resource" SET "coinReward" = 2 WHERE "coinReward" > 0;
UPDATE "Achievement" SET "rewardCurrency" = CASE "rarity"::text
  WHEN 'common' THEN 2 WHEN 'uncommon' THEN 4 WHEN 'rare' THEN 6
  WHEN 'epic' THEN 8 WHEN 'legendary' THEN 12 WHEN 'mythic' THEN 20 END
WHERE "rewardCurrency" > 0;
