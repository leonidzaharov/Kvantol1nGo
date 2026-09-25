"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { recordAdminAudit } from "@/lib/admin-audit";
import { prisma } from "@/lib/db";
import { IdSchema, parse, requireAdmin } from "@/lib/server-guard";
import { deleteStudentRecords } from "@/lib/student-deletion";

export type GroupFormState = { error: string } | null;

const GroupNameSchema = z
  .string()
  .trim()
  .min(1, "Название не может быть пустым")
  .max(32, "Название длиннее 32 символов");

const TrackSchema = z.enum(["intro", "advanced", "project"]);

function revalidateGroupPages() {
  revalidatePath("/"); // экран входа показывает группы
  revalidatePath("/admin/groups");
}

/** Создать группу (имя + направление). Только для админа. */
export async function createGroup(
  _prev: GroupFormState,
  formData: FormData,
): Promise<GroupFormState> {
  const actorId = await requireAdmin();

  const name = GroupNameSchema.safeParse(formData.get("name"));
  if (!name.success) {
    return { error: name.error.issues[0]?.message ?? "Некорректное название" };
  }
  const track = TrackSchema.safeParse(formData.get("track"));
  if (!track.success) {
    return { error: "Выбери направление" };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const group = await tx.group.create({
        data: { name: name.data, track: track.data },
      });
      await recordAdminAudit(tx, {
        actorId,
        action: "created",
        entityType: "group",
        entityId: group.id,
        entityLabel: group.name,
      });
    });
  } catch (err) {
    // P2002 — нарушение уникальности имени. Показываем человеческое
    // сообщение вместо страницы ошибки.
    if (
      err instanceof Error &&
      "code" in err &&
      (err as { code?: string }).code === "P2002"
    ) {
      return { error: `Группа «${name.data}» уже существует` };
    }
    throw err;
  }

  revalidateGroupPages();
  return null;
}

/** Удалить группу, её учеников и все связанные с ними данные. */
export async function deleteGroup(formData: FormData): Promise<void> {
  const actorId = await requireAdmin();

  const id = parse(z.coerce.number().pipe(IdSchema), formData.get("id"));

  const deleted = await prisma.$transaction(async (tx) => {
    const group = await tx.group.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        students: {
          where: { isAdmin: false },
          select: { id: true },
        },
      },
    });
    if (!group) return false;

    await deleteStudentRecords(
      tx,
      group.students.map((student) => student.id),
    );
    await tx.group.delete({ where: { id: group.id } });
    await recordAdminAudit(tx, {
      actorId,
      action: "deleted",
      entityType: "group",
      entityId: group.id,
      entityLabel: group.name,
    });
    return true;
  });
  if (!deleted) return;

  revalidateGroupPages();
}

const AssignSchema = z.object({
  userId: z.uuid(),
  groupId: IdSchema.nullable(),
});

/**
 * Назначить ученика в группу (или убрать из группы — groupId = null).
 * Вызывается селектом из списка учеников в /admin/groups.
 */
export async function assignStudentGroup(input: {
  userId: string;
  groupId: number | null;
}): Promise<void> {
  const actorId = await requireAdmin();

  const { userId, groupId } = parse(AssignSchema, input);

  // update по несуществующим userId/groupId бросит Prisma-ошибку — это
  // нормально: так бывает только при рассинхроне вкладок.
  await prisma.$transaction(async (tx) => {
    const student = await tx.user.update({
      where: { id: userId },
      data: { groupId },
    });
    await recordAdminAudit(tx, {
      actorId,
      action: "audience_updated",
      entityType: "student",
      entityId: student.id,
      entityLabel: student.name,
    });
  });

  revalidateGroupPages();
}
