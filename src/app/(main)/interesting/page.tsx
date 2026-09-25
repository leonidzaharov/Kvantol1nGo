import { Sparkles } from "lucide-react";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";

import { ResourceCard } from "./card";

export default async function InterestingPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isAdmin: true, groupId: true },
  });
  if (!user) redirect("/");

  // Ученик видит только опубликованные карточки своей группы. Наставник видит
  // всё, чтобы проверить черновик до публикации.
  // sortOrder задаёт порядок: меньше — выше. При равном sortOrder порядок
  // добивается по id — иначе Postgres волен возвращать «ничьи» как попало.
  // Вторым запросом — отметки «Изучил» текущего ученика (для кнопок).
  const [resources, studiedRows] = await Promise.all([
    prisma.resource.findMany({
      where: user.isAdmin
        ? {}
        : {
            isPublished: true,
            groupAccess: { some: { groupId: user.groupId ?? -1 } },
          },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    }),
    prisma.userResource.findMany({
      where: { userId: session.user.id },
      select: { resourceId: true },
    }),
  ]);
  const studiedIds = new Set(studiedRows.map((r) => r.resourceId));

  return (
    <div className="px-3">
      <div className="mx-auto flex w-full max-w-[900px] flex-col items-center">
        <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-purple-400 text-white">
          <Sparkles className="h-10 w-10" />
        </div>

        <h1 className="my-2 text-center text-2xl font-bold text-neutral-700">
          Интересное
        </h1>
        <p className="mb-6 text-center text-neutral-500">
          Видео, проекты и ссылки, чтобы пробовать новое за пределами уроков.
        </p>

        {resources.length === 0 ? (
          <p className="mt-6 rounded-2xl border-2 border-dashed border-neutral-200 px-6 py-10 text-center text-neutral-400">
            Пока тут пусто — материалы скоро появятся.
          </p>
        ) : (
          <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2">
            {resources.map((resource) => (
              <ResourceCard
                key={resource.id}
                resource={resource}
                studied={studiedIds.has(resource.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
