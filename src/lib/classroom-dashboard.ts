import "server-only";

import { prisma } from "@/lib/db";
import { classroomActiveCutoff } from "@/lib/classroom-session-logic";
import { mentorStudentName } from "@/lib/student-identity";
import { parseLessonContent } from "@/lib/lesson-content";
import type {
  ClassroomDashboardSnapshot,
  ClassroomStudentSnapshot,
  ProblemQuestionSnapshot,
} from "@/lib/classroom-dashboard-types";

export async function getClassroomDashboardSnapshot(
  sessionId: number,
): Promise<ClassroomDashboardSnapshot | null> {
  const now = new Date();
  await prisma.classSession.updateMany({
    where: {
      id: sessionId,
      activatedAt: { not: null, lte: classroomActiveCutoff(now) },
      endedAt: null,
    },
    data: { endedAt: now },
  });

  const session = await prisma.classSession.findFirst({
    where: {
      id: sessionId,
      activatedAt: { not: null },
      endedAt: null,
    },
    select: {
      id: true,
      activatedAt: true,
      endedAt: true,
      group: {
        select: {
          name: true,
          students: {
            where: { isAdmin: false },
            orderBy: { name: "asc" },
            select: { id: true, name: true, mentorLabel: true },
          },
        },
      },
      lesson: {
        select: {
          title: true,
          content: true,
          category: { select: { name: true } },
        },
      },
      students: true,
      questions: true,
    },
  });
  if (!session?.activatedAt) return null;

  const content = parseLessonContent(session.lesson.content);
  const progressByUser = new Map(
    session.students.map((row) => [row.userId, row]),
  );
  const questionByStudent = new Map(
    session.questions.map((row) => [
      `${row.userId}:${row.section}:${row.questionIndex}`,
      row,
    ]),
  );

  const students: ClassroomStudentSnapshot[] = session.group.students.map(
    (user) => {
      const progress = progressByUser.get(user.id);
      if (!progress) {
        return {
          id: user.id,
          name: mentorStudentName(user),
          status: "not_started",
          phase: null,
          currentQuestionIndex: null,
          answeredCount: 0,
          totalQuestions: content.questions.length,
          bonusAnsweredCount: 0,
          bonusTotalQuestions: content.bonusQuestions.length,
          wrongAttempts: 0,
          currentWrongAttempts: 0,
          needsHelp: false,
          lastActivityAt: null,
        };
      }

      const currentSection =
        progress.phase === "bonus" ? "bonus" : "core";
      const currentQuestion = questionByStudent.get(
        `${user.id}:${currentSection}:${progress.currentQuestionIndex}`,
      );
      const currentWrongAttempts = currentQuestion?.wrongAttempts ?? 0;
      // Три потерянные жизни считаются по всему уроку, а не только по одной
      // задаче: ученик мог ошибиться по разу на трёх разных шагах.
      const needsHelp = progress.wrongAttempts >= 3;
      const bonusCompleted =
        progress.bonusTotalQuestions > 0 &&
        progress.bonusAnsweredCount >= progress.bonusTotalQuestions;

      const status =
        bonusCompleted
          ? "bonus_completed"
          : progress.phase === "bonus"
            ? needsHelp
              ? "stuck"
              : "bonus"
            : progress.phase === "completed" || progress.completedAt
              ? "completed"
              : needsHelp
                ? "stuck"
                : "working";

      return {
        id: user.id,
        name: mentorStudentName(user),
        status,
        phase: progress.phase,
        currentQuestionIndex: progress.currentQuestionIndex,
        answeredCount: progress.answeredCount,
        totalQuestions: progress.totalQuestions,
        bonusAnsweredCount: progress.bonusAnsweredCount,
        bonusTotalQuestions: progress.bonusTotalQuestions,
        wrongAttempts: progress.wrongAttempts,
        currentWrongAttempts,
        needsHelp,
        lastActivityAt: progress.lastActivityAt.toISOString(),
      };
    },
  );

  const problemMap = new Map<string, ProblemQuestionSnapshot & { users: Set<string> }>();
  for (const row of session.questions) {
    if (row.wrongAttempts === 0) continue;
    const key = `${row.section}:${row.questionIndex}`;
    const questions =
      row.section === "bonus"
        ? content.bonusQuestions
        : content.questions;
    const existing = problemMap.get(key) ?? {
      section: row.section,
      questionIndex: row.questionIndex,
      prompt: questions[row.questionIndex]?.prompt ?? "Задание удалено",
      wrongAttempts: 0,
      studentCount: 0,
      users: new Set<string>(),
    };
    existing.wrongAttempts += row.wrongAttempts;
    existing.users.add(row.userId);
    existing.studentCount = existing.users.size;
    problemMap.set(key, existing);
  }
  const problemQuestions = [...problemMap.values()]
    .sort(
      (a, b) =>
        b.wrongAttempts - a.wrongAttempts ||
        a.questionIndex - b.questionIndex,
    )
    .slice(0, 5)
    .map((item) => ({
      section: item.section,
      questionIndex: item.questionIndex,
      prompt: item.prompt,
      wrongAttempts: item.wrongAttempts,
      studentCount: item.studentCount,
    }));

  return {
    generatedAt: new Date().toISOString(),
    session: {
      id: session.id,
      groupName: session.group.name,
      lessonTitle: session.lesson.title,
      courseName: session.lesson.category.name,
      startedAt: session.activatedAt.toISOString(),
      endedAt: session.endedAt?.toISOString() ?? null,
    },
    summary: {
      notStarted: students.filter((item) => item.status === "not_started")
        .length,
      working: students.filter(
        (item) => item.status === "working" || item.status === "bonus",
      ).length,
      stuck: students.filter((item) => item.status === "stuck").length,
      completed: students.filter(
        (item) =>
          item.status === "completed" || item.status === "bonus_completed",
      ).length,
    },
    students,
    problemQuestions,
  };
}
