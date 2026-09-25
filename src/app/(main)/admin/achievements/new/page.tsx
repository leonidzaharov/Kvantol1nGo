import { prisma } from "@/lib/db";
import { requireAdminOr404 } from "@/lib/server-guard";

import { AchievementForm } from "../achievement-form";

export default async function NewAchievementPage() {
  await requireAdminOr404();

  const categories = await prisma.category.findMany({
    orderBy: { id: "asc" },
    select: { id: true, name: true },
  });

  return (
    <div className="px-3">
      <div className="mx-auto flex w-full max-w-[720px] flex-col">
        <h1 className="my-6 text-2xl font-bold text-neutral-700">
          Новая ачивка
        </h1>
        <AchievementForm categories={categories} />
      </div>
    </div>
  );
}
