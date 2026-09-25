export const COINS_PER_PIXEL = 20;
export const COURSE_PIXEL_LIMIT = 60;
export const DEFAULT_LESSON_COINS = 20;
export const DEFAULT_RESOURCE_COINS = 2;
export const ACHIEVEMENT_COIN_GUIDE = { common: 2, uncommon: 4, rare: 6, epic: 8, legendary: 12, mythic: 20 } as const;
export function pixelExchangeSummary(coins: number, redeemed: number) {
  const remaining = Math.max(0, COURSE_PIXEL_LIMIT - redeemed);
  return {
    remaining,
    available: Math.min(remaining, Math.floor(Math.max(0, coins) / COINS_PER_PIXEL)),
    coinsPerPixel: COINS_PER_PIXEL,
    limit: COURSE_PIXEL_LIMIT,
  };
}
