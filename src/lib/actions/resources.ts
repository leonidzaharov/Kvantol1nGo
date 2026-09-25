"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { recordAdminAudit } from "@/lib/admin-audit";
import { prisma } from "@/lib/db";
import { parseResourceInput } from "@/lib/resource-input";
import { IdSchema, parse, requireAdmin } from "@/lib/server-guard";

const IdListSchema = z.array(IdSchema).max(200);

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
    select: { id: true },
  });
  if (validGroups.length !== groupIds.length) {
    return { error: "Одна из выбранных групп не существует" };
  }

  await prisma.$transaction(async (tx) => {
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
  });

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
  await prisma.$transaction(async (tx) => {
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
  });
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
