import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it, vi } from "vitest";

import { INTEGRATION_ADMIN_ID } from "@/test/integration-global-setup";

vi.mock("@/auth", () => ({
  auth: async () => ({
    user: { id: INTEGRATION_ADMIN_ID, name: "Integration Admin" },
  }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));

import { revokeAchievement } from "@/lib/actions/achievements";
import { advanceAchievements } from "@/lib/achievements";
import { prisma } from "@/lib/db";

const TEST_PREFIX = "Ачивки integration";

async function createStudent() {
  return prisma.user.create({
    data: {
      id: randomUUID(),
      name: `${TEST_PREFIX} ученик`,
      mentorLabel: `${TEST_PREFIX} ученик`,
      pinHash: "not-used",
      isAdmin: false,
    },
  });
}

async function createCategoryWithLessons(publishedCount: number) {
  const category = await prisma.category.create({
    data: {
      name: `${TEST_PREFIX} ${randomUUID()}`,
      lessons: {
        create: [
          { title: "Опубликованный", content: "[]", isPublished: true },
          ...Array.from({ length: publishedCount }, (_, i) => ({
            title: `Черновик ${i + 1}`,
            content: "[]",
            isPublished: false,
          })),
        ],
      },
    },
  });
  return category;
}

afterAll(async () => {
  await prisma.userAchievement.deleteMany({
    where: {
      user: { mentorLabel: { startsWith: TEST_PREFIX } },
    },
  });
  await prisma.user.deleteMany({
    where: { mentorLabel: { startsWith: TEST_PREFIX } },
  });
  await prisma.achievement.deleteMany({
    where: { title: { startsWith: TEST_PREFIX } },
  });
  await prisma.lesson.deleteMany({
    where: { category: { name: { startsWith: TEST_PREFIX } } },
  });
  await prisma.category.deleteMany({
    where: { name: { startsWith: TEST_PREFIX } },
  });
  await prisma.$disconnect();
});

describe("advanceAchievements + PostgreSQL", () => {

  it("не открывает «курс пройден», пока в курсе есть непройденные черновики", { timeout: 60_000 }, async () => {
    const category = await createCategoryWithLessons(1);
    const achievement = await prisma.achievement.create({
      data: {
        title: `${TEST_PREFIX} курс`,
        description: "пройди курс",
        metric: "category_completed",
        categoryId: category.id,
        targetValue: 1,
      },
    });
    const student = await createStudent();

    const ctx = {
      completedLessons: 1,
      level: 1,
      categoryId: category.id,
      categoryCompletedLessons: 1,
      perfectDelta: 0 as const,
    };

    const first = await advanceAchievements(student.id, ctx);
    // В тестовой базе есть сидовые ачивки («Первый запуск» и др.) — они
    // тоже могут разблокироваться, проверяем именно нашу.
    expect(first.map((card) => card.id)).not.toContain(achievement.id);
    await expect(
      prisma.userAchievement.findUnique({
        where: {
          userId_achievementId: {
            userId: student.id,
            achievementId: achievement.id,
          },
        },
      }),
    ).resolves.toMatchObject({ progress: 1, isUnlocked: false });

    const second = await advanceAchievements(student.id, {
      ...ctx,
      completedLessons: 2,
      categoryCompletedLessons: 2,
    });
    expect(second.map((card) => card.id)).toContain(achievement.id);
  });
});

describe("revokeAchievement + PostgreSQL", () => {
  it("забирает открытую ачивку, чистит витрину, монеты остаются", { timeout: 60_000 }, async () => {
    const achievement = await prisma.achievement.create({
      data: {
        title: `${TEST_PREFIX} отзыв`,
        description: "тест отзыва",
        metric: "lessons_completed",
        targetValue: 3,
        rewardCurrency: 10,
      },
    });
    const student = await createStudent();
    await prisma.user.update({
      where: { id: student.id },
      data: { currency: 25, showcaseAchievementId: achievement.id },
    });
    await prisma.userAchievement.create({
      data: {
        userId: student.id,
        achievementId: achievement.id,
        progress: 5,
        isUnlocked: true,
        unlockedAt: new Date(),
      },
    });

    const formData = new FormData();
    formData.set("achievementId", String(achievement.id));
    formData.set("userId", student.id);
    await expect(revokeAchievement(formData)).rejects.toThrow(
      `NEXT_REDIRECT:/admin/achievements/${achievement.id}?revoked=success`,
    );

    await expect(
      prisma.userAchievement.count({
        where: { userId: student.id, achievementId: achievement.id },
      }),
    ).resolves.toBe(0);
    await expect(
      prisma.user.findUniqueOrThrow({
        where: { id: student.id },
        select: { currency: true, showcaseAchievementId: true },
      }),
    ).resolves.toEqual({ currency: 25, showcaseAchievementId: null });
    await expect(
      prisma.adminAuditLog.findFirst({
        where: {
          action: "revoked",
          entityType: "achievement",
          entityId: String(achievement.id),
        },
        select: { entityLabel: true },
      }),
    ).resolves.toEqual({
      entityLabel: `${achievement.title} · ${student.name}`,
    });

    await expect(revokeAchievement(formData)).rejects.toThrow("BAD_REQUEST");
  });
});
