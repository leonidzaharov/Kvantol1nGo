"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/server-guard";
import { STUDENT_AVATARS } from "@/lib/student-avatars";
export async function chooseStudentAvatar(_state: { error?: string; success?: string } | null, formData: FormData) {
  const userId = await requireUser();
  const avatarId = String(formData.get("avatarId") ?? "");
  if (!STUDENT_AVATARS.some((avatar) => avatar.id === avatarId)) return { error: "Выберите аватар из списка." };
  const result = await prisma.user.updateMany({ where: { id: userId, isAdmin: false }, data: { avatarId } });
  if (!result.count) return { error: "Профиль ученика не найден." };
  for (const path of ["/profile", `/profile/${userId}`, "/", "/leaderboard"]) revalidatePath(path);
  return { success: "Аватар сохранён." };
}
