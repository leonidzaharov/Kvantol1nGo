import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { canAccessLesson } from "@/lib/course-access";
import { prisma } from "@/lib/db";
import {
  parseLessonContent,
  sanitizeLessonContent,
} from "@/lib/lesson-content";
import { computeLessonResume } from "@/lib/lesson-resume";
import { splitTheoryIntoSections } from "@/lib/theory-sections";

import { QuestRunner } from "./QuestRunner";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function LessonPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  const userId = session.user.id;

  const { id } = await params;
  const lessonId = Number.parseInt(id, 10);
  if (!Number.isFinite(lessonId) || lessonId <= 0) notFound();

  const [lesson, allowed] = await Promise.all([
    prisma.lesson.findUnique({
      where: { id: lessonId },
      select: { id: true, title: true, content: true },
    }),
    canAccessLesson(userId, lessonId),
  ]);
  if (!lesson || !allowed) notFound();

  const parsed = parseLessonContent(lesson.content);
  const progress = await prisma.userLessonProgress.upsert({
    where: { userId_lessonId: { userId, lessonId } },
    create: { userId, lessonId, totalQuestions: parsed.questions.length },
    update: { totalQuestions: parsed.questions.length },
  });

  // Восстанавливаем место остановки незавершённого урока. Если контент
  // поменялся (наставник отредактировал), индексы зажаты в новые границы.
  const resume = computeLessonResume({
    isCompleted: progress.isCompleted,
    theoryStep: progress.theoryStep,
    answeredCount: progress.answeredCount,
    wrongAttempts: progress.wrongAttempts,
    theoryTotal: splitTheoryIntoSections(parsed.theory).length,
    coreTotal: parsed.questions.length,
  });

  return (
    <QuestRunner
      lessonId={lesson.id}
      title={lesson.title}
      content={sanitizeLessonContent(parsed)}
      alreadyCompleted={progress.isCompleted}
      resume={resume}
      draftUserId={userId}
    />
  );
}
