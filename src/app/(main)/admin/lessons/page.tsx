import Link from "next/link";
import { BookOpen, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/db";
import { parseLessonContent } from "@/lib/lesson-content";
import { requireAdminOr404 } from "@/lib/server-guard";

import { AdminNav } from "../admin-nav";
import { PublicationControl } from "../publication-controls";
import { DeleteLessonButton } from "./delete-button";
import {
  duplicateLesson,
  toggleLessonPublication,
} from "@/lib/actions/program";

// Админка уроков: список по категориям + добавление/правка/удаление.
// Доступ только наставнику (isAdmin) — остальным 404.
type PageProps = {
  searchParams: Promise<{ courseId?: string }>;
};

export default async function AdminLessonsPage({ searchParams }: PageProps) {
  await requireAdminOr404();
  const query = await searchParams;

  const categories = await prisma.category.findMany({
    orderBy: { id: "asc" },
    include: {
      lessons: {
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        select: {
          id: true,
          title: true,
          sortOrder: true,
          content: true,
          isPublished: true,
          _count: { select: { groupRestrictions: true } },
        },
      },
    },
  });
  const requestedCourseId = Number.parseInt(query.courseId ?? "", 10);
  const selectedCategory =
    categories.find((category) => category.id === requestedCourseId) ??
    categories[0] ??
    null;

  return (
    <div className="px-3">
      <div className="mx-auto flex w-full max-w-[900px] flex-col">
        <div className="flex flex-col items-center">
          <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-neutral-600 text-white">
            <BookOpen className="h-10 w-10" />
          </div>
          <h1 className="my-2 text-center text-2xl font-bold text-neutral-700">
            Админка · Уроки
          </h1>
          <p className="mb-6 text-center text-neutral-500">
            Основные уроки курса: теория и задания, которые ученики проходят
            на странице «Учить».
          </p>
          <AdminNav active="lessons" />
          <div className="mt-4">
            <Button variant="secondary" asChild>
              <Link href="/admin/lessons/new">
                <Plus className="mr-2 h-5 w-5" />
                Добавить урок
              </Link>
            </Button>
          </div>
          {categories.length > 0 && selectedCategory && (
            <form
              method="get"
              className="mt-6 flex w-full max-w-xl flex-col gap-2 rounded-2xl border-2 border-neutral-200 p-4 sm:flex-row sm:items-end"
            >
              <label className="flex flex-1 flex-col gap-1 text-left">
                <span className="text-sm font-bold text-neutral-700">
                  Выберите курс
                </span>
                <select
                  name="courseId"
                  defaultValue={selectedCategory.id}
                  className="rounded-xl border-2 border-neutral-200 bg-white p-3 font-medium text-neutral-700"
                >
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
              <Button type="submit" variant="secondary">
                Показать уроки
              </Button>
            </form>
          )}
        </div>

        {categories.length === 0 ? (
          <p className="mt-8 rounded-2xl border-2 border-dashed border-neutral-200 px-6 py-10 text-center text-neutral-400">
            Категорий пока нет — запусти seed-скрипт.
          </p>
        ) : (
          <div className="mb-10 mt-8 flex flex-col gap-y-6">
            {[selectedCategory].filter(Boolean).map((category) => (
              <div key={category.id}>
                <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-neutral-400">
                  {category.name} · {category.lessons.length} ур.
                </h2>
                {category.lessons.length === 0 ? (
                  <p className="rounded-2xl border-2 border-dashed border-neutral-200 px-6 py-6 text-center text-neutral-400">
                    В категории пока нет уроков.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-y-2">
                    {category.lessons.map((lesson) => {
                      const content = parseLessonContent(lesson.content);
                      const hasTheory = content.theory.trim() !== "";
                      return (
                        <li
                          key={lesson.id}
                          className="flex flex-wrap items-center gap-3 rounded-2xl border-2 border-neutral-200 p-4"
                        >
                          <span className="w-8 shrink-0 text-center font-bold text-neutral-400">
                            {lesson.sortOrder}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-bold text-neutral-700">
                              {lesson.title}
                            </p>
                            <p className="text-xs font-bold text-neutral-400">
                              {hasTheory ? "теория · " : ""}
                              {content.questions.length} задан.
                              {content.bonusQuestions.length > 0
                                ? ` · ⭐ ${content.bonusQuestions.length}`
                                : ""}
                            </p>
                          </div>
                          <span
                            className={`text-xs font-bold ${
                              lesson.isPublished
                                ? "text-green-600"
                                : "text-amber-600"
                            }`}
                          >
                            {lesson.isPublished ? "Опубликован" : "Черновик"}
                            {lesson._count.groupRestrictions > 0
                              ? ` · ${lesson._count.groupRestrictions} групп`
                              : " · все группы"}
                          </span>
                          <Button variant="ghost" size="sm" asChild>
                            <Link href={`/lesson/${lesson.id}/preview`}>
                              Предпросмотр
                            </Link>
                          </Button>
                          <PublicationControl
                            id={lesson.id}
                            isPublished={lesson.isPublished}
                            action={toggleLessonPublication}
                          />
                          <form action={duplicateLesson}>
                            <input type="hidden" name="id" value={lesson.id} />
                            <Button type="submit" variant="ghost" size="sm">
                              Дублировать
                            </Button>
                          </form>
                          <Button variant="secondaryOutline" size="sm" asChild>
                            <Link href={`/admin/lessons/${lesson.id}`}>
                              Изменить
                            </Link>
                          </Button>
                          <DeleteLessonButton
                            id={lesson.id}
                            title={lesson.title}
                          />
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
