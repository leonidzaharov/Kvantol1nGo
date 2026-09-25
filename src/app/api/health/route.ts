import { prisma } from "@/lib/db";

// Проверка «живости» для внешнего монитора (UptimeRobot/BetterStack и т.п.):
// пингует БД одним лёгким запросом. 200 — всё хорошо, 503 — база недоступна,
// монитор пришлёт алерт. Публичный (не под /admin, секретов не отдаёт).
export const dynamic = "force-dynamic"; // никогда не кэшировать — нужна свежая проверка

export async function GET(): Promise<Response> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ ok: true, db: "up", time: new Date().toISOString() });
  } catch {
    return Response.json(
      { ok: false, db: "down", time: new Date().toISOString() },
      { status: 503 },
    );
  }
}
