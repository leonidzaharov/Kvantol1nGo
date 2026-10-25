"use server";

import { prisma } from "@/lib/db";
import { canAccessLesson } from "@/lib/course-access";
import { recordClassroomAttempt } from "@/lib/classroom-progress";
import { isPracticeContent, parseLessonDocument } from "@/lib/lesson-document";
import { assertCoreSolved, recordPracticeResult } from "@/lib/lesson-progress";
import { lessonRevision, lockLessonContent } from "@/lib/lesson-revision";
import { gradePracticeVariant, PracticeAttemptInputSchema } from "@/lib/practice-content";
import type { PracticeCheckResult } from "@/lib/practice-types";
import { requireAdmin, requireUser } from "@/lib/server-guard";

export async function checkPracticeAnswer(input: unknown): Promise<PracticeCheckResult> {
  const userId = await requireUser();
  const parsed = PracticeAttemptInputSchema.safeParse(input);
  if (!parsed.success) return { kind: "invalid" };
  const attempt = parsed.data;
  if (!(await canAccessLesson(userId, attempt.lessonId))) throw new Error("FORBIDDEN");

  const checked = await prisma.$transaction(async (tx) => {
    await lockLessonContent(tx, attempt.lessonId);
    const lesson = await tx.lesson.findUnique({
      where: { id: attempt.lessonId }, select: { content: true },
    });
    if (!lesson || lessonRevision(lesson.content) !== attempt.revision) {
      return { result: { kind: "content-changed" } as PracticeCheckResult };
    }
    const content = parseLessonDocument(lesson.content);
    if (!content || !isPracticeContent(content)) return { result: { kind: "invalid" } as PracticeCheckResult };
    const items = attempt.section === "bonus" ? content.bonusQuestions : content.questions;
    const questionIndex = items.findIndex((item) => item.id === attempt.itemId);
    const variant = items[questionIndex]?.variants.find((item) => item.id === attempt.variantId);
    if (!variant) return { result: { kind: "invalid" } as PracticeCheckResult };
    const result = gradePracticeVariant(variant, attempt.answer);
    if (result.kind !== "checked") return { result };
    if (attempt.section === "core") {
      await recordPracticeResult(tx, userId, attempt.lessonId, questionIndex, content.questions.length, result.correct);
    } else {
      const progress = await tx.userLessonProgress.findUnique({
        where: { userId_lessonId: { userId, lessonId: attempt.lessonId } },
      });
      try {
        assertCoreSolved(progress, content.questions.length, true);
      } catch {
        return { result: { kind: "invalid" } as PracticeCheckResult };
      }
    }
    return {
      result,
      telemetry: {
        userId, lessonId: attempt.lessonId,
        phase: attempt.section === "bonus" ? "bonus" as const : "tasks" as const,
        questionIndex, totalQuestions: content.questions.length,
        bonusTotalQuestions: content.bonusQuestions.length,
        section: attempt.section, correct: result.correct,
      },
    };
  });
  if (checked.telemetry) {
    try {
      await recordClassroomAttempt(checked.telemetry);
    } catch {
      console.warn("Practice classroom telemetry unavailable");
    }
  }
  return checked.result;
}

/** The mentor uses the same grade without changing student progress or coins. */
export async function previewPracticeAnswer(input: unknown): Promise<PracticeCheckResult> {
  await requireAdmin();
  const parsed = PracticeAttemptInputSchema.safeParse(input);
  if (!parsed.success) return { kind: "invalid" };
  const attempt = parsed.data;
  const lesson = await prisma.lesson.findUnique({
    where: { id: attempt.lessonId }, select: { content: true },
  });
  if (!lesson || lessonRevision(lesson.content) !== attempt.revision) return { kind: "content-changed" };
  const content = parseLessonDocument(lesson.content);
  if (!content || !isPracticeContent(content)) return { kind: "invalid" };
  const items = attempt.section === "bonus" ? content.bonusQuestions : content.questions;
  const variant = items.find((item) => item.id === attempt.itemId)?.variants.find((item) => item.id === attempt.variantId);
  return variant ? gradePracticeVariant(variant, attempt.answer) : { kind: "invalid" };
}
