import "server-only";

import { prisma } from "@/lib/db";
import { recordClassroomAttempt } from "@/lib/classroom-progress";
import type { LessonQuestion } from "@/lib/lesson-content";
import { isPracticeContent, parseLessonDocument } from "@/lib/lesson-document";
import { lockLessonContent } from "@/lib/lesson-revision";
import { lockLessonProgress, markCoreQuestionSolved } from "@/lib/lesson-progress";

/** Shared persistence retains classic grading and serializes format changes. */
export async function checkClassicLessonAttempt(
  userId: string,
  lessonId: number,
  questionIndex: number,
  section: "core" | "bonus",
  grade: (question: LessonQuestion) => boolean | null,
): Promise<boolean> {
  const checked = await prisma.$transaction(async (tx) => {
    await lockLessonContent(tx, lessonId);
    const lesson = await tx.lesson.findUnique({ where: { id: lessonId }, select: { content: true } });
    if (!lesson) return null;
    const content = parseLessonDocument(lesson.content);
    if (!content || isPracticeContent(content)) return null;
    const question = (section === "bonus" ? content.bonusQuestions : content.questions)[questionIndex];
    if (!question) return null;
    const correct = grade(question);
    if (correct === null) return null;
    if (section === "core") {
      if (correct) {
        await markCoreQuestionSolved(userId, lessonId, questionIndex, content.questions.length, tx);
      } else {
        await lockLessonProgress(tx, userId, lessonId);
        await tx.userLessonProgress.upsert({
          where: { userId_lessonId: { userId, lessonId } },
          create: { userId, lessonId, totalQuestions: content.questions.length, wrongAttempts: 1 },
          update: { wrongAttempts: { increment: 1 } },
        });
      }
    }
    return { correct, totalQuestions: content.questions.length, bonusTotalQuestions: content.bonusQuestions.length };
  });
  if (!checked) return false;
  await recordClassroomAttempt({
    userId, lessonId, phase: section === "bonus" ? "bonus" : "tasks", questionIndex,
    totalQuestions: checked.totalQuestions, bonusTotalQuestions: checked.bonusTotalQuestions,
    section, correct: checked.correct,
  });
  return checked.correct;
}
