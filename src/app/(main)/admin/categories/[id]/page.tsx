import { notFound } from "next/navigation";

import { prisma } from "@/lib/db";
import { requireAdminOr404 } from "@/lib/server-guard";

import { CategoryGroupAccessForm } from "../../group-access-form";
import { CategoryForm } from "../category-form";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditCategoryPage({ params }: PageProps) {
  await requireAdminOr404();
  const { id } = await params;
  const categoryId = Number.parseInt(id, 10);
  if (!Number.isFinite(categoryId) || categoryId <= 0) notFound();

  const category = await prisma.category.findUnique({
    where: { id: categoryId },
    include: { groupAccess: { select: { groupId: true } } },
  });
  if (!category) notFound();

  const groups = await prisma.group.findMany({
    where: { track: category.track },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    <div className="px-3">
      <div className="mx-auto flex w-full max-w-[720px] flex-col">
        <h1 className="my-6 text-2xl font-bold text-neutral-700">
          Курс «{category.name}»
        </h1>
        <CategoryForm category={category} />
        <div className="mb-10">
          <CategoryGroupAccessForm
            categoryId={category.id}
            groups={groups}
            selectedIds={category.groupAccess.map((item) => item.groupId)}
          />
        </div>
      </div>
    </div>
  );
}
