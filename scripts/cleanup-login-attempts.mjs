#!/usr/bin/env node
// ============================================================
// Очистка таблицы LoginAttempt.
//
// LoginAttempt не имеет FK на User (намеренно — чтобы не блокировать
// логирование попыток с несуществующими userId и позволять каскадное
// удаление пользователей). Обратная сторона: при удалении профиля
// осиротевшие записи остаются.
//
// Этот скрипт:
//   1. Удаляет все попытки старше 24 часов (rate-limit окно = 15 мин,
//      значит за пределами 24 ч записи бесполезны).
//   2. Удаляет попытки, чей userId не существует в таблице User
//      (осиротевшие записи после удаления профилей).
//
// Запуск:
//   node scripts/cleanup-login-attempts.mjs
//
// Для автоматизации: Vercel Cron Jobs (vercel.json → crons) или
// ленивый вызов из auth.ts раз в N логинов.
// ============================================================

import "dotenv/config";
import pg from "pg";

const databaseUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("❌ Задайте DIRECT_URL или DATABASE_URL в .env");
  process.exit(1);
}

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();

try {
  // 1. Старые записи (>24 часов)
  const staleResult = await client.query(
    `DELETE FROM "LoginAttempt" WHERE "attemptedAt" < NOW() - INTERVAL '24 hours'`,
  );
  console.log(`🗑️  Удалено старых записей (>24ч): ${staleResult.rowCount}`);

  // 2. Осиротевшие записи (userId не существует в User)
  const orphanResult = await client.query(
    `DELETE FROM "LoginAttempt" la
     WHERE NOT EXISTS (
       SELECT 1 FROM "User" u WHERE u.id = la."userId"
     )`,
  );
  console.log(`🗑️  Удалено осиротевших записей: ${orphanResult.rowCount}`);

  // Итог
  const remaining = await client.query(`SELECT COUNT(*) as cnt FROM "LoginAttempt"`);
  console.log(`📊 Осталось записей в LoginAttempt: ${remaining.rows[0].cnt}`);
} finally {
  await client.end();
}
