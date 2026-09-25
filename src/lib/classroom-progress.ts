import "server-only";

import type {
  ClassSessionPhase,
  LessonTaskSection,
  Prisma,
} from "@/generated/prisma";
import {
  classroomActiveCutoff,
  classroomCaptureCutoff,
} from "@/lib/classroom-session-logic";
import { prisma } from "@/lib/db";

type PositionInput = {
  userId: string;
  lessonId: number;
  phase: ClassSessionPhase;
  questionIndex: number;
  totalQuestions: number;
  bonusTotalQuestions: number;
};

type AttemptInput = PositionInput & {
  section: LessonTaskSection;
  correct: boolean;
};

/**
 * Все операции создания/активации сессии одной группы берут блокировку строки
 * Group. Это не даёт параллельному heartbeat ученика создать отдельный буфер
 * ровно в момент, когда наставник нажимает «Начать занятие».
 */
export async function lockClassroomGroup(
  tx: Prisma.TransactionClient,
  groupId: number,
): Promise<void> {
  await tx.$queryRaw<{ lock: string }[]>`
    SELECT CAST(
      pg_advisory_xact_lock(
        31072026,
        CAST(${groupId} AS integer)
      )
      AS text
    ) AS "lock"
  `;
}

export async function closeExpiredClassroomCaptures(
  tx: Prisma.TransactionClient,
  groupId: number,
  now: Date,
): Promise<void> {
  await tx.classSession.updateMany({
    where: {
      groupId,
      activatedAt: null,
      endedAt: null,
      startedAt: { lt: classroomCaptureCutoff(now) },
    },
    data: { endedAt: now },
  });
}

export async function closeExpiredActiveClassSessions(
  tx: Prisma.TransactionClient,
  groupId: number,
  now: Date,
): Promise<void> {
  await tx.classSession.updateMany({
    where: {
      groupId,
      activatedAt: { not: null, lte: classroomActiveCutoff(now) },
      endedAt: null,
    },
    data: { endedAt: now },
  });
}

/**
 * Возвращает активированную сессию либо создаёт скрытый предзапуск. Предзапуск
 * хранит только сессионные счётчики и станет видимым, когда наставник запустит
 * этот же урок для группы.
 */
async function findOrCreateWritableSession(
  tx: Prisma.TransactionClient,
  userId: string,
  lessonId: number,
  now: Date,
): Promise<{ id: number } | null> {
  const user = await tx.user.findUnique({
    where: { id: userId },
    select: { groupId: true, isAdmin: true },
  });
  if (!user?.groupId || user.isAdmin) return null;
  await lockClassroomGroup(tx, user.groupId);
  await closeExpiredActiveClassSessions(tx, user.groupId, now);

  const active = await tx.classSession.findFirst({
    where: {
      groupId: user.groupId,
      lessonId,
      activatedAt: { not: null },
      endedAt: null,
    },
    orderBy: { activatedAt: "desc" },
    select: { id: true },
  });
  if (active) return active;

  await closeExpiredClassroomCaptures(tx, user.groupId, now);
  const pending = await tx.classSession.findFirst({
    where: {
      groupId: user.groupId,
      lessonId,
      activatedAt: null,
      endedAt: null,
    },
    orderBy: { startedAt: "desc" },
    select: { id: true },
  });
  if (pending) return pending;

  return tx.classSession.create({
    data: {
      groupId: user.groupId,
      lessonId,
      activatedAt: null,
    },
    select: { id: true },
  });
}

/** Обновляет текущую позицию и при необходимости открывает скрытый предзапуск. */
export async function recordClassroomPosition({
  userId,
  lessonId,
  phase,
  questionIndex,
  totalQuestions,
  bonusTotalQuestions,
}: PositionInput): Promise<void> {
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const session = await findOrCreateWritableSession(
      tx,
      userId,
      lessonId,
      now,
    );
    if (!session) return;

    await tx.sessionStudentProgress.upsert({
      where: {
        sessionId_userId: { sessionId: session.id, userId },
      },
      create: {
        sessionId: session.id,
        userId,
        phase,
        currentQuestionIndex: questionIndex,
        totalQuestions,
        bonusTotalQuestions,
        lastActivityAt: now,
      },
      update: {
        phase,
        currentQuestionIndex: questionIndex,
        totalQuestions,
        bonusTotalQuestions,
        lastActivityAt: now,
      },
    });
  });
}

/**
 * Фиксирует результат одной проверки. Сохраняются только счётчики и номер
 * задачи — ответ ученика и его исходный код в аналитику не попадают.
 */
export async function recordClassroomAttempt({
  userId,
  lessonId,
  phase,
  questionIndex,
  totalQuestions,
  bonusTotalQuestions,
  section,
  correct,
}: AttemptInput): Promise<void> {
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const session = await findOrCreateWritableSession(
      tx,
      userId,
      lessonId,
      now,
    );
    if (!session) return;

    const key = {
      sessionId: session.id,
      userId,
      section,
      questionIndex,
    };
    const previous = await tx.sessionQuestionProgress.findUnique({
      where: { sessionId_userId_section_questionIndex: key },
      select: { isSolved: true },
    });
    const countWrong = !correct && !previous?.isSolved;

    await tx.sessionQuestionProgress.upsert({
      where: { sessionId_userId_section_questionIndex: key },
      create: {
        ...key,
        wrongAttempts: countWrong ? 1 : 0,
        isSolved: correct,
      },
      update: correct
        ? { isSolved: true }
        : countWrong
          ? { wrongAttempts: { increment: 1 } }
          : {},
    });

    const solvedCount = await tx.sessionQuestionProgress.count({
      where: {
        sessionId: session.id,
        userId,
        section,
        isSolved: true,
      },
    });
    const coreCompleted =
      section === "core" &&
      totalQuestions > 0 &&
      solvedCount >= totalQuestions;

    await tx.sessionStudentProgress.upsert({
      where: {
        sessionId_userId: { sessionId: session.id, userId },
      },
      create: {
        sessionId: session.id,
        userId,
        phase: coreCompleted ? "completed" : phase,
        currentQuestionIndex: questionIndex,
        answeredCount: section === "core" ? solvedCount : 0,
        totalQuestions,
        bonusAnsweredCount: section === "bonus" ? solvedCount : 0,
        bonusTotalQuestions,
        wrongAttempts: countWrong ? 1 : 0,
        lastActivityAt: now,
        completedAt: coreCompleted ? now : null,
      },
      update: {
        phase: coreCompleted ? "completed" : phase,
        currentQuestionIndex: questionIndex,
        ...(section === "core"
          ? { answeredCount: solvedCount }
          : { bonusAnsweredCount: solvedCount }),
        totalQuestions,
        bonusTotalQuestions,
        ...(countWrong
          ? { wrongAttempts: { increment: 1 } }
          : {}),
        lastActivityAt: now,
        ...(coreCompleted ? { completedAt: now } : {}),
      },
    });
  });
}

/** Нужен для уроков без обязательных задач и как финальная страховка. */
export async function markClassroomLessonCompleted({
  userId,
  lessonId,
  totalQuestions,
  bonusTotalQuestions,
}: Omit<PositionInput, "phase" | "questionIndex">): Promise<void> {
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const session = await findOrCreateWritableSession(
      tx,
      userId,
      lessonId,
      now,
    );
    if (!session) return;

    await tx.sessionStudentProgress.upsert({
      where: {
        sessionId_userId: { sessionId: session.id, userId },
      },
      create: {
        sessionId: session.id,
        userId,
        phase: "completed",
        currentQuestionIndex: Math.max(0, totalQuestions - 1),
        answeredCount: totalQuestions,
        totalQuestions,
        bonusTotalQuestions,
        lastActivityAt: now,
        completedAt: now,
      },
      update: {
        phase: "completed",
        currentQuestionIndex: Math.max(0, totalQuestions - 1),
        answeredCount: totalQuestions,
        totalQuestions,
        bonusTotalQuestions,
        lastActivityAt: now,
        completedAt: now,
      },
    });
  });
}
