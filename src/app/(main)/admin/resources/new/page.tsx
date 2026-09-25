import { prisma } from "@/lib/db";
import { requireAdminOr404 } from "@/lib/server-guard";

import { ResourceForm } from "../resource-form";

// Создание нового материала «Интересного». Только для наставника.
export default async function NewResourcePage() {
  await requireAdminOr404();

  // Новый материал — в конец списка: максимум sortOrder + 1.
  const [last, groups] = await Promise.all([
    prisma.resource.aggregate({ _max: { sortOrder: true } }),
    prisma.group.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  const defaultSortOrder = (last._max.sortOrder ?? -1) + 1;

  return (
    <div className="px-3">
      <div className="mx-auto flex w-full max-w-[600px] flex-col">
        <h1 className="my-4 text-2xl font-bold text-neutral-700">
          Новый материал
        </h1>
        <ResourceForm defaultSortOrder={defaultSortOrder} groups={groups} />
      </div>
    </div>
  );
}
