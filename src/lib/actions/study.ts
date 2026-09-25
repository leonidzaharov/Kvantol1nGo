"use server";

import { revalidatePath } from "next/cache";

import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/db";
import { canAccessResource } from "@/lib/resource-access";
import { IdSchema, parse, requireUser } from "@/lib/server-guard";

export type StudyResourceResult = {
  /** Сколько монет начислено этим нажатием (0 — уже изучал раньше). */
  gainedCoins: number;
};

/**
 * Отметка «Изучил» на материале «Интересного»: одноразово начисляет
 * ученику монеты материала. Повторное нажатие (и гонка двух вкладок)
 * безопасны: уникальный PK (userId, resourceId) в UserResource не даст
 * создать вторую отметку, а монеты начисляются в той же транзакции.
 */
export async function studyResource(
  resourceId: number,
): Promise<StudyResourceResult> {
  const userId = await requireUser();
  resourceId = parse(IdSchema, resourceId);
  if (!(await canAccessResource(userId, resourceId))) {
    throw new Error("FORBIDDEN");
  }

  const resource = await prisma.resource.findUnique({
    where: { id: resourceId },
    select: { coinReward: true },
  });
  if (!resource) {
    throw new Error("BAD_REQUEST");
  }

  try {
    await prisma.$transaction([
      prisma.userResource.create({ data: { userId, resourceId } }),
      prisma.user.update({
        where: { id: userId },
        data: { currency: { increment: resource.coinReward } },
      }),
    ]);
  } catch (e) {
    // P2002 = нарушение уникальности: отметка уже есть, монеты не начислять.
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      return { gainedCoins: 0 };
    }
    throw e;
  }

  revalidatePath("/interesting");
  revalidatePath("/learn"); // счётчик монет в шапке
  revalidatePath("/profile"); // стат «Монеты»

  return { gainedCoins: resource.coinReward };
}
