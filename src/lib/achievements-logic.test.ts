import { describe, expect, it } from "vitest";

import {
  computeAchievementProgress,
  computeLessonRewards,
  type AchievementContext,
  type AchievementRule,
} from "./achievements-logic";
import { calculateLevel } from "./gamification-logic";

// Базовый снимок метрик: ученик только что прошёл 3-й урок курса 1,
// всего у него 3 урока, уровень 1, урок пройден с ошибкой.
const ctx = (over: Partial<AchievementContext> = {}): AchievementContext => ({
  completedLessons: 3,
  level: 1,
  categoryId: 1,
  categoryCompletedLessons: 3,
  perfectDelta: 0,
  ...over,
});

const rule = (over: Partial<AchievementRule> = {}): AchievementRule => ({
  metric: "lessons_completed",
  categoryId: null,
  targetValue: 5,
  categoryLessonCount: null,
  ...over,
});

describe("computeAchievementProgress — защита от повторной выдачи", () => {
  it("не трогает уже открытую ачивку (монеты второй раз не платим)", () => {
    const out = computeAchievementProgress(rule(), ctx({ completedLessons: 99 }), {
      progress: 5,
      isUnlocked: true,
    });
    expect(out).toBeNull();
  });

  it("повторное прохождение того же урока не двигает прогресс", () => {
    // Счётчик пройденных уроков при повторе не растёт (остаётся 3),
    // а max() не даёт прогрессу упасть или подрасти.
    const out = computeAchievementProgress(rule(), ctx(), {
      progress: 3,
      isUnlocked: false,
    });
    expect(out).toEqual({ target: 5, progress: 3, willUnlock: false });
  });
});

describe("computeAchievementProgress — lessons_completed", () => {
  it("копит прогресс и открывает ачивку по достижении цели", () => {
    expect(
      computeAchievementProgress(rule({ targetValue: 5 }), ctx({ completedLessons: 5 }), null),
    ).toEqual({ target: 5, progress: 5, willUnlock: true });
  });

  it("прогресс не превышает цель, даже если уроков пройдено больше", () => {
    const out = computeAchievementProgress(
      rule({ targetValue: 5 }),
      ctx({ completedLessons: 42 }),
      null,
    );
    expect(out).toEqual({ target: 5, progress: 5, willUnlock: true });
  });

  it("накопленный прогресс не падает, если уроков в базе стало меньше", () => {
    // Наставник удалил урок → completedLessons упал с 4 до 2.
    // Ученик не должен «потерять» уже заработанное.
    const out = computeAchievementProgress(
      rule({ targetValue: 5 }),
      ctx({ completedLessons: 2 }),
      { progress: 4, isUnlocked: false },
    );
    expect(out?.progress).toBe(4);
  });
});

describe("computeAchievementProgress — level_reached", () => {
  it("открывается при достижении уровня", () => {
    expect(
      computeAchievementProgress(
        rule({ metric: "level_reached", targetValue: 3 }),
        ctx({ level: 3 }),
        null,
      ),
    ).toEqual({ target: 3, progress: 3, willUnlock: true });
  });

  it("на полпути показывает промежуточный прогресс", () => {
    expect(
      computeAchievementProgress(
        rule({ metric: "level_reached", targetValue: 6 }),
        ctx({ level: 2 }),
        null,
      ),
    ).toEqual({ target: 6, progress: 2, willUnlock: false });
  });
});

describe("computeAchievementProgress — perfect_lessons (нельзя нафармить)", () => {
  const perfectRule = rule({ metric: "perfect_lessons", targetValue: 3 });

  it("урок с ошибкой (perfectDelta=0) не двигает прогресс вообще", () => {
    expect(
      computeAchievementProgress(perfectRule, ctx({ perfectDelta: 0 }), {
        progress: 2,
        isUnlocked: false,
      }),
    ).toBeNull();
  });

  it("повтор урока без ошибок тоже не считается (perfectDelta=0 при повторе)", () => {
    // completeLesson передаёт perfectDelta = 1 только при ПЕРВОМ прохождении —
    // здесь проверяем, что движок на 0 ничего не начисляет.
    expect(
      computeAchievementProgress(perfectRule, ctx({ perfectDelta: 0 }), null),
    ).toBeNull();
  });

  it("первый безошибочный урок добавляет ровно +1", () => {
    expect(
      computeAchievementProgress(perfectRule, ctx({ perfectDelta: 1 }), {
        progress: 1,
        isUnlocked: false,
      }),
    ).toEqual({ target: 3, progress: 2, willUnlock: false });
  });

  it("третий безошибочный урок открывает ачивку", () => {
    expect(
      computeAchievementProgress(perfectRule, ctx({ perfectDelta: 1 }), {
        progress: 2,
        isUnlocked: false,
      }),
    ).toEqual({ target: 3, progress: 3, willUnlock: true });
  });
});

describe("computeAchievementProgress — category_completed", () => {
  const catRule = rule({
    metric: "category_completed",
    categoryId: 7,
    targetValue: 1, // хранимое значение игнорируется
    categoryLessonCount: 10,
  });

  it("цель берётся из живого числа уроков курса, а не из targetValue", () => {
    const out = computeAchievementProgress(
      catRule,
      ctx({ categoryId: 7, categoryCompletedLessons: 4 }),
      null,
    );
    expect(out).toEqual({ target: 10, progress: 4, willUnlock: false });
  });

  it("открывается, когда пройдены все уроки курса", () => {
    const out = computeAchievementProgress(
      catRule,
      ctx({ categoryId: 7, categoryCompletedLessons: 10 }),
      null,
    );
    expect(out).toEqual({ target: 10, progress: 10, willUnlock: true });
  });

  it("урок ЧУЖОГО курса ачивку не двигает", () => {
    expect(
      computeAchievementProgress(catRule, ctx({ categoryId: 999 }), null),
    ).toBeNull();
  });

  it("пустой курс (0 уроков) не выдаёт ачивку даром", () => {
    expect(
      computeAchievementProgress(
        { ...catRule, categoryLessonCount: 0 },
        ctx({ categoryId: 7, categoryCompletedLessons: 0 }),
        null,
      ),
    ).toBeNull();
  });

  it("ачивка без курса (курс удалён) не двигается", () => {
    expect(
      computeAchievementProgress(
        { ...catRule, categoryId: null, categoryLessonCount: null },
        ctx({ categoryId: 7 }),
        null,
      ),
    ).toBeNull();
  });

  it("добавленный наставником урок поднимает планку: ачивка снова не открыта", () => {
    // Было 10 уроков и все пройдены; наставник добавил 11-й.
    const out = computeAchievementProgress(
      { ...catRule, categoryLessonCount: 11 },
      ctx({ categoryId: 7, categoryCompletedLessons: 10 }),
      { progress: 10, isUnlocked: false },
    );
    expect(out).toEqual({ target: 11, progress: 10, willUnlock: false });
  });
});

describe("computeAchievementProgress — manual_award", () => {
  it("никогда не выдаётся автоматически после урока", () => {
    expect(
      computeAchievementProgress(
        rule({ metric: "manual_award", targetValue: 1 }),
        ctx({ completedLessons: 100, level: 100, perfectDelta: 1 }),
        null,
      ),
    ).toBeNull();
  });
});

describe("computeLessonRewards — XP и монеты нельзя фармить", () => {
  const lesson = { xpReward: 20, coinReward: 5 };

  it("первое прохождение начисляет XP и монеты", () => {
    const r = computeLessonRewards(lesson, { totalXp: 0, level: 1 }, false, calculateLevel);
    expect(r).toEqual({
      firstCompletion: true,
      gainedXp: 20,
      gainedCoins: 5,
      newTotalXp: 20,
      newLevel: 1,
      leveledUp: false,
    });
  });

  it("повторное прохождение не даёт ни XP, ни монет", () => {
    const r = computeLessonRewards(lesson, { totalXp: 200, level: 3 }, true, calculateLevel);
    expect(r.firstCompletion).toBe(false);
    expect(r.gainedXp).toBe(0);
    expect(r.gainedCoins).toBe(0);
    expect(r.newTotalXp).toBe(200); // опыт не изменился
    expect(r.leveledUp).toBe(false);
  });

  it("переход через сотню XP поднимает уровень", () => {
    const r = computeLessonRewards(
      { xpReward: 20, coinReward: 5 },
      { totalXp: 90, level: 1 },
      false,
      calculateLevel,
    );
    expect(r.newTotalXp).toBe(110);
    expect(r.newLevel).toBe(2);
    expect(r.leveledUp).toBe(true);
  });
});
