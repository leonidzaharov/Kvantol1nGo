import { notFound } from "next/navigation";
import { z } from "zod";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";

/**
 * Достаёт userId из текущей сессии. Бросает UNAUTHORIZED, если её нет.
 * Используется в Server Actions вместо ручного `await auth()` — гарантия,
 * что **никакой экшен не принимает userId аргументом**: только из сессии.
 */
export async function requireUser(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("UNAUTHORIZED");
  }
  return session.user.id;
}

/**
 * Как requireUser, но дополнительно требует права админа (наставника).
 * Флаг читаем из БД по каждому вызову, а не из JWT: сессия живёт до 8 часов,
 * и снятый флаг должен действовать сразу, без ожидания перелогина.
 */
export async function requireAdmin(): Promise<string> {
  const userId = await requireUser();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isAdmin: true },
  });
  if (!user?.isAdmin) {
    throw new Error("FORBIDDEN");
  }
  return userId;
}

/**
 * Вариант requireAdmin для СТРАНИЦ админки: вместо исключения отдаёт 404,
 * чтобы ученики даже не знали, что /admin существует. (Неавторизованных
 * на /admin не пускает middleware — см. auth.config.ts.)
 */
export async function requireAdminOr404(): Promise<string> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    notFound();
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isAdmin: true },
  });
  if (!user?.isAdmin) {
    notFound();
  }
  return userId;
}

/**
 * Runtime-валидация аргументов Server Action. RPC-канал Next.js пропускает
 * любую сериализуемую полезную нагрузку — без zod ничто не мешает клиенту
 * послать `itemId = NaN` или `"DROP TABLE"`. Бросаем BAD_REQUEST, фронт ловит.
 */
export function parse<T extends z.ZodTypeAny>(
  schema: T,
  input: unknown,
): z.infer<T> {
  const r = schema.safeParse(input);
  if (!r.success) {
    throw new Error("BAD_REQUEST");
  }
  return r.data;
}

// Общие схемы — реиспользуемые id-валидаторы.
export const IdSchema = z.number().int().positive().max(1_000_000);
