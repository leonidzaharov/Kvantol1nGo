"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Prisma } from "@/generated/prisma";

import { recordAdminAudit } from "@/lib/admin-audit";
import { prisma } from "@/lib/db";
import { parseResourceInput } from "@/lib/resource-input";
import { resourcePracticeLessonId } from "@/lib/resource-practice";
import { isPracticeContent, parseLessonDocument } from "@/lib/lesson-document";
import { lessonIsAccessible } from "@/lib/course-access-logic";
import { IdSchema, parse, requireAdmin } from "@/lib/server-guard";

const IdListSchema = z.array(IdSchema).max(200);

const resourceTable = Prisma.raw(`"${(process.env.DATABASE_SCHEMA ?? "public").replaceAll('"', '""')}"."Resource"`);
const lessonTable = Prisma.raw(`"${(process.env.DATABASE_SCHEMA ?? "public").replaceAll('"', '""')}"."Lesson"`);

async function practiceTargetError(
  tx: Prisma.TransactionClient,
  lessonId: number,
  groups: { id: number; track: "intro" | "advanced" | "project" }[],
  publishing: boolean,
): Promise<string | null> {
  // A content edit or deletion must wait until the link validation finishes.
  await tx.$executeRaw`SELECT id FROM ${lessonTable} WHERE id = ${lessonId} FOR SHARE`;
  const lesson = await tx.lesson.findUnique({
    where: { id: lessonId },
    select: {
      content: true, isPublished: true,
      groupRestrictions: { select: { groupId: true } },
      category: { select: { isPublished: true, track: true, groupAccess: { select: { groupId: true } } } },
    },
  });
  if (!lesson) return "Связанный урок не найден. Проверь ссылку на практику.";
  const content = parseLessonDocument(lesson.content);
  if (!content || !isPracticeContent(content)) return "По этой ссылке нужен урок формата «Практика с разбором и повторением».";
  if (!publishing) return null;
  if (!lesson.isPublished || !lesson.category.isPublished) return "Сначала опубликуй связанную практику и её курс.";
  const target = {
    isPublished: lesson.isPublished,
    restrictedGroupIds: lesson.groupRestrictions.map((item) => item.groupId),
    category: { ...lesson.category, groupIds: lesson.category.groupAccess.map((item) => item.groupId) },
  };
  if (groups.some((group) => !lessonIsAccessible({ isAdmin: false, groupId: group.id, track: group.track }, target))) {
    return "Связанная практика недоступна одной из выбранных групп. Проверь курс и аудиторию урока.";
  }
  return null;
}

// Состояние формы для useActionState: null — ещё не отправляли/успех,
// { error } — что показать под формой. Успех заканчивается redirect'ом,
// поэтому «успешного» состояния у формы нет.
export type ResourceFormState = { error: string } | null;

/**
 * Создать или обновить материал «Интересного» (одна форма на оба случая:
 * скрытое поле id пустое → create, иначе → update). Только для админа.
 */
export async function saveResource(
  _prev: ResourceFormState,
  formData: FormData,
): Promise<ResourceFormState> {
  const actorId = await requireAdmin();

  const parsed = parseResourceInput({
    type: formData.get("type"),
    title: formData.get("title"),
    description: formData.get("description"),
    url: formData.get("url"),
    body: formData.get("body"),
    coinReward: formData.get("coinReward"),
    sortOrder: formData.get("sortOrder"),
  });
  if (!parsed.ok) {
    return { error: parsed.error };
  }

  const rawId = String(formData.get("id") ?? "").trim();
  const id = rawId === "" ? null : parse(IdSchema, Number(rawId));
  const groupIds = parse(
    IdListSchema,
    formData.getAll("groupId").map(Number),
  );
  const { sortOrder } = parsed.data;

  const validGroups = await prisma.group.findMany({
    where: { id: { in: groupIds } },
    select: { id: true, track: true },
  });
  if (validGroups.length !== groupIds.length) {
    return { error: "Одна из выбранных групп не существует" };
  }

  const validation = await prisma.$transaction(async (tx) => {
    if (id !== null) await tx.$executeRaw`SELECT id FROM ${resourceTable} WHERE id = ${id} FOR UPDATE`;
    const existing = id === null ? null : await tx.resource.findUnique({ where: { id }, select: { isPublished: true } });
    if (id !== null && !existing) return { error: "Материал не найден." };
    const lessonId = resourcePracticeLessonId(parsed.data);
    if (lessonId !== null) {
      const error = await practiceTargetError(tx, lessonId, validGroups, existing?.isPublished ?? false);
      if (error) return { error };
    }
    // Автосдвиг: вставка в занятое место сдвигает хвост списка.
    const occupied = await tx.resource.findFirst({
      where: { sortOrder, ...(id !== null && { NOT: { id } }) },
      select: { id: true },
    });
    if (occupied) {
      await tx.resource.updateMany({
        where: {
          sortOrder: { gte: sortOrder },
          ...(id !== null && { NOT: { id } }),
        },
        data: { sortOrder: { increment: 1 } },
      });
    }

    const resource =
      id === null
        ? await tx.resource.create({
            data: { ...parsed.data, isPublished: false },
            select: { id: true, title: true },
          })
        : await tx.resource.update({
            where: { id },
            data: parsed.data,
            select: { id: true, title: true },
          });

    await tx.resourceGroupAssignment.deleteMany({
      where: { resourceId: resource.id },
    });
    if (groupIds.length > 0) {
      await tx.resourceGroupAssignment.createMany({
        data: groupIds.map((groupId) => ({
          resourceId: resource.id,
          groupId,
        })),
      });
    }
    await recordAdminAudit(tx, {
      actorId,
      action: id === null ? "created" : "updated",
      entityType: "resource",
      entityId: resource.id,
      entityLabel: resource.title,
    });
    return null;
  });

  if (validation) return validation;

  revalidatePath("/interesting");
  revalidatePath("/admin/resources");
  redirect("/admin/resources");
}

export async function toggleResourcePublication(
  formData: FormData,
): Promise<void> {
  const actorId = await requireAdmin();
  const id = parse(z.coerce.number().pipe(IdSchema), formData.get("id"));
  const isPublished = formData.get("isPublished") === "true";
  const validation = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT id FROM ${resourceTable} WHERE id = ${id} FOR UPDATE`;
    const current = await tx.resource.findUnique({ where: { id }, include: { groupAccess: { select: { group: { select: { id: true, track: true } } } } } });
    if (!current) return "Материал не найден.";
    const lessonId = resourcePracticeLessonId(current);
    if (isPublished && lessonId !== null) {
      const error = await practiceTargetError(tx, lessonId, current.groupAccess.map((item) => item.group), true);
      if (error) return error;
    }
    const resource = await tx.resource.update({
      where: { id },
      data: { isPublished },
    });
    await recordAdminAudit(tx, {
      actorId,
      action: isPublished ? "published" : "unpublished",
      entityType: "resource",
      entityId: resource.id,
      entityLabel: resource.title,
    });
    return null;
  });
  if (validation) redirect(`/admin/resources?error=${encodeURIComponent(validation)}`);
  revalidatePath("/interesting");
  revalidatePath("/admin/resources");
}

/** Удалить материал. Только для админа. Вызывается формой из списка. */
export async function deleteResource(formData: FormData): Promise<void> {
  const actorId = await requireAdmin();

  const id = parse(
    z.coerce.number().pipe(IdSchema),
    formData.get("id"),
  );
  await prisma.$transaction(async (tx) => {
    const resource = await tx.resource.delete({ where: { id } });
    await recordAdminAudit(tx, {
      actorId,
      action: "deleted",
      entityType: "resource",
      entityId: resource.id,
      entityLabel: resource.title,
    });
  });

  revalidatePath("/interesting");
  revalidatePath("/admin/resources");
}
