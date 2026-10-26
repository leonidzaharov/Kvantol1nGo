"use server";

import { revalidatePath } from "next/cache";

import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/db";
import { canAccessResource } from "@/lib/resource-access";
import { resourcePracticeLessonId } from "@/lib/resource-practice";
import { IdSchema, parse, requireUser } from "@/lib/server-guard";

export type StudyResourceResult = {
  /** Сколько монет начислено этим нажатием (0 — уже изучал раньше). */
  gainedCoins: number;
};

const resourceTable = Prisma.raw(`"${(process.env.DATABASE_SCHEMA ?? "public").replaceAll('"', '""')}"."Resource"`);

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

  let gainedCoins = 0;
  try {
    gainedCoins = await prisma.$transaction(async (tx) => {
      // Serializes classification with resource edits, including conversion to practice.
      await tx.$executeRaw`SELECT id FROM ${resourceTable} WHERE id = ${resourceId} FOR SHARE`;
      const resource = await tx.resource.findUnique({
        where: { id: resourceId }, select: { type: true, url: true, coinReward: true },
      });
      if (!resource) throw new Error("BAD_REQUEST");
      if (resourcePracticeLessonId(resource) !== null) throw new Error("PRACTICE_REQUIRES_COMPLETION");
      await tx.userResource.create({ data: { userId, resourceId } });
      await tx.user.update({
        where: { id: userId },
        data: { currency: { increment: resource.coinReward } },
      });
      return resource.coinReward;
    });
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

  return { gainedCoins };
}
