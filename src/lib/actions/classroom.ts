"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { recordAdminAudit } from "@/lib/admin-audit";
import { prisma } from "@/lib/db";
import { canAccessLesson } from "@/lib/course-access";
import {
  closeExpiredClassroomCaptures,
  lockClassroomGroup,
  recordClassroomAttempt,
  recordClassroomPosition,
} from "@/lib/classroom-progress";
import { parseLessonContent } from "@/lib/lesson-content";
import {
  IdSchema,
  parse,
  requireAdmin,
  requireUser,
} from "@/lib/server-guard";

const PhaseSchema = z.enum(["theory", "tasks", "bonus"]);
const SectionSchema = z.enum(["core", "bonus"]);
const QuestionIndexSchema = z.number().int().min(0).max(49);

export async function startClassSession(formData: FormData): Promise<void> {
  const actorId = await requireAdmin();
  const groupId = parse(
    z.coerce.number().pipe(IdSchema),
    formData.get("groupId"),
  );
  const lessonId = parse(
    z.coerce.number().pipe(IdSchema),
    formData.get("lessonId"),
  );

  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: {
      title: true,
      isPublished: true,
      groupRestrictions: { select: { groupId: true } },
      category: {
        select: {
          isPublished: true,
          groupAccess: { select: { groupId: true } },
        },
      },
    },
  });
  if (!lesson?.isPublished || !lesson.category.isPublished) {
    throw new Error("Сначала опубликуйте курс и урок");
  }
  const courseGroups = new Set(
    lesson.category.groupAccess.map((item) => item.groupId),
  );
  const restrictedGroups = new Set(
    lesson.groupRestrictions.map((item) => item.groupId),
  );
  if (
    !courseGroups.has(groupId) ||
    (restrictedGroups.size > 0 && !restrictedGroups.has(groupId))
  ) {
    throw new Error("Урок не назначен выбранной группе");
  }

  const now = new Date();
  const session = await prisma.$transaction(async (tx) => {
    await lockClassroomGroup(tx, groupId);

    await closeExpiredClassroomCaptures(tx, groupId, now);
    const pending = await tx.classSession.findFirst({
      where: {
        groupId,
        lessonId,
        activatedAt: null,
        endedAt: null,
      },
      orderBy: { startedAt: "desc" },
      select: { id: true },
    });

    await tx.classSession.updateMany({
      where: {
        groupId,
        endedAt: null,
        ...(pending ? { id: { not: pending.id } } : {}),
      },
      data: { endedAt: now },
    });

    const activeSession = pending
      ? await tx.classSession.update({
          where: { id: pending.id },
          data: { activatedAt: now },
          select: { id: true },
        })
      : await tx.classSession.create({
          data: { groupId, lessonId, activatedAt: now },
          select: { id: true },
        });
    await recordAdminAudit(tx, {
      actorId,
      action: "session_started",
      entityType: "class_session",
      entityId: activeSession.id,
      entityLabel: lesson.title,
    });
    return activeSession;
  });

  redirect(`/admin/activity?sessionId=${session.id}`);
}

export async function endClassSession(formData: FormData): Promise<void> {
  const actorId = await requireAdmin();
  const sessionId = parse(
    z.coerce.number().pipe(IdSchema),
    formData.get("sessionId"),
  );
  await prisma.$transaction(async (tx) => {
    const session = await tx.classSession.findUnique({
      where: { id: sessionId },
      select: { lesson: { select: { title: true } } },
    });
    const changed = await tx.classSession.updateMany({
      where: {
        id: sessionId,
        activatedAt: { not: null },
        endedAt: null,
      },
      data: { endedAt: new Date() },
    });
    if (session && changed.count === 1) {
      await recordAdminAudit(tx, {
        actorId,
        action: "session_ended",
        entityType: "class_session",
        entityId: sessionId,
        entityLabel: session.lesson.title,
      });
    }
  });
  redirect("/admin/activity");
}

/** Heartbeat позиции ученика. До запуска дашборда пишет в скрытый предзапуск. */
export async function reportLessonPosition(
  lessonId: number,
  phase: "theory" | "tasks" | "bonus",
  questionIndex: number,
): Promise<void> {
  const userId = await requireUser();
  lessonId = parse(IdSchema, lessonId);
  phase = parse(PhaseSchema, phase);
  questionIndex = parse(QuestionIndexSchema, questionIndex);
  if (!(await canAccessLesson(userId, lessonId))) return;

  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: { content: true },
  });
  if (!lesson) return;
  const content = parseLessonContent(lesson.content);

  await recordClassroomPosition({
    userId,
    lessonId,
    phase,
    questionIndex,
    totalQuestions: content.questions.length,
    bonusTotalQuestions: content.bonusQuestions.length,
  });
}

/** Телеметрия проверки кодового задания, которое выполняется в браузере. */
export async function recordCodeAttempt(
  lessonId: number,
  section: "core" | "bonus",
  questionIndex: number,
  correct: boolean,
): Promise<void> {
  const userId = await requireUser();
  lessonId = parse(IdSchema, lessonId);
  section = parse(SectionSchema, section);
  questionIndex = parse(QuestionIndexSchema, questionIndex);
  correct = parse(z.boolean(), correct);
  if (!(await canAccessLesson(userId, lessonId))) return;

  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: { content: true },
  });
  if (!lesson) return;
  const content = parseLessonContent(lesson.content);
  const questions =
    section === "bonus" ? content.bonusQuestions : content.questions;
  if (questions[questionIndex]?.type !== "code") return;

  await Promise.all([
    recordClassroomAttempt({
      userId,
      lessonId,
      phase: section === "bonus" ? "bonus" : "tasks",
      questionIndex,
      totalQuestions: content.questions.length,
      bonusTotalQuestions: content.bonusQuestions.length,
      section,
      correct,
    }),
    ...(!correct && section === "core"
      ? [
          prisma.userLessonProgress.upsert({
            where: { userId_lessonId: { userId, lessonId } },
            create: {
              userId,
              lessonId,
              totalQuestions: content.questions.length,
              wrongAttempts: 1,
            },
            update: { wrongAttempts: { increment: 1 } },
          }),
        ]
      : []),
  ]);
}
