import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/db";
import { awardManualAchievement } from "@/lib/actions/achievements";
import { requireAdminOr404 } from "@/lib/server-guard";

import { AchievementForm } from "../achievement-form";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ award?: string }>;
};

export default async function EditAchievementPage({
  params,
  searchParams,
}: PageProps) {
  await requireAdminOr404();

  const { id } = await params;
  const { award } = await searchParams;
  const achievementId = Number.parseInt(id, 10);
  if (!Number.isFinite(achievementId) || achievementId <= 0) {
    notFound();
  }

  const [achievement, categories] = await Promise.all([
    prisma.achievement.findUnique({
      where: { id: achievementId },
      select: {
        id: true,
        title: true,
        description: true,
        icon: true,
        metric: true,
        rarity: true,
        categoryId: true,
        targetValue: true,
        rewardCurrency: true,
        isHidden: true,
        hiddenHint: true,
        isActive: true,
        sortOrder: true,
      },
    }),
    prisma.category.findMany({
      orderBy: { id: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  if (!achievement) {
    notFound();
  }

  const students =
    achievement.metric === "manual_award"
      ? await prisma.user.findMany({
          where: { isAdmin: false },
          orderBy: { name: "asc" },
          select: {
            id: true,
            name: true,
            group: { select: { name: true } },
            achievements: {
              where: { achievementId: achievement.id },
              select: { isUnlocked: true },
            },
          },
        })
      : [];
  const availableStudents = students.filter(
    (student) => !student.achievements[0]?.isUnlocked,
  );
  const awardedCount = students.length - availableStudents.length;

  return (
    <div className="px-3">
      <div className="mx-auto flex w-full max-w-[720px] flex-col">
        <h1 className="my-6 text-2xl font-bold text-neutral-700">
          Ачивка «{achievement.title}»
        </h1>
        <AchievementForm achievement={achievement} categories={categories} />

        {achievement.metric === "manual_award" && (
          <section className="mt-8 rounded-2xl border-2 border-violet-200 bg-violet-50 p-5">
            <h2 className="text-lg font-bold text-violet-800">
              Ручная выдача ученику
            </h2>
            <p className="mt-1 text-sm text-violet-700">
              Монеты начислятся только при первой выдаче. Повторная отправка
              безопасна и не увеличит баланс ещё раз.
            </p>

            {award === "success" && (
              <p
                className="mt-4 rounded-xl bg-green-100 px-3 py-2 text-sm font-bold text-green-700"
                role="status"
              >
                Достижение выдано. Ученик увидит уведомление при следующем
                входе.
              </p>
            )}
            {award === "already" && (
              <p
                className="mt-4 rounded-xl bg-amber-100 px-3 py-2 text-sm font-bold text-amber-700"
                role="status"
              >
                Этот ученик уже получал достижение. Монеты повторно не
                начислены.
              </p>
            )}

            {availableStudents.length > 0 ? (
              <form
                action={awardManualAchievement}
                className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"
              >
                <input
                  type="hidden"
                  name="achievementId"
                  value={achievement.id}
                />
                <label className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <span className="text-sm font-bold text-neutral-700">
                    Ученик
                  </span>
                  <select
                    name="userId"
                    required
                    defaultValue=""
                    className="h-11 rounded-xl border-2 border-neutral-200 bg-white px-3 font-medium text-neutral-700 outline-none focus:border-violet-400"
                  >
                    <option value="" disabled>
                      Выбери ученика
                    </option>
                    {availableStudents.map((student) => (
                      <option key={student.id} value={student.id}>
                        {student.name}
                        {student.group ? ` · ${student.group.name}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <Button type="submit">Выдать достижение</Button>
              </form>
            ) : (
              <p className="mt-4 text-sm font-bold text-violet-700">
                Все ученики уже получили это достижение.
              </p>
            )}

            <p className="mt-3 text-xs font-bold text-violet-500">
              Уже получили: {awardedCount} из {students.length}
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
