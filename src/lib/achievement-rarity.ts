import type { AchievementRarity } from "@/generated/prisma";

export const ACHIEVEMENT_RARITY_LABELS: Record<
  AchievementRarity,
  string
> = {
  common: "Обычное",
  uncommon: "Необычное",
  rare: "Редкое",
  epic: "Эпическое",
  legendary: "Легендарное",
  mythic: "Мифическое",
};

export const ACHIEVEMENT_RARITY_ORDER: AchievementRarity[] = [
  "common",
  "uncommon",
  "rare",
  "epic",
  "legendary",
  "mythic",
];
