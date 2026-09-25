"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { recordAdminAudit } from "@/lib/admin-audit";
import { IdSchema, requireAdmin, requireUser } from "@/lib/server-guard";
import {
  isNicknameAvailable,
  MentorLabelSchema,
  StudentNicknameSchema,
  StudentPinSchema,
} from "@/lib/student-identity";
import { deleteStudentRecords } from "@/lib/student-deletion";

export type StudentFormState = { error?: string; success?: string } | null;

function firstError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Проверьте введённые данные";
}

function revalidateStudentPages() {
  revalidatePath("/");
  revalidatePath("/learn");
  revalidatePath("/leaderboard");
  revalidatePath("/profile");
  revalidatePath("/admin/groups");
  revalidatePath("/admin/activity");
}

export async function configureStudentProfile(
  _previous: StudentFormState,
  formData: FormData,
): Promise<StudentFormState> {
  const userId = await requireUser();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isAdmin: true, groupId: true },
  });
  if (!user || user.isAdmin) return { error: "Профиль ученика не найден" };

  const nickname = StudentNicknameSchema.safeParse(formData.get("nickname"));
  if (!nickname.success) return { error: firstError(nickname.error) };
  const mentorLabel = MentorLabelSchema.safeParse(formData.get("mentorLabel"));
  if (!mentorLabel.success) return { error: firstError(mentorLabel.error) };

  if (
    !(await isNicknameAvailable({
      nickname: nickname.data,
      groupId: user.groupId,
      excludeUserId: userId,
    }))
  ) {
    return { error: "В этой группе такой ник уже занят. Выбери другой." };
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      name: nickname.data,
      mentorLabel: mentorLabel.data,
      profileConfiguredAt: new Date(),
    },
  });
  revalidateStudentPages();
  redirect("/profile");
}

const OptionalGroupSchema = z.union([
  z.literal(""),
  z.coerce.number().pipe(IdSchema),
]);

export async function createStudent(
  _previous: StudentFormState,
  formData: FormData,
): Promise<StudentFormState> {
  const actorId = await requireAdmin();

  const nickname = StudentNicknameSchema.safeParse(formData.get("nickname"));
  if (!nickname.success) return { error: firstError(nickname.error) };
  const mentorLabel = MentorLabelSchema.safeParse(formData.get("mentorLabel"));
  if (!mentorLabel.success) return { error: firstError(mentorLabel.error) };
  const pin = StudentPinSchema.safeParse(formData.get("pin"));
  if (!pin.success) return { error: firstError(pin.error) };
  const group = OptionalGroupSchema.safeParse(formData.get("groupId") ?? "");
  if (!group.success) return { error: "Выберите существующую группу" };
  const groupId = group.data === "" ? null : group.data;
  if (
    groupId !== null &&
    !(await prisma.group.findUnique({ where: { id: groupId }, select: { id: true } }))
  ) {
    return { error: "Группа не найдена" };
  }

  if (!(await isNicknameAvailable({ nickname: nickname.data, groupId }))) {
    return { error: "В этой группе такой временный ник уже есть" };
  }
  const pinHash = await bcrypt.hash(pin.data, 10);
  await prisma.$transaction(async (tx) => {
    const student = await tx.user.create({
      data: {
        name: nickname.data,
        mentorLabel: mentorLabel.data,
        pinHash,
        groupId,
        profileConfiguredAt: null,
      },
    });
    await recordAdminAudit(tx, {
      actorId,
      action: "created",
      entityType: "student",
      entityId: student.id,
      entityLabel: student.name,
    });
  });
  revalidateStudentPages();
  return { success: "Ученик создан. При первом входе он подтвердит свой ник." };
}

export async function updateStudent(
  _previous: StudentFormState,
  formData: FormData,
): Promise<StudentFormState> {
  const actorId = await requireAdmin();

  const userId = z.uuid().safeParse(formData.get("userId"));
  if (!userId.success) return { error: "Некорректный профиль ученика" };
  const nickname = StudentNicknameSchema.safeParse(formData.get("nickname"));
  if (!nickname.success) return { error: firstError(nickname.error) };
  const mentorLabel = MentorLabelSchema.safeParse(formData.get("mentorLabel"));
  if (!mentorLabel.success) return { error: firstError(mentorLabel.error) };
  const group = OptionalGroupSchema.safeParse(formData.get("groupId") ?? "");
  if (!group.success) return { error: "Выберите существующую группу" };
  const groupId = group.data === "" ? null : group.data;
  const rawPin = String(formData.get("pin") ?? "");
  const pin = rawPin ? StudentPinSchema.safeParse(rawPin) : null;
  if (pin && !pin.success) return { error: firstError(pin.error) };
  if (
    groupId !== null &&
    !(await prisma.group.findUnique({ where: { id: groupId }, select: { id: true } }))
  ) {
    return { error: "Группа не найдена" };
  }

  const student = await prisma.user.findFirst({
    where: { id: userId.data, isAdmin: false },
    select: { id: true },
  });
  if (!student) return { error: "Ученик не найден" };

  if (
    !(await isNicknameAvailable({
      nickname: nickname.data,
      groupId,
      excludeUserId: userId.data,
    }))
  ) {
    return { error: "В этой группе такой ник уже занят" };
  }
  const pinHash = pin?.success ? await bcrypt.hash(pin.data, 10) : null;
  await prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id: userId.data },
      data: {
        name: nickname.data,
        mentorLabel: mentorLabel.data,
        groupId,
        ...(pin?.success ? { pinHash: pinHash! } : {}),
      },
    });
    await recordAdminAudit(tx, {
      actorId,
      action: "updated",
      entityType: "student",
      entityId: updated.id,
      entityLabel: updated.name,
    });
    if (pin?.success) {
      await recordAdminAudit(tx, {
        actorId,
        action: "pin_reset",
        entityType: "student",
        entityId: updated.id,
        entityLabel: updated.name,
      });
    }
  });
  revalidateStudentPages();
  return { success: "Изменения сохранены" };
}

/** Удалить профиль ученика и все связанные с ним данные. */
export async function deleteStudent(formData: FormData): Promise<void> {
  const actorId = await requireAdmin();
  const userId = z.uuid().parse(formData.get("userId"));

  const deleted = await prisma.$transaction(async (tx) => {
    const student = await tx.user.findFirst({
      where: { id: userId, isAdmin: false },
      select: { id: true, name: true },
    });
    if (!student) return false;

    await deleteStudentRecords(tx, [student.id]);
    await recordAdminAudit(tx, {
      actorId,
      action: "deleted",
      entityType: "student",
      entityId: student.id,
      entityLabel: student.name,
    });
    return true;
  });

  if (deleted) revalidateStudentPages();
}
