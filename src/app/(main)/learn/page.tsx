import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { ACTIVE_COURSE_COOKIE } from "@/lib/active-course";
import {
  categoryIsAccessible,
  getLearningContext,
} from "@/lib/course-access";
import { FeedWrapper } from "@/components/feed-wrapper";
import { StickyWrapper } from "@/components/sticky-wrapper";
import { UserProgress } from "@/components/user-progress";

import { AnimatedBackground } from "./animated-background";
import { Header } from "./header";
import { UnitBanner } from "./unit-banner";
import { LessonButton } from "./lesson-button";

// Сердца пока заглушка — поля в схеме нет (появится на Шаге C: миграция).
const PLACEHOLDER_HEARTS = 5;

export default async function LearnPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/");
  }
  const userId = session.user.id;
  const context = await getLearningContext(userId);
  if (!context) {
    redirect("/api/orphan-signout");
  }

  // Активный курс — из cookie. Нет/битый → на экран выбора.
  const cookieStore = await cookies();
  const activeRaw = cookieStore.get(ACTIVE_COURSE_COOKIE)?.value;
  const activeCourseId = activeRaw ? Number(activeRaw) : NaN;
  if (!Number.isInteger(activeCourseId)) {
    redirect("/courses");
  }

  const [user, category] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, totalXp: true, currency: true },
    }),
    prisma.category.findUnique({
      where: { id: activeCourseId },
      select: {
        id: true,
        name: true,
        icon: true,
        track: true,
        isPublished: true,
        groupAccess: { select: { groupId: true } },
        lessons: {
          where: context.isAdmin
            ? undefined
            : {
                isPublished: true,
                OR: [
                  { groupRestrictions: { none: {} } },
                  {
                    groupRestrictions: {
                      some: { groupId: context.groupId ?? -1 },
                    },
                  },
                ],
              },
          orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
          select: {
            id: true,
            title: true,
            // прогресс именно этого пользователя по уроку (0..1 строк)
            progress: {
              where: { userId },
              select: {
                isCompleted: true,
                answeredCount: true,
                totalQuestions: true,
              },
            },
          },
        },
      },
    }),
  ]);

  if (!user) {
    redirect("/api/orphan-signout");
  }
  if (!category) {
    // cookie указывает на удалённую категорию — сбросим выбор.
    redirect("/courses");
  }
  // Курс чужого направления (сменили группу, старый cookie) — к выбору.
  if (
    !categoryIsAccessible(context, {
      isPublished: category.isPublished,
      track: category.track,
      groupIds: category.groupAccess.map((item) => item.groupId),
    })
  ) {
    redirect("/courses");
  }

  const lessons = category.lessons.map((lesson) => {
    const p = lesson.progress[0] ?? null;
    return {
      id: lesson.id,
      title: lesson.title,
      completed: p?.isCompleted ?? false,
      percentage:
        p && p.totalQuestions > 0
          ? Math.round((p.answeredCount / p.totalQuestions) * 100)
          : 0,
    };
  });

  // Текущий урок — первый незавершённый; всё до него считается пройденным,
  // всё после — заблокированным (классическая змейка Duolingo).
  const activeLessonId = lessons.find((l) => !l.completed)?.id ?? null;
  const activeLesson = lessons.find((l) => l.id === activeLessonId) ?? null;
  const activeLessonPercentage = activeLesson?.percentage ?? 0;

  return (
    <div className="flex flex-row-reverse gap-[48px] px-6">
      <AnimatedBackground />
      <StickyWrapper>
        <UserProgress
          courseTitle={category.name}
          courseIcon={category.icon}
          points={user.totalXp}
          coins={user.currency}
          hearts={PLACEHOLDER_HEARTS}
        />
      </StickyWrapper>

      <FeedWrapper>
        <Header title={category.name} />
        <UnitBanner
          title={category.name}
          description="Учись шаг за шагом"
          continueLessonId={activeLessonId}
        />

        <div className="relative flex flex-col items-center">
          {lessons.map((lesson, i) => {
            const isCurrent = lesson.id === activeLessonId;
            return (
              <LessonButton
                key={lesson.id}
                id={lesson.id}
                index={i}
                totalCount={lessons.length - 1}
                current={isCurrent}
                locked={false}
                percentage={activeLessonPercentage}
              />
            );
          })}
        </div>
      </FeedWrapper>
    </div>
  );
}
