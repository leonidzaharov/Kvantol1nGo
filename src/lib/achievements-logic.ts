// Чистая логика достижений — без БД и побочных эффектов (тот же приём, что и
// gamification-logic.ts). Здесь живёт ВСЯ арифметика прогресса и правила
// выдачи; achievements.ts только достаёт данные из БД, зовёт эти функции и
// записывает результат. Так самое рискованное место проекта (начисление монет
// и выдача ачивок) покрывается юнит-тестами без базы.

import type { AchievementMetric } from "@/generated/prisma";

/** Снимок метрик ученика сразу после завершения урока. */
export type AchievementContext = {
  /** Всего уроков пройдено (уже с учётом только что завершённого). */
  completedLessons: number;
  /** Текущий уровень (после начисления XP за урок). */
  level: number;
  /** Категория только что пройденного урока. */
  categoryId: number;
  /** Сколько уроков ЭТОЙ категории пройдено. */
  categoryCompletedLessons: number;
  /** 1 — урок впервые пройден без единой ошибки, иначе 0. */
  perfectDelta: 0 | 1;
};

/** Правило ачивки — то, что нужно движку для решения (срез строки Achievement). */
export type AchievementRule = {
  metric: AchievementMetric;
  /** Только для metric = category_completed. */
  categoryId: number | null;
  /** Цель из админки; для category_completed игнорируется. */
  targetValue: number;
  /** Живое число уроков в категории ачивки (null, если категории нет). */
  categoryLessonCount: number | null;
};

/** Текущий прогресс ученика по ачивке (null — ещё ни разу не касался). */
export type ExistingProgress = { progress: number; isUnlocked: boolean } | null;

export type ProgressOutcome = {
  /** Цель, по которой считали (для category_completed — число уроков курса). */
  target: number;
  /** Новый прогресс: не ниже прежнего, не выше цели, не отрицательный. */
  progress: number;
  /** true — ИМЕННО этот вызов открывает ачивку. */
  willUnlock: boolean;
};

/**
 * Решает, что делать с одной ачивкой после завершения урока.
 *
 * Возвращает null, когда трогать её не нужно:
 *   • уже открыта — повторно не выдаём (и монеты второй раз не платим);
 *   • метрика не про этот урок (чужая категория, урок без «перфекта»);
 *   • категорийная ачивка без категории или с пустой категорией.
 *
 * Прогресс никогда не падает: счётчики-снимки берутся через max, поэтому
 * удалённый из курса урок не отнимет у ученика накопленное.
 */
export function computeAchievementProgress(
  rule: AchievementRule,
  ctx: AchievementContext,
  existing: ExistingProgress,
): ProgressOutcome | null {
  // Открытую ачивку не трогаем — главный барьер от повторной выдачи наград.
  if (existing?.isUnlocked) return null;

  const current = existing?.progress ?? 0;

  let target = rule.targetValue;
  let raw: number;

  switch (rule.metric) {
    case "lessons_completed":
      raw = Math.max(current, ctx.completedLessons);
      break;

    case "level_reached":
      raw = Math.max(current, ctx.level);
      break;

    case "perfect_lessons":
      // Событийная метрика: копится по +1. Если урок пройден с ошибкой или
      // это повтор (perfectDelta = 0) — ачивку не двигаем вовсе, иначе
      // «перфекты» фармились бы пересдачей уже выученного урока.
      if (ctx.perfectDelta === 0) return null;
      raw = current + ctx.perfectDelta;
      break;

    case "category_completed": {
      // Считаем только когда пройден урок ИМЕННО этой категории.
      if (rule.categoryId === null || rule.categoryId !== ctx.categoryId) {
        return null;
      }
      // Цель — живое число уроков курса: наставник добавил урок, и планка
      // подросла сама. Пустой курс проходить нечего — ачивку не выдаём.
      target = rule.categoryLessonCount ?? 0;
      if (target <= 0) return null;
      raw = Math.max(current, ctx.categoryCompletedLessons);
      break;
    }

    case "manual_award":
      // Ручное достижение выдаёт только отдельное действие наставника.
      // Завершение урока не должно случайно продвигать его прогресс.
      return null;

    default: {
      // Новая метрика в enum, но не в движке — молча ничего не делаем.
      // (Exhaustive-проверка: при добавлении варианта TS укажет сюда.)
      const _never: never = rule.metric;
      void _never;
      return null;
    }
  }

  const progress = Math.max(0, Math.min(target, raw));
  return { target, progress, willUnlock: progress >= target };
}

/** Награды за завершение урока. */
export type LessonRewards = {
  /** true — урок засчитан впервые (только тогда платим XP и монеты). */
  firstCompletion: boolean;
  gainedXp: number;
  gainedCoins: number;
  newTotalXp: number;
  newLevel: number;
  leveledUp: boolean;
};

/**
 * Считает награды за урок. Ключевое правило: XP и монеты платим ТОЛЬКО за
 * первое прохождение — иначе бесконечный фарм пересдачей одного урока.
 * Повтор («тренировка») остаётся полезным, но бесплатным.
 */
export function computeLessonRewards(
  lesson: { xpReward: number; coinReward: number },
  user: { totalXp: number; level: number },
  alreadyCompleted: boolean,
  calculateLevel: (totalXp: number) => number,
): LessonRewards {
  const firstCompletion = !alreadyCompleted;
  const gainedXp = firstCompletion ? lesson.xpReward : 0;
  const gainedCoins = firstCompletion ? lesson.coinReward : 0;
  const newTotalXp = user.totalXp + gainedXp;
  const newLevel = calculateLevel(newTotalXp);

  return {
    firstCompletion,
    gainedXp,
    gainedCoins,
    newTotalXp,
    newLevel,
    leveledUp: newLevel > user.level,
  };
}
