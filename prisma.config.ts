// CLI-конфиг Prisma (migrate / generate / db push). Не используется рантаймом.
// Рантайм-клиент (src/lib/db.ts) сам создаёт PrismaPg-адаптер с DATABASE_URL.
//
// Для миграций предпочитаем DIRECT_URL (прямое соединение к Postgres),
// потому что pgbouncer transaction mode ломает advisory locks Prisma migrate.
// Если DIRECT_URL не задан — fallback на DATABASE_URL (для локального dev без пулера).
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    // ⚠️ seed.ts чистит каталог перед пересозданием → снесёт UserLessonProgress.
    // Для продакшена задайте SEED_FORCE=1, иначе скрипт прервётся с предупреждением.
    seed: "npx tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"],
  },
});
