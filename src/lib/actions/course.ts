"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/db";
import { ACTIVE_COURSE_COOKIE } from "@/lib/active-course";
import { requireUser } from "@/lib/server-guard";
import { canAccessCategory } from "@/lib/course-access";

/**
 * Делает категорию активным курсом: пишет её id в cookie и ведёт на /learn.
 * Вызывается из клиентского списка курсов (`courses/list.tsx`).
 *
 * Доверять id с клиента нельзя — валидируем формат и существование категории
 * (см. server-guard: RPC-канал Next пропускает любую полезную нагрузку).
 */
export async function setActiveCourse(categoryId: number): Promise<void> {
  const userId = await requireUser(); // только залогиненный пользователь меняет курс

  if (!Number.isInteger(categoryId) || categoryId <= 0) {
    throw new Error("BAD_REQUEST");
  }
  const category = await prisma.category.findUnique({
    where: { id: categoryId },
    select: { id: true },
  });
  if (!category) {
    throw new Error("BAD_REQUEST");
  }
  // Курс чужого направления выбрать нельзя (даже подделанным запросом).
  if (!(await canAccessCategory(userId, categoryId))) {
    throw new Error("FORBIDDEN");
  }

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_COURSE_COOKIE, String(categoryId), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // год
  });

  // redirect() бросает специальное исключение — НЕ оборачивать в try/catch.
  redirect("/learn");
}
