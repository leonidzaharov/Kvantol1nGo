import Link from "next/link";
import { notFound } from "next/navigation";

import { QuestRunner } from "@/app/lesson/[id]/QuestRunner";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/db";
import {
  parseLessonContent,
  sanitizeLessonContent,
} from "@/lib/lesson-content";
import { requireAdminOr404 } from "@/lib/server-guard";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function LessonPreviewPage({ params }: PageProps) {
  const adminId = await requireAdminOr404();
  const { id } = await params;
  const lessonId = Number.parseInt(id, 10);
  if (!Number.isFinite(lessonId) || lessonId <= 0) notFound();

  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: { id: true, title: true, content: true, isPublished: true },
  });
  if (!lesson) notFound();

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-amber-100 px-4 py-3 text-amber-950">
        <div>
          <p className="font-bold">Предпросмотр от лица ученика</p>
          <p className="text-sm">
            Урок {lesson.isPublished ? "опубликован" : "находится в черновиках"}.
            Прогресс и награды не сохраняются.
          </p>
        </div>
        <Button variant="default" size="sm" asChild>
          <Link href={`/admin/lessons/${lesson.id}`}>Вернуться к редактору</Link>
        </Button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        <QuestRunner
          lessonId={lesson.id}
          title={lesson.title}
          content={sanitizeLessonContent(parseLessonContent(lesson.content))}
          alreadyCompleted={false}
          previewMode
          theoryProgressKey={`lesson-theory-preview:v1:${adminId}:${lesson.id}`}
        />
      </div>
    </div>
  );
}
