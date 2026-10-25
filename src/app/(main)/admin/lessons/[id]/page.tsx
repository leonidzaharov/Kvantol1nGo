import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/db";
import { isPracticeContent, parseLessonDocument } from "@/lib/lesson-document";
import { requireAdminOr404 } from "@/lib/server-guard";

import { LessonGroupAccessForm } from "../../group-access-form";
import { LessonForm } from "../lesson-form";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditLessonPage({ params }: PageProps) {
  await requireAdminOr404();
  const { id } = await params;
  const lessonId = Number.parseInt(id, 10);
  if (!Number.isFinite(lessonId) || lessonId <= 0) notFound();

  const [lesson, categories] = await Promise.all([
    prisma.lesson.findUnique({
      where: { id: lessonId },
      include: {
        _count: { select: { progress: true } },
        groupRestrictions: { select: { groupId: true } },
        category: {
          include: {
            groupAccess: {
              include: { group: { select: { id: true, name: true } } },
            },
          },
        },
      },
    }),
    prisma.category.findMany({
      orderBy: { id: "asc" },
      include: {
        lessons: {
          orderBy: { sortOrder: "desc" },
          take: 1,
          select: { sortOrder: true },
        },
      },
    }),
  ]);
  if (!lesson) notFound();
  const content = parseLessonDocument(lesson.content);

  return (
    <div className="px-3">
      <div className="mx-auto flex w-full max-w-[720px] flex-col">
        <h1 className="my-6 text-2xl font-bold text-neutral-700">
          Урок · {lesson.title}
        </h1>
        <div className="mb-4">
          <Button variant="secondaryOutline" asChild>
            <Link href={`/lesson/${lesson.id}/preview`}>
              Предпросмотр от лица ученика
            </Link>
          </Button>
        </div>
        {content ? <LessonForm
          contentLocked={isPracticeContent(content) && (lesson.isPublished || lesson._count.progress > 0)}
          categories={categories.map((category) => ({
            id: category.id,
            name: category.name,
            track: category.track,
            nextSortOrder: (category.lessons[0]?.sortOrder ?? -1) + 1,
          }))}
          lesson={{
            id: lesson.id,
            title: lesson.title,
            categoryId: lesson.categoryId,
            xpReward: lesson.xpReward,
            coinReward: lesson.coinReward,
            sortOrder: lesson.sortOrder,
            content,
          }}
        /> : <p role="alert" className="mb-6 rounded-xl bg-amber-50 p-4 text-neutral-700">Контент урока повреждён или использует неизвестный формат. Восстановите исходный файл перед редактированием.</p>}
        <div className="mb-10">
          <LessonGroupAccessForm
            lessonId={lesson.id}
            groups={lesson.category.groupAccess.map((item) => item.group)}
            selectedIds={lesson.groupRestrictions.map((item) => item.groupId)}
          />
        </div>
      </div>
    </div>
  );
}
