"use server";
import { lockStudentBalance } from "@/lib/student-balance-lock";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/server-guard";
import { COINS_PER_PIXEL, COURSE_PIXEL_LIMIT } from "@/lib/pixel-economy";
export type PixelExchangeState = { error?: string; success?: string } | null;
export async function recordPixelExchange(_previous: PixelExchangeState, data: FormData): Promise<PixelExchangeState> {
  const actorId = await requireAdmin();
  const parsed = z.object({ userId: z.uuid(), requestId: z.uuid(), pixels: z.coerce.number().int().min(1).max(COURSE_PIXEL_LIMIT), confirmed: z.literal("on") }).safeParse(Object.fromEntries(data));
  if (!parsed.success) return { error: "Укажите целое число пикселей и подтвердите внешнюю выдачу." };
  const { userId, requestId, pixels } = parsed.data;
  const coins = pixels * COINS_PER_PIXEL;
  const result = await prisma.$transaction(async (tx) => {
    // Serialise payouts for one student, including stale forms and multiple mentors.
    await lockStudentBalance(tx, userId);
    const receipt = await tx.pixelRedemption.findUnique({ where: { id: requestId } });
    if (receipt) return receipt.userId === userId && receipt.pixels === pixels && receipt.actorId === actorId ? { success: "Эта выдача уже учтена." } : { error: "Форма устарела. Обновите страницу." };
    const changed = await tx.user.updateMany({ where: { id: userId, isAdmin: false, currency: { gte: coins }, pixelsRedeemed: { lte: COURSE_PIXEL_LIMIT - pixels } }, data: { currency: { decrement: coins }, pixelsRedeemed: { increment: pixels } } });
    if (!changed.count) return { error: "Недостаточно монет, достигнут лимит 60 пикселей или ученик не найден. Обновите страницу." };
    await tx.pixelRedemption.create({ data: { id: requestId, userId, actorId, pixels, coins } });
    return { success: `Учтено ${pixels} пикселей. Списано ${coins} монет.` };
  });
  for (const path of ["/profile", "/learn", "/admin/groups"]) revalidatePath(path);
  return result;
}
