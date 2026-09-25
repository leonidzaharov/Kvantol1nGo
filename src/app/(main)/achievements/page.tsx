import { Check, Lock, Star, Trophy } from "lucide-react";
import { redirect } from "next/navigation";
import type { AchievementRarity } from "@/generated/prisma";

import { auth } from "@/auth";
import { getAchievementPresentation } from "@/lib/achievement-presentation";
import { ACHIEVEMENT_RARITY_LABELS } from "@/lib/achievement-rarity";
import { prisma } from "@/lib/db";
import { Progress } from "@/components/ui/progress";

import { ShowcaseButton } from "./showcase-button";

type AchievementCard = {
  id: number;
  title: string;
  description: string;
  icon: string | null;
  targetValue: number;
  rewardCurrency: number;
  rarity: AchievementRarity;
  /** Секретная и ещё не открытая — показываем как «???». */
  isSecret: boolean;
  progress: number;
  isUnlocked: boolean;
  unlockedAt: Date | null;
  isShowcased: boolean;
};

export default async function AchievementsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/");
  }
  const userId = session.user.id;

  // Ачивки теперь живут в БД (наставник правит их в /admin/achievements).
  // Выключенные не показываем; прогресс пользователя подмешиваем join'ом.
  const [achievements, user] = await Promise.all([
    prisma.achievement.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      include: {
        category: { select: { _count: { select: { lessons: true } } } },
        users: {
          where: { userId },
          select: { progress: true, isUnlocked: true, unlockedAt: true },
        },
      },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { showcaseAchievementId: true },
    }),
  ]);

  const cards: AchievementCard[] = achievements.map((a) => {
    const row = a.users[0] ?? null;
    const isUnlocked = row?.isUnlocked ?? false;
    const presentation = getAchievementPresentation({
      title: a.title,
      description: a.description,
      isHidden: a.isHidden,
      isUnlocked,
      hiddenHint: a.hiddenHint,
    });
    return {
      id: a.id,
      title: presentation.title,
      description: presentation.description,
      icon: a.icon,
      // Цель категорийной ачивки — живое число уроков курса (как в движке).
      targetValue:
        a.metric === "category_completed"
          ? a.category?._count.lessons ?? a.targetValue
          : a.targetValue,
      rewardCurrency: a.rewardCurrency,
      rarity: a.rarity,
      isSecret: presentation.isSecret,
      progress: row?.progress ?? 0,
      isUnlocked,
      unlockedAt: row?.unlockedAt ?? null,
      isShowcased: user?.showcaseAchievementId === a.id,
    };
  });

  const unlockedCount = cards.filter((c) => c.isUnlocked).length;
  const totalCount = cards.length;

  return (
    <div className="achievement-collection px-3 pb-8">
      <header className="mb-6 rounded-3xl border-2 border-neutral-200 bg-neutral-50 p-5 sm:p-6">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-neutral-700">Достижения</h1>
        <div className="shrink-0 rounded-xl border-2 border-b-4 px-3 py-1.5 text-sm font-bold text-neutral-500">
          Открыто {unlockedCount} / {totalCount}
        </div>
      </div>
      <p className="mb-5 max-w-2xl text-sm leading-relaxed text-neutral-500">
        Открытую ачивку можно выставить на витрину — она появится в профиле и
        рядом с именем в лидерборде.
      </p>
      <Progress value={totalCount ? Math.round(unlockedCount / totalCount * 100) : 0} label="Собрано достижений" className="h-2" />
      <p className="mt-3 text-xs font-bold text-neutral-500">Твоя коллекция открытий, знаний и больших шагов</p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <AchievementCardView key={card.id} card={card} />
        ))}
      </div>
    </div>
  );
}

function AchievementCardView({ card }: { card: AchievementCard }) {
  // Секретная и не открытая: ни названия, ни описания, ни прогресса —
  // только интрига.
  if (card.isSecret) {
    return (
      <article
        className="achievement-card achievement-rarity flex flex-col gap-3 rounded-xl border-2 border-b-4 border-dashed p-4"
        data-rarity={card.rarity}
        data-state="locked"
      >
        <div className="flex items-start gap-x-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-neutral-100 text-neutral-400">
            <span className="text-2xl">❓</span>
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-bold text-neutral-500">Секретное достижение</h2>
            <span className="mt-1 inline-flex items-center gap-x-1 rounded-md bg-neutral-100 px-2 py-0.5 text-xs font-bold text-neutral-400">
              <Lock className="h-3 w-3" />
              Секрет
            </span>
          </div>
        </div>
        <p className="text-sm text-neutral-400">
          {card.description}
        </p>
      </article>
    );
  }

  const progressPct = Math.min(
    100,
    Math.round((card.progress / Math.max(1, card.targetValue)) * 100),
  );
  const inProgress = !card.isUnlocked && card.progress > 0;

  return (
    <article
      className="achievement-card achievement-rarity flex flex-col gap-3 rounded-xl border-2 border-b-4 p-4"
      data-rarity={card.rarity}
      data-state={card.isUnlocked ? "unlocked" : "available"}
    >
      <div className="achievement-card-heading">
        <div
          className="achievement-emblem achievement-rarity-label"
        >
          {card.icon ? (
            <span className="text-4xl" aria-hidden="true">{card.icon}</span>
          ) : (
            <Trophy className="h-9 w-9" aria-hidden="true" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h2 className="achievement-title text-lg font-extrabold leading-snug text-neutral-700">{card.title}</h2>
          {card.isUnlocked ? (
            <span className="mt-1 inline-flex items-center gap-x-1 rounded-md bg-green-100 px-2 py-0.5 text-xs font-bold text-green-600">
              <Check className="h-3 w-3 stroke-[3]" />
              Выполнено
            </span>
          ) : inProgress ? (
            <span className="mt-1 inline-flex items-center rounded-md bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-600">
              В процессе
            </span>
          ) : (
            <span className="mt-1 inline-flex items-center gap-x-1 rounded-md bg-neutral-100 px-2 py-0.5 text-xs font-bold text-neutral-400">
              <Lock className="h-3 w-3" />
              Закрыто
            </span>
          )}
          <span className="achievement-rarity-label ml-1 mt-1 inline-flex rounded-md px-2 py-0.5 text-xs font-bold">
            {ACHIEVEMENT_RARITY_LABELS[card.rarity]}
          </span>
        </div>
      </div>

      <p className="text-sm leading-relaxed text-neutral-500">{card.description}</p>

      <div className="mt-auto flex flex-col gap-2">
        {!card.isUnlocked && card.targetValue > 1 && (
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-xs font-bold text-neutral-400">
              <span>Прогресс</span>
              <span>
                {Math.min(card.progress, card.targetValue)} / {card.targetValue}
              </span>
            </div>
            <Progress
              value={progressPct}
              label={`Прогресс достижения «${card.title}»`}
              className="h-2"
            />
          </div>
        )}

        <div className="flex items-center justify-between">
          {card.rewardCurrency > 0 && (
            <span className="inline-flex items-center gap-x-1 text-sm font-bold text-orange-500">
              <Star className="h-4 w-4 fill-orange-400" />+{card.rewardCurrency}
            </span>
          )}
          {card.isUnlocked && card.unlockedAt && (
            <span className="text-xs text-neutral-400">
              {formatUnlockedAt(card.unlockedAt)}
            </span>
          )}
        </div>

        {card.isUnlocked && (
          <ShowcaseButton
            achievementId={card.id}
            isShowcased={card.isShowcased}
          />
        )}
      </div>
    </article>
  );
}

function formatUnlockedAt(date: Date): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}
