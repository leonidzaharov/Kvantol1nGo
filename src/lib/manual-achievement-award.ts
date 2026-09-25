import type { Prisma } from "@/generated/prisma";

export type ManualAwardResult = "awarded" | "already" | "invalid";

export async function awardManualAchievementInTransaction(
  tx: Prisma.TransactionClient,
  {
    achievementId,
    userId,
  }: {
    achievementId: number;
    userId: string;
  },
): Promise<ManualAwardResult> {
  const [achievement, student] = await Promise.all([
    tx.achievement.findFirst({
      where: {
        id: achievementId,
        metric: "manual_award",
        isActive: true,
      },
      select: { id: true, rewardCurrency: true },
    }),
    tx.user.findFirst({
      where: { id: userId, isAdmin: false },
      select: { id: true },
    }),
  ]);

  if (!achievement || !student) {
    return "invalid";
  }

  const now = new Date();
  const updated = await tx.userAchievement.updateMany({
    where: {
      userId,
      achievementId,
      isUnlocked: false,
    },
    data: {
      progress: 1,
      isUnlocked: true,
      unlockedAt: now,
      notifiedAt: null,
    },
  });

  let inserted = 0;
  if (updated.count === 0) {
    const created = await tx.userAchievement.createMany({
      data: [
        {
          userId,
          achievementId,
          progress: 1,
          isUnlocked: true,
          unlockedAt: now,
          notifiedAt: null,
        },
      ],
      skipDuplicates: true,
    });
    inserted = created.count;
  }

  const isNewAward = updated.count + inserted === 1;
  if (!isNewAward) {
    return "already";
  }

  if (achievement.rewardCurrency > 0) {
    await tx.user.update({
      where: { id: userId },
      data: { currency: { increment: achievement.rewardCurrency } },
    });
  }

  return "awarded";
}
