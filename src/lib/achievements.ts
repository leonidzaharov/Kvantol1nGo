import { lockStudentBalance } from "@/lib/student-balance-lock";
import { prisma } from "@/lib/db";
import type { AchievementRarity } from "@/generated/prisma";
import {
  computeAchievementProgress,
  type AchievementContext,
} from "@/lib/achievements-logic";

export type { AchievementContext } from "@/lib/achievements-logic";

/**
 * Сериализуемая «карточка» достижения для клиента — то, что показывает
 * тост. Никаких prisma-типов: только примитивы, чтобы безопасно лететь
 * через границу server action → client.
 */
export type UnlockedAchievement = {
  id: number;
  title: string;
  description: string;
  icon: string | null;
  rarity: AchievementRarity;
  rewardCurrency: number;
};

/**
 * Продвигает все активные ачивки из БД по свежим метрикам. Вызывается
 * после каждого завершения урока.
 *
 * Вся арифметика и правила выдачи — в achievements-logic.ts (чистые функции,
 * покрыты тестами). Здесь только работа с БД: достать, применить, записать.
 *
 * Ачивки перебираются последовательно (не Promise.all): разблокировки
 * инкрементят user.currency, и параллельные транзакции могли бы гоняться.
 */
export async function advanceAchievements(
  userId: string,
  ctx: AchievementContext,
): Promise<UnlockedAchievement[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { groupId: true },
  });
  const groupId = user?.groupId ?? -1;
  const achievements = await prisma.achievement.findMany({
    where: { isActive: true },
    include: {
      category: {
        select: {
          _count: {
            select: {
              lessons: {
                where: {
                  isPublished: true,
                  OR: [
                    { groupRestrictions: { none: {} } },
                    { groupRestrictions: { some: { groupId } } },
                  ],
                },
              },
            },
          },
        },
      },
    },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });

  const unlocked: UnlockedAchievement[] = [];

  for (const a of achievements) {
    // Дешёвая отсечка до транзакции: если ачивка к этому уроку не относится
    // (чужая категория, не «перфект»), в БД не лезем вовсе. Прогресс здесь
    // не читаем — его перечитает транзакция, чтобы решение принималось по
    // свежим данным.
    const rule = {
      metric: a.metric,
      categoryId: a.categoryId,
      targetValue: a.targetValue,
      categoryLessonCount: a.category?._count.lessons ?? null,
    };
    if (computeAchievementProgress(rule, ctx, null) === null) continue;

    const card = await applyProgress(userId, a.id, rule, ctx);
    if (card) unlocked.push(card);
  }

  return unlocked;
}

/**
 * Применяет прогресс одной ачивки в транзакции. Возвращает карточку,
 * только если ИМЕННО ЭТОТ вызов её разблокировал — иначе null.
 */
async function applyProgress(
  userId: string,
  achievementId: number,
  rule: Parameters<typeof computeAchievementProgress>[0],
  ctx: AchievementContext,
): Promise<UnlockedAchievement | null> {
  return prisma.$transaction(async (tx) => {
    await lockStudentBalance(tx, userId);
    const achievement = await tx.achievement.findUnique({
      where: { id: achievementId },
    });
    if (!achievement) return null;

    const existing = await tx.userAchievement.findUnique({
      where: { userId_achievementId: { userId, achievementId } },
    });

    // Решение принимает чистая логика — по прогрессу, прочитанному внутри
    // транзакции (защита от гонки: параллельный вызов мог уже открыть ачивку).
    const outcome = computeAchievementProgress(rule, ctx, existing);
    if (!outcome) return null;

    const now = new Date();

    await tx.userAchievement.upsert({
      where: { userId_achievementId: { userId, achievementId } },
      create: {
        userId,
        achievementId,
        progress: outcome.progress,
        isUnlocked: outcome.willUnlock,
        unlockedAt: outcome.willUnlock ? now : null,
        notifiedAt: outcome.willUnlock ? now : null,
      },
      update: {
        progress: outcome.progress,
        isUnlocked: outcome.willUnlock,
        unlockedAt: outcome.willUnlock ? now : null,
        notifiedAt: outcome.willUnlock ? now : null,
      },
    });

    if (!outcome.willUnlock) return null;

    if (achievement.rewardCurrency > 0) {
      await tx.user.update({
        where: { id: userId },
        data: { currency: { increment: achievement.rewardCurrency } },
      });
    }

    return {
      id: achievement.id,
      title: achievement.title,
      description: achievement.description,
      icon: achievement.icon,
      rarity: achievement.rarity,
      rewardCurrency: achievement.rewardCurrency,
    };
  });
}
