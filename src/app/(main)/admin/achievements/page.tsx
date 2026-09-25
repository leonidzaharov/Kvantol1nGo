import Link from "next/link";
import { Plus, Trophy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ACHIEVEMENT_RARITY_LABELS } from "@/lib/achievement-rarity";
import { prisma } from "@/lib/db";
import { requireAdminOr404 } from "@/lib/server-guard";
import { cn } from "@/lib/utils";

import { AdminNav } from "../admin-nav";
import { DeleteButton } from "./delete-button";
import { ManualAwardPanel } from "./manual-award-panel";
import { METRIC_LABELS } from "./metric-labels";

// Админка ачивок: наставник создаёт/правит достижения, ученики видят их
// в «Достижениях». Условие описывается типом метрики + целью.
export default async function AdminAchievementsPage() {
  await requireAdminOr404();

  const [achievements, students] = await Promise.all([
    prisma.achievement.findMany({
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      include: {
        category: {
          select: { name: true, _count: { select: { lessons: true } } },
        },
        _count: {
          select: { users: { where: { isUnlocked: true } } },
        },
      },
    }),
    prisma.user.findMany({
      where: { isAdmin: false },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        group: { select: { name: true } },
        achievements: {
          where: {
            isUnlocked: true,
            achievement: { metric: "manual_award" },
          },
          select: { achievementId: true },
        },
      },
    }),
  ]);

  const manualAchievements = achievements
    .filter((achievement) => achievement.metric === "manual_award" && achievement.isActive)
    .map((achievement) => ({
      id: achievement.id,
      title: achievement.title,
      icon: achievement.icon,
      rarity: achievement.rarity,
      rewardCurrency: achievement.rewardCurrency,
    }));

  return (
    <div className="px-3">
      <div className="mx-auto flex w-full max-w-[900px] flex-col">
        <div className="flex flex-col items-center">
          <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-neutral-600 text-white">
            <Trophy className="h-10 w-10" />
          </div>
          <h1 className="my-2 text-center text-2xl font-bold text-neutral-700">
            Админка · Ачивки
          </h1>
          <p className="mb-6 text-center text-neutral-500">
            Достижения учеников. Прогресс пересчитывается после каждого
            пройденного урока.
          </p>
          <AdminNav active="achievements" />
          <div className="mt-4">
            <Button variant="secondary" asChild>
              <Link href="/admin/achievements/new">
                <Plus className="mr-2 h-5 w-5" />
                Добавить ачивку
              </Link>
            </Button>
          </div>
        </div>

        {manualAchievements.length > 0 && students.length > 0 && (
          <ManualAwardPanel
            achievements={manualAchievements}
            students={students.map((student) => ({
              id: student.id,
              name: student.name,
              groupName: student.group?.name ?? null,
              unlockedAchievementIds: student.achievements.map(
                (achievement) => achievement.achievementId,
              ),
            }))}
          />
        )}

        {achievements.length === 0 ? (
          <p className="mt-8 rounded-2xl border-2 border-dashed border-neutral-200 px-6 py-6 text-center text-neutral-400">
            Ачивок пока нет.
          </p>
        ) : (
          <ul className="mt-8 flex flex-col gap-y-3">
            {achievements.map((a) => {
              const target =
                a.metric === "category_completed"
                  ? a.category?._count.lessons ?? 0
                  : a.targetValue;
              const condition =
                a.metric === "category_completed"
                  ? `${METRIC_LABELS[a.metric]}: ${
                      a.category?.name ?? "курс удалён"
                    } (${target} ур.)`
                  : `${METRIC_LABELS[a.metric]}: ${target}`;

              return (
                <li
                  key={a.id}
                  className={cn(
                    "flex items-center gap-x-4 rounded-2xl border-2 p-4",
                    a.isActive ? "border-neutral-200" : "border-dashed border-neutral-200 opacity-60",
                  )}
                >
                  <span className="w-10 shrink-0 text-center text-2xl">
                    {a.icon ?? "🏆"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold text-neutral-700">
                      {a.title}
                      <span
                        className="achievement-rarity achievement-rarity-label ml-2 rounded-md px-1.5 py-0.5 text-xs font-bold"
                        data-rarity={a.rarity}
                      >
                        {ACHIEVEMENT_RARITY_LABELS[a.rarity]}
                      </span>
                      {a.isHidden && (
                        <span className="ml-2 rounded-md bg-violet-100 px-1.5 py-0.5 text-xs font-bold text-violet-600">
                          секретная
                        </span>
                      )}
                      {!a.isActive && (
                        <span className="ml-2 rounded-md bg-neutral-100 px-1.5 py-0.5 text-xs font-bold text-neutral-500">
                          выключена
                        </span>
                      )}
                    </p>
                    <span className="block truncate text-sm text-neutral-400">
                      {condition}
                      {a.rewardCurrency > 0 && ` · +${a.rewardCurrency} монет`}
                      {` · открыли: ${a._count.users}`}
                    </span>
                  </div>
                  <Button variant="secondaryOutline" size="sm" asChild>
                    <Link href={`/admin/achievements/${a.id}`}>Изменить</Link>
                  </Button>
                  <DeleteButton
                    id={a.id}
                    title={a.title}
                    unlockedCount={a._count.users}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
