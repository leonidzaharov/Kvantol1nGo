"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { recordAdminAudit } from "@/lib/admin-audit";
import { prisma } from "@/lib/db";
import { IdSchema, parse, requireAdmin } from "@/lib/server-guard";

const IdListSchema = z.array(IdSchema).max(200);

function refreshProgram() {
  revalidatePath("/courses");
  revalidatePath("/learn");
  revalidatePath("/admin/categories");
  revalidatePath("/admin/lessons");
  revalidatePath("/lesson/[id]", "page");
}

export async function toggleCategoryPublication(
  formData: FormData,
): Promise<void> {
  const actorId = await requireAdmin();
  const id = parse(z.coerce.number().pipe(IdSchema), formData.get("id"));
  const isPublished = formData.get("isPublished") === "true";
  await prisma.$transaction(async (tx) => {
    const category = await tx.category.update({
      where: { id },
      data: { isPublished },
    });
    await recordAdminAudit(tx, {
      actorId,
      action: isPublished ? "published" : "unpublished",
      entityType: "course",
      entityId: category.id,
      entityLabel: category.name,
    });
  });
  refreshProgram();
}

export async function toggleLessonPublication(
  formData: FormData,
): Promise<void> {
  const actorId = await requireAdmin();
  const id = parse(z.coerce.number().pipe(IdSchema), formData.get("id"));
  const isPublished = formData.get("isPublished") === "true";
  await prisma.$transaction(async (tx) => {
    const lesson = await tx.lesson.update({
      where: { id },
      data: { isPublished },
    });
    await recordAdminAudit(tx, {
      actorId,
      action: isPublished ? "published" : "unpublished",
      entityType: "lesson",
      entityId: lesson.id,
      entityLabel: lesson.title,
    });
  });
  refreshProgram();
}

export type AccessFormState = { error?: string; success?: string } | null;

export async function saveCategoryGroups(
  _previous: AccessFormState,
  formData: FormData,
): Promise<AccessFormState> {
  const actorId = await requireAdmin();
  const categoryId = parse(
    z.coerce.number().pipe(IdSchema),
    formData.get("categoryId"),
  );
  const groupIds = parse(
    IdListSchema,
    formData.getAll("groupId").map(Number),
  );
  const category = await prisma.category.findUnique({
    where: { id: categoryId },
    select: { track: true, name: true },
  });
  if (!category) return { error: "Курс не найден" };

  const validGroups = await prisma.group.findMany({
    where: { id: { in: groupIds }, track: category.track },
    select: { id: true },
  });
  if (validGroups.length !== groupIds.length) {
    return { error: "Одна из групп не относится к направлению курса" };
  }

  const validIds = validGroups.map((group) => group.id);
  await prisma.$transaction(async (tx) => {
    await tx.categoryGroupAssignment.deleteMany({ where: { categoryId } });
    if (validIds.length > 0) {
      await tx.categoryGroupAssignment.createMany({
        data: validIds.map((groupId) => ({ categoryId, groupId })),
      });
    }
    await tx.lessonGroupAssignment.deleteMany({
      where: {
        lesson: { categoryId },
        ...(validIds.length > 0 ? { groupId: { notIn: validIds } } : {}),
      },
    });
    await recordAdminAudit(tx, {
      actorId,
      action: "audience_updated",
      entityType: "course",
      entityId: categoryId,
      entityLabel: category.name,
    });
  });
  refreshProgram();
  return { success: "Доступ групп сохранён" };
}

export async function saveLessonGroups(
  _previous: AccessFormState,
  formData: FormData,
): Promise<AccessFormState> {
  const actorId = await requireAdmin();
  const lessonId = parse(
    z.coerce.number().pipe(IdSchema),
    formData.get("lessonId"),
  );
  const restricted = formData.get("restricted") === "true";
  const requestedIds = restricted
    ? parse(IdListSchema, formData.getAll("groupId").map(Number))
    : [];

  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: {
      title: true,
      category: {
        select: { groupAccess: { select: { groupId: true } } },
      },
    },
  });
  if (!lesson) return { error: "Урок не найден" };

  const allowedIds = new Set(
    lesson.category.groupAccess.map((item) => item.groupId),
  );
  if (requestedIds.some((id) => !allowedIds.has(id))) {
    return { error: "Урок можно назначить только группам его курса" };
  }
  if (restricted && requestedIds.length === 0) {
    return { error: "Выберите хотя бы одну группу или включите все группы курса" };
  }

  await prisma.$transaction(async (tx) => {
    await tx.lessonGroupAssignment.deleteMany({ where: { lessonId } });
    if (requestedIds.length > 0) {
      await tx.lessonGroupAssignment.createMany({
        data: requestedIds.map((groupId) => ({ lessonId, groupId })),
      });
    }
    await recordAdminAudit(tx, {
      actorId,
      action: "audience_updated",
      entityType: "lesson",
      entityId: lessonId,
      entityLabel: lesson.title,
    });
  });
  refreshProgram();
  return { success: "Аудитория урока сохранена" };
}

export async function duplicateLesson(formData: FormData): Promise<void> {
  const actorId = await requireAdmin();
  const id = parse(z.coerce.number().pipe(IdSchema), formData.get("id"));
  const source = await prisma.lesson.findUnique({
    where: { id },
    include: { groupRestrictions: { select: { groupId: true } } },
  });
  if (!source) throw new Error("BAD_REQUEST");

  const copy = await prisma.$transaction(async (tx) => {
    await tx.lesson.updateMany({
      where: {
        categoryId: source.categoryId,
        sortOrder: { gt: source.sortOrder },
      },
      data: { sortOrder: { increment: 1 } },
    });
    const lesson = await tx.lesson.create({
      data: {
        categoryId: source.categoryId,
        title: `${source.title} — копия`,
        content: source.content,
        xpReward: source.xpReward,
        coinReward: source.coinReward,
        sortOrder: source.sortOrder + 1,
        isPublished: false,
        groupRestrictions: {
          create: source.groupRestrictions.map(({ groupId }) => ({ groupId })),
        },
      },
      select: { id: true, title: true },
    });
    await recordAdminAudit(tx, {
      actorId,
      action: "created",
      entityType: "lesson",
      entityId: lesson.id,
      entityLabel: lesson.title,
    });
    return lesson;
  });
  refreshProgram();
  redirect(`/admin/lessons/${copy.id}`);
}

export async function duplicateCategory(formData: FormData): Promise<void> {
  const actorId = await requireAdmin();
  const id = parse(z.coerce.number().pipe(IdSchema), formData.get("id"));
  const source = await prisma.category.findUnique({
    where: { id },
    include: {
      groupAccess: { select: { groupId: true } },
      lessons: {
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        include: { groupRestrictions: { select: { groupId: true } } },
      },
    },
  });
  if (!source) throw new Error("BAD_REQUEST");

  const copy = await prisma.$transaction(async (tx) => {
    const category = await tx.category.create({
      data: {
        name: `${source.name} — копия`,
        icon: source.icon,
        track: source.track,
        isPublished: false,
        groupAccess: {
          create: source.groupAccess.map(({ groupId }) => ({ groupId })),
        },
      },
      select: { id: true, name: true },
    });
    for (const lesson of source.lessons) {
      await tx.lesson.create({
        data: {
          categoryId: category.id,
          title: lesson.title,
          content: lesson.content,
          xpReward: lesson.xpReward,
          coinReward: lesson.coinReward,
          sortOrder: lesson.sortOrder,
          isPublished: false,
          groupRestrictions: {
            create: lesson.groupRestrictions.map(({ groupId }) => ({ groupId })),
          },
        },
      });
    }
    await recordAdminAudit(tx, {
      actorId,
      action: "created",
      entityType: "course",
      entityId: category.id,
      entityLabel: category.name,
    });
    return category;
  });
  refreshProgram();
  redirect(`/admin/categories/${copy.id}`);
}
