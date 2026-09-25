import type { Prisma } from "@/generated/prisma";
import { describe, expect, it, vi } from "vitest";

import { awardManualAchievementInTransaction } from "./manual-achievement-award";

function createTransaction({
  existingLockedRows = 0,
  insertedRows = 1,
  rewardCurrency = 5,
}: {
  existingLockedRows?: number;
  insertedRows?: number;
  rewardCurrency?: number;
} = {}) {
  const transaction = {
    achievement: {
      findFirst: vi.fn().mockResolvedValue({
        id: 7,
        rewardCurrency,
      }),
    },
    user: {
      findFirst: vi.fn().mockResolvedValue({ id: "student-1" }),
      update: vi.fn().mockResolvedValue({}),
    },
    userAchievement: {
      updateMany: vi.fn().mockResolvedValue({ count: existingLockedRows }),
      createMany: vi.fn().mockResolvedValue({ count: insertedRows }),
    },
  };

  return transaction;
}

describe("awardManualAchievementInTransaction", () => {
  it("выдает достижение и начисляет награду ровно один раз", async () => {
    const tx = createTransaction();

    await expect(
      awardManualAchievementInTransaction(
        tx as unknown as Prisma.TransactionClient,
        { achievementId: 7, userId: "student-1" },
      ),
    ).resolves.toBe("awarded");

    expect(tx.userAchievement.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true }),
    );
    expect(tx.user.update).toHaveBeenCalledOnce();
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: "student-1" },
      data: { currency: { increment: 5 } },
    });
  });

  it("при повторной выдаче не дублирует достижение и награду", async () => {
    const tx = createTransaction({ insertedRows: 0 });

    await expect(
      awardManualAchievementInTransaction(
        tx as unknown as Prisma.TransactionClient,
        { achievementId: 7, userId: "student-1" },
      ),
    ).resolves.toBe("already");

    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it("разблокирует заранее созданную запись и не создает вторую", async () => {
    const tx = createTransaction({ existingLockedRows: 1 });

    await expect(
      awardManualAchievementInTransaction(
        tx as unknown as Prisma.TransactionClient,
        { achievementId: 7, userId: "student-1" },
      ),
    ).resolves.toBe("awarded");

    expect(tx.userAchievement.createMany).not.toHaveBeenCalled();
    expect(tx.user.update).toHaveBeenCalledOnce();
  });
});
