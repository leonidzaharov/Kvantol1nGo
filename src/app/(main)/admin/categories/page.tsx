import Link from "next/link";
import { Plus, Wrench } from "lucide-react";

import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/db";
import { TRACK_LABELS, TRACK_ORDER } from "@/lib/groups";
import { requireAdminOr404 } from "@/lib/server-guard";

import { AdminNav } from "../admin-nav";
import { PublicationControl } from "../publication-controls";
import { DeleteButton } from "./delete-button";
import {
  duplicateCategory,
  toggleCategoryPublication,
} from "@/lib/actions/program";

// Админка курсов-модулей: название, иконка и главное — направление
// (вводный/углублённый/проектный), по которому фильтруются группы.
export default async function AdminCategoriesPage() {
  await requireAdminOr404();

  const categories = await prisma.category.findMany({
    orderBy: { id: "asc" },
    include: {
      _count: { select: { lessons: true, groupAccess: true } },
    },
  });

  return (
    <div className="px-3">
      <div className="mx-auto flex w-full max-w-[900px] flex-col">
        <div className="flex flex-col items-center">
          <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-neutral-600 text-white">
            <Wrench className="h-10 w-10" />
          </div>
          <h1 className="my-2 text-center text-2xl font-bold text-neutral-700">
            Админка · Курсы
          </h1>
          <p className="mb-6 text-center text-neutral-500">
            Модули программы. Ученики видят только модули направления своей
            группы.
          </p>
          <AdminNav active="categories" />
          <div className="mt-4">
            <Button variant="secondary" asChild>
              <Link href="/admin/categories/new">
                <Plus className="mr-2 h-5 w-5" />
                Добавить курс
              </Link>
            </Button>
          </div>
        </div>

        {TRACK_ORDER.map((track) => {
          const inTrack = categories.filter((c) => c.track === track);
          return (
            <section key={track} className="mt-8">
              <h2 className="mb-3 text-lg font-bold text-neutral-700">
                {TRACK_LABELS[track]}
              </h2>
              {inTrack.length === 0 ? (
                <p className="rounded-2xl border-2 border-dashed border-neutral-200 px-6 py-6 text-center text-neutral-400">
                  В этом направлении курсов пока нет.
                </p>
              ) : (
                <ul className="flex flex-col gap-y-3">
                  {inTrack.map((category) => (
                    <li
                      key={category.id}
                      className="flex flex-wrap items-center gap-3 rounded-2xl border-2 border-neutral-200 p-4"
                    >
                      <span className="w-10 shrink-0 text-center text-2xl">
                        {category.icon ?? "📚"}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-bold text-neutral-700">
                          {category.name}
                        </p>
                        <span className="text-sm text-neutral-400">
                          Уроков: {category._count.lessons}
                        </span>
                      </div>
                      <span
                        className={`text-xs font-bold ${
                          category.isPublished
                            ? "text-green-600"
                            : "text-amber-600"
                        }`}
                      >
                        {category.isPublished ? "Опубликован" : "Черновик"} ·{" "}
                        {category._count.groupAccess} групп
                      </span>
                      <PublicationControl
                        id={category.id}
                        isPublished={category.isPublished}
                        action={toggleCategoryPublication}
                      />
                      <form action={duplicateCategory}>
                        <input type="hidden" name="id" value={category.id} />
                        <Button type="submit" variant="ghost" size="sm">
                          Дублировать
                        </Button>
                      </form>
                      <Button variant="secondaryOutline" size="sm" asChild>
                        <Link href={`/admin/categories/${category.id}`}>
                          Изменить
                        </Link>
                      </Button>
                      <DeleteButton
                        id={category.id}
                        name={category.name}
                        lessonCount={category._count.lessons}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
