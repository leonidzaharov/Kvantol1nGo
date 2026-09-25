import Link from "next/link";
import { Plus, Wrench } from "lucide-react";

import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/db";
import { requireAdminOr404 } from "@/lib/server-guard";

import { AdminNav } from "../admin-nav";
import { DeleteButton } from "./delete-button";
import { TYPE_LABELS } from "./type-labels";
import { PublicationControl } from "../publication-controls";
import { toggleResourcePublication } from "@/lib/actions/resources";

// Админка «Интересного»: список материалов + добавление/правка/удаление.
// Доступ только наставнику (isAdmin) — остальным 404.
export default async function AdminResourcesPage() {
  await requireAdminOr404();

  // Та же сортировка, что на /interesting, — админ видит список 1-в-1.
  const resources = await prisma.resource.findMany({
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    include: { groupAccess: { select: { groupId: true } } },
  });

  return (
    <div className="px-3">
      <div className="mx-auto flex w-full max-w-[900px] flex-col">
        <div className="flex flex-col items-center">
          <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-neutral-600 text-white">
            <Wrench className="h-10 w-10" />
          </div>
          <h1 className="my-2 text-center text-2xl font-bold text-neutral-700">
            Админка · Интересное
          </h1>
          <p className="mb-6 text-center text-neutral-500">
            Материалы, которые ученики видят на странице «Интересное».
          </p>
          <AdminNav active="resources" />
          <div className="mt-4">
            <Button variant="secondary" asChild>
              <Link href="/admin/resources/new">
                <Plus className="mr-2 h-5 w-5" />
                Добавить материал
              </Link>
            </Button>
          </div>
        </div>

        {resources.length === 0 ? (
          <p className="mt-8 rounded-2xl border-2 border-dashed border-neutral-200 px-6 py-10 text-center text-neutral-400">
            Материалов пока нет — добавь первый.
          </p>
        ) : (
          <ul className="mt-8 flex flex-col gap-y-3">
            {resources.map((resource) => (
              <li
                key={resource.id}
                className="flex items-center gap-x-4 rounded-2xl border-2 border-neutral-200 p-4"
              >
                <span className="w-8 shrink-0 text-center font-bold text-neutral-400">
                  {resource.sortOrder}
                </span>
                <div className="min-w-0 flex-1">
                  <span className="text-xs font-bold uppercase tracking-wide text-neutral-400">
                    {TYPE_LABELS[resource.type]}
                  </span>
                  <p className="truncate font-bold text-neutral-700">
                    {resource.title}
                  </p>
                  <p className="text-xs font-medium text-neutral-400">
                    {resource.isPublished ? "Опубликован" : "Черновик"} ·{" "}
                    {resource.groupAccess.length} групп
                  </p>
                </div>
                <PublicationControl
                  id={resource.id}
                  isPublished={resource.isPublished}
                  action={toggleResourcePublication}
                />
                <Button variant="secondaryOutline" size="sm" asChild>
                  <Link href={`/admin/resources/${resource.id}`}>Изменить</Link>
                </Button>
                <DeleteButton id={resource.id} title={resource.title} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
