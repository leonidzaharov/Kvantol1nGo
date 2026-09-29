// ============================================================
// Серверная фиксация решённых заданий урока.
//
// answeredCore — список индексов основных заданий, которые СЕРВЕР
// подтвердил верными (в checkAnswer/checkTextAnswer — после сравнения
// с эталоном, в recordCodeAttempt — по итогу запуска кода в браузере).
// completeLesson сверяет покрытие по этому списку, поэтому вызвать
// «завершить урок» напрямую без решений не выйдет.
//
// Ограничение: для заданий с кодом клиент сообщает результат запуска
// сам — ожидаемый вывод и так виден ученику после двух ошибок, поэтому
// скрытого ответа здесь нет. Выбор варианта и свободный текст
// подделать нельзя: эталон в браузер не отдаётся.
// ============================================================

import { prisma } from "@/lib/db";

/**
 * Отмечает задание основной части как решённое (идемпотентно).
 * answeredCount — «следующий нерешённый индекс» для возврата в урок:
 * держим его не меньше числа подтверждённых заданий и не меньше
 * значения, записанного до появления answeredCore.
 */
export async function markCoreQuestionSolved(
  userId: string,
  lessonId: number,
  questionIndex: number,
  totalQuestions: number,
): Promise<void> {
  if (questionIndex < 0 || questionIndex >= totalQuestions) return;

  await prisma.$transaction(async (tx) => {
    // Серийный доступ к строке прогресса пары ученик+урок: два
    // одновременных верных ответа не потеряют индексы друг друга.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${userId}:${lessonId}`}))`;

    const existing = await tx.userLessonProgress.findUnique({
      where: { userId_lessonId: { userId, lessonId } },
      select: { isCompleted: true, answeredCore: true, answeredCount: true },
    });
    if (existing?.isCompleted) return;
    if (existing?.answeredCore.includes(questionIndex)) return;

    const answeredCore = [...(existing?.answeredCore ?? []), questionIndex].sort(
      (a, b) => a - b,
    );
    const answeredCount = Math.max(
      existing?.answeredCount ?? 0,
      answeredCore.length,
    );

    await tx.userLessonProgress.upsert({
      where: { userId_lessonId: { userId, lessonId } },
      create: {
        userId,
        lessonId,
        totalQuestions,
        answeredCore,
        answeredCount,
      },
      update: { answeredCore, answeredCount, totalQuestions },
    });
  });
}

/**
 * Проверяет, что ученик подтвердил на сервере ВСЕ задания основной части.
 * Прогресс, записанный до колонки answeredCore, считаем покрытым по
 * answeredCount: задания идут по порядку, индексы 0..answeredCount-1
 * решены. Выбрасывает Error("LESSON_INCOMPLETE") — экшен завершения
 * отклоняется, награды не начисляются.
 */
export function assertCoreSolved(
  progress:
    | { answeredCore: number[]; answeredCount: number }
    | null
    | undefined,
  totalQuestions: number,
): void {
  if (totalQuestions === 0) return;
  const covered = new Set(progress?.answeredCore ?? []);
  for (let i = 0; i < (progress?.answeredCount ?? 0); i += 1) covered.add(i);
  for (let i = 0; i < totalQuestions; i += 1) {
    if (!covered.has(i)) throw new Error("LESSON_INCOMPLETE");
  }
}
