"use server";
import { lockStudentBalance } from "@/lib/student-balance-lock";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { isPracticeContent, parseLessonDocument } from "@/lib/lesson-document";
import { lessonRevision, lockLessonContent } from "@/lib/lesson-revision";
import {
  assertCoreSolved,
  lockLessonProgress,
} from "@/lib/lesson-progress";
import { splitTheoryIntoSections } from "@/lib/theory-sections";
import {
  advanceAchievements,
  type UnlockedAchievement,
} from "@/lib/achievements";
import { computeLessonRewards } from "@/lib/achievements-logic";
import { IdSchema, parse, requireUser } from "@/lib/server-guard";
import { calculateLevel } from "@/lib/gamification-logic";
import { canAccessLesson } from "@/lib/course-access";
import { textAnswersMatch } from "@/lib/text-answer";
import { checkClassicLessonAttempt } from "@/lib/classic-lesson-attempt";
import {
  markClassroomLessonCompleted,
} from "@/lib/classroom-progress";

export type CompleteLessonResult = {
  gainedXp: number;
  /** Монет начислено этим прохождением (0 при повторе). Тратятся офлайн. */
  gainedCoins: number;
  totalXp: number;
  level: number;
  leveledUp: boolean;
  lastActiveDate: Date;
  /** true, если урок засчитан впервые (XP начислен), false — повтор. */
  firstCompletion: boolean;
  /** Достижения, разблокированные ИМЕННО этим завершением (для тоста). */
  unlockedAchievements: UnlockedAchievement[];
};

export async function completeLesson(
  lessonId: number,
  revision?: string,
): Promise<CompleteLessonResult> {
  const userId = await requireUser();
  lessonId = parse(IdSchema, lessonId);
  if (!(await canAccessLesson(userId, lessonId))) {
    throw new Error("FORBIDDEN");
  }

  const now = new Date();
  const { user, updated, rewards, perfect, lesson, parsedContent, totalQuestions } = await prisma.$transaction(async (tx) => {
    await lockLessonContent(tx, lessonId);
    const lesson = await tx.lesson.findUnique({
      where: { id: lessonId },
      include: { category: { select: { id: true, name: true } } },
    });
    if (!lesson) throw new Error(`Урок ${lessonId} не найден`);
    const parsedContent = parseLessonDocument(lesson.content);
    if (!parsedContent) throw new Error("INVALID_LESSON_CONTENT");
    const practice = isPracticeContent(parsedContent);
    if (practice && lessonRevision(lesson.content) !== revision) throw new Error("CONTENT_CHANGED");
    const totalQuestions = parsedContent.questions.length;
    // The same student lock is used by payouts: parallel completions cannot farm coins.
    await lockStudentBalance(tx, userId);
    await lockLessonProgress(tx, userId, lessonId);
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    const progress = await tx.userLessonProgress.findUnique({ where: { userId_lessonId: { userId, lessonId } } });
    // Завершить можно только урок, где ВСЕ основные задания подтверждены
    // сервером (answeredCore) — прямой вызов completeLesson без ответов
    // наград не даёт. Для уже пройденного урока повторный вызов безопасен:
    // награды зависят от firstCompletion и не задвоятся.
    if (!progress?.isCompleted) {
      assertCoreSolved(progress, totalQuestions, practice);
    }
    // «Перфект» считает сервер по записанным ошибкам — клиентский флаг
    // больше не принимаем (нельзя подделать безупречное прохождение).
    const perfect = totalQuestions > 0 && (progress?.wrongAttempts ?? 0) === 0;
    const rewards = computeLessonRewards(lesson, user, progress?.isCompleted ?? false, calculateLevel);
    await tx.userLessonProgress.upsert({
      where: { userId_lessonId: { userId, lessonId } },
      create: { userId, lessonId, answeredCount: totalQuestions, totalQuestions, isCompleted: true, completedAt: now },
      update: { answeredCount: totalQuestions, totalQuestions, isCompleted: true, ...(rewards.firstCompletion ? { completedAt: now } : {}) },
    });
    const updated = await tx.user.update({ where: { id: userId }, data: { totalXp: rewards.newTotalXp, level: rewards.newLevel, currency: { increment: rewards.gainedCoins }, lastActiveDate: now } });
    return { user, updated, rewards, perfect, lesson, parsedContent, totalQuestions };
  });
  const { firstCompletion, gainedXp, gainedCoins, leveledUp } = rewards;
  // Метрики считаем прямо после транзакции — счётчики уже учитывают только
  // что завершённый урок. На повторных прохождениях значения не изменятся —
  // set-логика движка (max) не уронит накопленный прогресс.
  const [completedLessons, categoryCompletedLessons] = await Promise.all([
    prisma.userLessonProgress.count({
      where: { userId, isCompleted: true },
    }),
    prisma.userLessonProgress.count({
      where: {
        userId,
        isCompleted: true,
        lesson: {
          categoryId: lesson.category.id,
          isPublished: true,
          OR: [
            { groupRestrictions: { none: {} } },
            {
              groupRestrictions: {
                some: { groupId: user.groupId ?? -1 },
              },
            },
          ],
        },
      },
    }),
  ]);

  const unlockedAchievements = await advanceAchievements(userId, {
    completedLessons,
    level: updated.level,
    categoryId: lesson.category.id,
    categoryCompletedLessons,
    // Перфект засчитываем только при первом прохождении — иначе фарм
    // «пересдачами» уже выученного урока.
    perfectDelta: firstCompletion && perfect ? 1 : 0,
  });

  await markClassroomLessonCompleted({
    userId,
    lessonId,
    totalQuestions,
    bonusTotalQuestions: parsedContent.bonusQuestions.length,
  });

  revalidatePath("/learn");
  revalidatePath(`/lesson/${lessonId}`);

  return {
    gainedXp,
    gainedCoins,
    totalXp: updated.totalXp,
    level: updated.level,
    leveledUp,
    lastActiveDate: updated.lastActiveDate ?? now,
    firstCompletion,
    unlockedAchievements,
  };
}

/**
 * Проверяет ответ на вопрос с вариантами. Правильный индекс живёт ТОЛЬКО
 * здесь, на сервере: в браузер уходит контент без ответов (см.
 * sanitizeLessonContent), поэтому подсмотреть их через F12 больше нельзя.
 */
export async function checkAnswer(
  lessonId: number,
  questionIndex: number,
  optionIndex: number,
  section: "core" | "bonus" = "core",
): Promise<boolean> {
  const userId = await requireUser();
  lessonId = parse(IdSchema, lessonId);
  if (!(await canAccessLesson(userId, lessonId))) return false;
  questionIndex = parse(z.number().int().min(0).max(49), questionIndex);
  optionIndex = parse(z.number().int().min(0).max(7), optionIndex);
  section = parse(z.enum(["core", "bonus"]), section);

  return checkClassicLessonAttempt(userId, lessonId, questionIndex, section, (question) => {
    if (question.type === "code" || question.type === "text") return null;
    return question.correctIndex === optionIndex;
  });
}

/**
 * Проверяет свободный текст на сервере. Эталон не отправляется в браузер,
 * а нормализация намеренно не используется для заданий с кодом.
 */
export async function checkTextAnswer(
  lessonId: number,
  questionIndex: number,
  answer: string,
  section: "core" | "bonus" = "core",
): Promise<boolean> {
  const userId = await requireUser();
  lessonId = parse(IdSchema, lessonId);
  if (!(await canAccessLesson(userId, lessonId))) return false;
  questionIndex = parse(z.number().int().min(0).max(49), questionIndex);
  answer = parse(z.string().max(1000), answer);
  section = parse(z.enum(["core", "bonus"]), section);

  return checkClassicLessonAttempt(userId, lessonId, questionIndex, section, (question) =>
    question.type === "text" ? textAnswersMatch(answer, question.correctAnswer) : null,
  );
}

/**
 * Сохраняет шаг теории незавершённого урока — по нему ученик возвращается
 * на место остановки. step зажимается в границы реального контента, поэтому
 * клиент может навредить только своей позиции (и то только откатом назад).
 */
export async function saveTheoryStep(
  lessonId: number,
  step: number,
): Promise<void> {
  const userId = await requireUser();
  lessonId = parse(IdSchema, lessonId);
  step = parse(z.number().int().min(0).max(200), step);
  if (!(await canAccessLesson(userId, lessonId))) return;

  await prisma.$transaction(async (tx) => {
    await lockLessonContent(tx, lessonId);
    const lesson = await tx.lesson.findUnique({ where: { id: lessonId }, select: { content: true } });
    if (!lesson) return;
    const content = parseLessonDocument(lesson.content);
    if (!content) return;
    const clamped = Math.min(step, splitTheoryIntoSections(content.theory).length);
    await lockLessonProgress(tx, userId, lessonId);
    const existing = await tx.userLessonProgress.findUnique({
      where: { userId_lessonId: { userId, lessonId } }, select: { isCompleted: true },
    });
    if (existing?.isCompleted) return;
    await tx.userLessonProgress.upsert({
      where: { userId_lessonId: { userId, lessonId } },
      create: { userId, lessonId, theoryStep: clamped, totalQuestions: content.questions.length },
      update: { theoryStep: clamped },
    });
  });
}
