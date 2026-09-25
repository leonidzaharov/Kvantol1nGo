import { pixelExchangeSummary } from "@/lib/pixel-economy";
import { StudentAvatar } from "@/components/student-avatar";
import { AvatarPicker } from "@/components/avatar-picker";
import {
  BookOpen,
  Crown,
  Medal,
  Star,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/db";
import { cn } from "@/lib/utils";



/**
 * Карточка профиля — общая для «моего» (/profile) и чужого (/profile/[id]).
 * isOwn прячет личное: монеты показываем только владельцу (они тратятся
 * офлайн у наставника — не для чужих глаз).
 */
export async function ProfileView({
  userId,
  isOwn,
}: {
  userId: string;
  isOwn: boolean;
}) {
  const [user, lessonsCompleted, unlocked, totalAchievements] =
    await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          name: true, avatarId: true, isAdmin: true,
          totalXp: true,
          level: true,
          currency: true, pixelsRedeemed: true,
          createdAt: true,
          group: { select: { name: true } },
          // Ачивка-витрина: ученик выбирает её в «Достижениях».
          showcaseAchievement: {
            select: {
              title: true,
              description: true,
              icon: true,
              rarity: true,
            },
          },
        },
      }),
      prisma.userLessonProgress.count({ where: { userId, isCompleted: true } }),
      // Открытые ачивки — полоска трофеев. Выключенные наставником не светим.
      prisma.userAchievement.findMany({
        where: { userId, isUnlocked: true, achievement: { isActive: true } },
        orderBy: { unlockedAt: "desc" },
        select: {
          achievement: {
            select: {
              id: true,
              title: true,
              description: true,
              icon: true,
              rarity: true,
            },
          },
        },
      }),
      prisma.achievement.count({ where: { isActive: true } }),
    ]);

  if (!user) {
    notFound();
  }

  const joined = new Intl.DateTimeFormat("ru-RU", {
    month: "long",
    year: "numeric",
  }).format(user.createdAt);

  return (
    <>
      <div className="flex flex-col items-center gap-y-3 pb-8 pt-4 text-center">
        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-green-500 text-3xl font-extrabold text-white">
          <StudentAvatar avatarId={user.avatarId} size={96} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-neutral-700">{user.name}</h1>
          <p className="mt-1 text-sm font-bold text-neutral-400">
            {user.group ? `Группа «${user.group.name}» · ` : ""}В Кванториуме с{" "}
            {joined}
          </p>
        </div>

        {user.showcaseAchievement && (
          <div
            className="achievement-rarity inline-flex items-center gap-x-2 rounded-full border-2 px-4 py-1.5"
            data-rarity={user.showcaseAchievement.rarity}
            data-state="unlocked"
            title={user.showcaseAchievement.description}
          >
            <span className="text-xl">
              {user.showcaseAchievement.icon ?? "🏆"}
            </span>
            <span className="achievement-rarity-accent text-sm font-bold">
              {user.showcaseAchievement.title}
            </span>
          </div>
        )}
      </div>

      {isOwn && !user.isAdmin && <AvatarPicker avatarId={user.avatarId} />}
      <h2 className="mb-3 text-xl font-bold text-neutral-700">Статистика</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard
          icon={Zap}
          iconClass="text-yellow-500 fill-yellow-400"
          value={user.totalXp}
          label="Всего XP"
        />
        <StatCard
          icon={Crown}
          iconClass="text-amber-500 fill-amber-400"
          value={user.level}
          label="Уровень"
        />
        <StatCard
          icon={BookOpen}
          iconClass="text-green-500"
          value={lessonsCompleted}
          label="Уроков пройдено"
        />
        <StatCard
          icon={Medal}
          iconClass="text-sky-500"
          value={`${unlocked.length} / ${totalAchievements}`}
          label="Достижения"
        />
        {isOwn && (
          <StatCard
            icon={Star}
            iconClass="text-orange-500 fill-orange-400"
            value={user.currency}
            label="Монеты"
          />
        )}
      </div>

      {isOwn && !user.isAdmin && <section className="mt-5 rounded-2xl border-2 border-amber-200 bg-amber-50 p-4 text-amber-950"><h2 className="font-bold">Монеты → пиксели Кванториума</h2><p className="mt-2">20 монет = 1 пиксель. Можно обменять: <strong>{pixelExchangeSummary(user.currency, user.pixelsRedeemed).available} пикселей</strong>.</p><p className="mt-1 text-sm">Уже выдано: {user.pixelsRedeemed} из 60 за весь курс. Для обмена подойди к наставнику. За первое прохождение обычного урока — 20 монет; повтор не оплачивается.</p></section>}
      {unlocked.length > 0 && (
        <>
          <h2 className="mb-3 mt-8 text-xl font-bold text-neutral-700">
            Открытые ачивки
          </h2>
          <div className="flex flex-wrap gap-2">
            {unlocked.map(({ achievement }) => (
              <span
                key={achievement.id}
                className="achievement-rarity inline-flex cursor-default items-center gap-x-1.5 rounded-full border-2 px-3 py-1.5 text-sm font-bold text-neutral-600"
                data-rarity={achievement.rarity}
                data-state="unlocked"
                title={achievement.description}
              >
                <span className="text-base">{achievement.icon ?? "🏆"}</span>
                {achievement.title}
              </span>
            ))}
          </div>
        </>
      )}
    </>
  );
}

function StatCard({
  icon: Icon,
  iconClass,
  value,
  label,
}: {
  icon: LucideIcon;
  iconClass: string;
  value: string | number;
  label: string;
}) {
  return (
    <div className="flex items-center gap-x-3 rounded-xl border-2 border-b-4 p-4">
      <Icon className={cn("h-7 w-7 shrink-0", iconClass)} />
      <div className="min-w-0">
        <p className="text-lg font-extrabold leading-none text-neutral-700">
          {value}
        </p>
        <p className="mt-1 text-xs font-bold text-neutral-400">{label}</p>
      </div>
    </div>
  );
}
