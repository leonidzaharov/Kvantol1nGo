"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { recordAdminAudit } from "@/lib/admin-audit";
import { prisma } from "@/lib/db";
import { awardManualAchievementInTransaction } from "@/lib/manual-achievement-award";
import { IdSchema, parse, requireAdmin, requireUser } from "@/lib/server-guard";

export type AchievementFormState = { error: string } | null;

const ManualAwardSchema = z.object({
  achievementId: z.coerce.number().pipe(IdSchema),
  userId: z.string().trim().min(1).max(128),
});

const AchievementFieldsSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Название не может быть пустым")
    .max(100, "Название длиннее 100 символов"),
  description: z
    .string()
    .trim()
    .min(1, "Описание не может быть пустым")
    .max(300, "Описание длиннее 300 символов"),
  // Эмодзи для карточки и витрины; пустое поле = дефолтный кубок.
  icon: z.string().trim().max(16, "Иконка — это 1–2 эмодзи").optional(),
  metric: z.enum([
    "lessons_completed",
    "category_completed",
    "level_reached",
    "perfect_lessons",
    "manual_award",
  ]),
  rarity: z.enum([
    "common",
    "uncommon",
    "rare",
    "epic",
    "legendary",
    "mythic",
  ]),
  hiddenHint: z
    .string()
    .trim()
    .max(200, "Подсказка длиннее 200 символов")
    .optional(),
  categoryId: z.coerce.number().int().positive().optional(),
  targetValue: z.coerce
    .number()
    .int("Цель — целое число")
    .min(1, "Цель — минимум 1")
    .max(10_000, "Цель слишком большая"),
  rewardCurrency: z.coerce
    .number()
    .int("Награда — целое число")
    .min(0, "Награда не может быть отрицательной")
    .max(20, "Максимальная награда — 20 монет (1 пиксель)"),
  sortOrder: z.coerce.number().int("Порядок — целое число").default(0),
});

function revalidateAchievementPages() {
  revalidatePath("/achievements");
  revalidatePath("/admin/achievements");
  revalidatePath("/profile");
  revalidatePath("/leaderboard");
}
/**
 * Создать или обновить ачивку (одна форма на оба случая, как у курсов:
 * скрытое поле id пустое → create). Только для наставника.
 */
export async function saveAchievement(
  _prev: AchievementFormState,
  formData: FormData,
): Promise<AchievementFormState> {
  const actorId = await requireAdmin();

  const fields = AchievementFieldsSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
    icon: formData.get("icon"),
    metric: formData.get("metric"),
    rarity: formData.get("rarity"),
    hiddenHint: formData.get("hiddenHint") || undefined,
    categoryId: formData.get("categoryId") || undefined,
    targetValue: formData.get("targetValue") || 1,
    rewardCurrency: formData.get("rewardCurrency") || 0,
    sortOrder: formData.get("sortOrder") || 0,
  });
  if (!fields.success) {
    return {
      error: fields.error.issues[0]?.message ?? "Проверь поля формы",
    };
  }

  const isCategoryMetric = fields.data.metric === "category_completed";
  const isManualMetric = fields.data.metric === "manual_award";
  const isHidden = formData.get("isHidden") === "on";
  if (isCategoryMetric && !fields.data.categoryId) {
    return { error: "Для ачивки «курс пройден» нужно выбрать курс" };
  }

  const rawId = String(formData.get("id") ?? "").trim();
  const id = rawId === "" ? null : parse(IdSchema, Number(rawId));

  const data = {
    title: fields.data.title,
    description: fields.data.description,
    icon: fields.data.icon || null,
    metric: fields.data.metric,
    rarity: fields.data.rarity,
    // categoryId имеет смысл только для category_completed — остальным чистим.
    categoryId: isCategoryMetric ? fields.data.categoryId! : null,
    // Для category_completed цель считается по живому числу уроков курса,
    // хранимое значение движок игнорирует — держим 1, чтобы не путать.
    targetValue:
      isCategoryMetric || isManualMetric ? 1 : fields.data.targetValue,
    rewardCurrency: fields.data.rewardCurrency,
    isHidden,
    hiddenHint: isHidden ? fields.data.hiddenHint || null : null,
    isActive: formData.get("isActive") === "on",
    sortOrder: fields.data.sortOrder,
  };

  await prisma.$transaction(async (tx) => {
    const achievement =
      id === null
        ? await tx.achievement.create({ data })
        : await tx.achievement.update({ where: { id }, data });
    await recordAdminAudit(tx, {
      actorId,
      action: id === null ? "created" : "updated",
      entityType: "achievement",
      entityId: achievement.id,
      entityLabel: achievement.title,
    });
  });

  revalidateAchievementPages();
  redirect("/admin/achievements");
}

/**
 * Удалить ачивку. Cascade снесёт прогресс учеников по ней, а витрины
 * (showcaseAchievementId) очистятся через SetNull — уже выданные монеты
 * при этом не отбираются.
 */
export async function deleteAchievement(formData: FormData): Promise<void> {
  const actorId = await requireAdmin();

  const id = parse(z.coerce.number().pipe(IdSchema), formData.get("id"));

  await prisma.$transaction(async (tx) => {
    const achievement = await tx.achievement.delete({ where: { id } });
    await recordAdminAudit(tx, {
      actorId,
      action: "deleted",
      entityType: "achievement",
      entityId: achievement.id,
      entityLabel: achievement.title,
    });
  });
  revalidateAchievementPages();
}

/**
 * Ручная выдача достижения ученику.
 *
 * updateMany + createMany(skipDuplicates) делают операцию идемпотентной:
 * даже два одновременных запроса смогут создать только одну связь и только
 * один из них начислит монеты.
 */
export async function awardManualAchievement(
  formData: FormData,
): Promise<void> {
  const actorId = await requireAdmin();

  const { achievementId, userId } = parse(ManualAwardSchema, {
    achievementId: formData.get("achievementId"),
    userId: formData.get("userId"),
  });

  const result = await prisma.$transaction(async (tx) => {
    const awardResult = await awardManualAchievementInTransaction(tx, {
      achievementId,
      userId,
    });
    if (awardResult === "awarded") {
      const [achievement, student] = await Promise.all([
        tx.achievement.findUniqueOrThrow({
          where: { id: achievementId },
          select: { title: true },
        }),
        tx.user.findUniqueOrThrow({
          where: { id: userId },
          select: { name: true },
        }),
      ]);
      await recordAdminAudit(tx, {
        actorId,
        action: "awarded",
        entityType: "achievement",
        entityId: achievementId,
        entityLabel: `${achievement.title} · ${student.name}`,
      });
    }
    return awardResult;
  });
  if (result === "invalid") {
    throw new Error("BAD_REQUEST");
  }

  revalidateAchievementPages();
  revalidatePath(`/admin/achievements/${achievementId}`);
  redirect(
    `/admin/achievements/${achievementId}?award=${
      result === "awarded" ? "success" : "already"
    }`,
  );
}

export async function acknowledgeAchievementNotifications(
  achievementIds: number[],
): Promise<void> {
  const userId = await requireUser();
  const ids = parse(z.array(IdSchema).min(1).max(3), achievementIds);

  await prisma.userAchievement.updateMany({
    where: {
      userId,
      achievementId: { in: ids },
      isUnlocked: true,
      notifiedAt: null,
    },
    data: { notifiedAt: new Date() },
  });
}

/**
 * Ученик выбирает ачивку-витрину — она показывается в профиле и рядом
 * с именем в лидерборде. Пустой id — убрать витрину. Выбрать можно
 * только СВОЮ открытую ачивку.
 */
export async function setShowcaseAchievement(
  formData: FormData,
): Promise<void> {
  const userId = await requireUser();

  const rawId = String(formData.get("achievementId") ?? "").trim();
  const achievementId =
    rawId === "" ? null : parse(z.coerce.number().pipe(IdSchema), rawId);

  if (achievementId !== null) {
    const owned = await prisma.userAchievement.findUnique({
      where: { userId_achievementId: { userId, achievementId } },
      select: { isUnlocked: true },
    });
    if (!owned?.isUnlocked) {
      throw new Error("BAD_REQUEST");
    }
  }

  await prisma.user.update({
    where: { id: userId },
    data: { showcaseAchievementId: achievementId },
  });

  revalidatePath("/achievements");
  revalidatePath("/profile");
  revalidatePath("/leaderboard");
}
