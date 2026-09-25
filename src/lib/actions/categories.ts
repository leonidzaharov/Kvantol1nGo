"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { recordAdminAudit } from "@/lib/admin-audit";
import { prisma } from "@/lib/db";
import { IdSchema, parse, requireAdmin } from "@/lib/server-guard";

export type CategoryFormState = { error: string } | null;

const CategoryFieldsSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Название не может быть пустым")
    .max(100, "Название длиннее 100 символов"),
  // Эмодзи-иконка на карточке курса; пустое поле = дефолтная 📚.
  icon: z.string().trim().max(16, "Иконка — это 1–2 эмодзи").optional(),
  track: z.enum(["intro", "advanced", "project"]),
});

function revalidateCategoryPages() {
  revalidatePath("/courses");
  revalidatePath("/learn");
  revalidatePath("/admin/categories");
  revalidatePath("/admin/lessons");
}

/**
 * Создать или обновить курс-модуль (одна форма на оба случая, как у уроков:
 * скрытое поле id пустое → create). Только для наставника.
 */
export async function saveCategory(
  _prev: CategoryFormState,
  formData: FormData,
): Promise<CategoryFormState> {
  const actorId = await requireAdmin();

  const fields = CategoryFieldsSchema.safeParse({
    name: formData.get("name"),
    icon: formData.get("icon"),
    track: formData.get("track"),
  });
  if (!fields.success) {
    return {
      error: fields.error.issues[0]?.message ?? "Проверь поля формы",
    };
  }

  const rawId = String(formData.get("id") ?? "").trim();
  const id = rawId === "" ? null : parse(IdSchema, Number(rawId));

  const data = {
    name: fields.data.name,
    icon: fields.data.icon || null,
    track: fields.data.track,
  };

  if (id === null) {
    const created = await prisma.$transaction(async (tx) => {
      const category = await tx.category.create({ data });
      await recordAdminAudit(tx, {
        actorId,
        action: "created",
        entityType: "course",
        entityId: category.id,
        entityLabel: category.name,
      });
      return category;
    });
    revalidateCategoryPages();
    redirect(`/admin/categories/${created.id}`);
  } else {
    await prisma.$transaction(async (tx) => {
      const category = await tx.category.update({ where: { id }, data });
      await tx.categoryGroupAssignment.deleteMany({
        where: { categoryId: id, group: { track: { not: data.track } } },
      });
      await tx.lessonGroupAssignment.deleteMany({
        where: {
          lesson: { categoryId: id },
          group: { track: { not: data.track } },
        },
      });
      await recordAdminAudit(tx, {
        actorId,
        action: "updated",
        entityType: "course",
        entityId: category.id,
        entityLabel: category.name,
      });
    });
  }

  revalidateCategoryPages();
  redirect("/admin/categories");
}

/** Удалить курс, его уроки и прогресс по этим урокам одной транзакцией. */
export async function deleteCategory(formData: FormData): Promise<void> {
  const actorId = await requireAdmin();

  const id = parse(z.coerce.number().pipe(IdSchema), formData.get("id"));

  await prisma.$transaction(async (tx) => {
    const category = await tx.category.findUniqueOrThrow({ where: { id } });
    await tx.userLessonProgress.deleteMany({
      where: { lesson: { categoryId: id } },
    });
    await tx.lesson.deleteMany({ where: { categoryId: id } });
    await tx.category.delete({ where: { id } });
    await recordAdminAudit(tx, {
      actorId,
      action: "deleted",
      entityType: "course",
      entityId: category.id,
      entityLabel: category.name,
    });
  });
  revalidateCategoryPages();
}
