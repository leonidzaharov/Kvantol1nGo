import "server-only";

import { z } from "zod";

import { prisma } from "@/lib/db";

const collapseSpaces = (value: string) => value.trim().replace(/\s+/g, " ");

export const StudentNicknameSchema = z
  .string()
  .transform(collapseSpaces)
  .pipe(
    z
      .string()
      .min(2, "Ник должен содержать хотя бы 2 символа")
      .max(24, "Ник не должен быть длиннее 24 символов")
      .regex(
        /^[\p{L}\p{N} _-]+$/u,
        "В нике можно использовать буквы, цифры, пробел, дефис и подчёркивание",
      ),
  );

export const MentorLabelSchema = z
  .string()
  .transform(collapseSpaces)
  .pipe(
    z
      .string()
      .min(2, "Подпись должна содержать хотя бы 2 символа")
      .max(40, "Подпись не должна быть длиннее 40 символов")
      .regex(
        /^[\p{L}\p{N} .,'’()_-]+$/u,
        "В подписи есть недопустимые символы",
      ),
  );

export const StudentPinSchema = z
  .string()
  .regex(/^\d{4}$/, "PIN ученика должен состоять ровно из 4 цифр");

export function mentorStudentName(user: {
  name: string;
  mentorLabel: string | null;
}): string {
  return user.mentorLabel?.trim() || user.name;
}

export async function isNicknameAvailable({
  nickname,
  groupId,
  excludeUserId,
}: {
  nickname: string;
  groupId: number | null;
  excludeUserId?: string;
}): Promise<boolean> {
  const existing = await prisma.user.findFirst({
    where: {
      isAdmin: false,
      groupId,
      ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
      name: { equals: nickname, mode: "insensitive" },
    },
    select: { id: true },
  });
  return !existing;
}
