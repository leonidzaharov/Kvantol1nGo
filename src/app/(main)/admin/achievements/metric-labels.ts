import type { AchievementMetric } from "@/generated/prisma";

/** Человекочитаемые названия типов условий — для списка и формы админки. */
export const METRIC_LABELS: Record<AchievementMetric, string> = {
  lessons_completed: "Пройдено уроков",
  category_completed: "Курс пройден целиком",
  level_reached: "Достигнут уровень",
  perfect_lessons: "Уроков без ошибок",
  manual_award: "Ручная выдача наставником",
};

/** Порядок в селекте формы: от самых ходовых к специфичным. */
export const METRIC_ORDER: AchievementMetric[] = [
  "lessons_completed",
  "category_completed",
  "level_reached",
  "perfect_lessons",
  "manual_award",
];
