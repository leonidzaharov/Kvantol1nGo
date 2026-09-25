import { prisma } from "@/lib/db";
import { requireAdminOr404 } from "@/lib/server-guard";

import { LessonForm } from "../lesson-form";

export default async function NewLessonPage() {
  await requireAdminOr404();

  // nextSortOrder: новый урок по умолчанию встаёт в конец своей категории.
  const categories = await prisma.category.findMany({
    orderBy: { id: "asc" },
    include: {
      lessons: {
        orderBy: { sortOrder: "desc" },
        take: 1,
        select: { sortOrder: true },
      },
    },
  });

  return (
    <div className="px-3">
      <div className="mx-auto flex w-full max-w-[720px] flex-col">
        <h1 className="my-6 text-2xl font-bold text-neutral-700">
          Новый урок
        </h1>
        <LessonForm
          categories={categories.map((c) => ({
            id: c.id,
            name: c.name,
            track: c.track,
            nextSortOrder: (c.lessons[0]?.sortOrder ?? -1) + 1,
          }))}
        />
      </div>
    </div>
  );
}
