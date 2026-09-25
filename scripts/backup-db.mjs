#!/usr/bin/env node
// ============================================================
// Бесплатный бэкап базы: логический дамп всех таблиц в один JSON-файл.
//
// Зачем: free-тариф Supabase НЕ делает бэкапов вообще. А у нас в базе —
// прогресс детей (XP, монеты, уровни, отметки уроков). Потерять их без
// копии нельзя. Этот скрипт даёт бесплатную страховку: запусти руками
// (`npm run backup`) или поставь по расписанию (Планировщик заданий /
// GitHub Action) — и получишь снимок данных на текущий момент.
//
// Формат — JSON со всеми строками по таблицам. Это не полноценный
// pg_dump (нет схемы/индексов), но данные сохраняются целиком и легко
// читаются/восстанавливаются вставкой. Файлы кладём в /backups (в git
// НЕ коммитятся — там персональные данные учеников).
//
// ВАЖНО про Pro: если появится бюджет — включить в Supabase Pro
// ежедневные бэкапы (до 7 дней) / PITR. Этот скрипт — про запас на free.
// ============================================================

import "dotenv/config";
import { mkdir, readdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

// Сколько последних копий хранить. Задача в Планировщике делает копию
// каждый день — 60 файлов ≈ два месяца истории, дальше старьё удаляем.
const KEEP_BACKUPS = 60;

// DIRECT_URL — прямое подключение (не пулер): для полного скана надёжнее.
const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("✗ Нет DIRECT_URL/DATABASE_URL в .env — нечем подключиться.");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });

try {
  await client.connect();

  const { rows: tables } = await client.query(
    `SELECT tablename FROM pg_tables
     WHERE schemaname = 'public'
     ORDER BY tablename`,
  );

  const dump = {};
  let totalRows = 0;
  console.log("Снимаю таблицы:");
  for (const { tablename } of tables) {
    // tablename берётся из системного каталога — это реальные идентификаторы,
    // инъекции через кавычки тут неоткуда взяться.
    const { rows } = await client.query(`SELECT * FROM "${tablename}"`);
    dump[tablename] = rows;
    totalRows += rows.length;
    console.log(`  ${tablename.padEnd(20)} ${rows.length}`);
  }

  const dir = path.join(process.cwd(), "backups");
  await mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(dir, `backup-${stamp}.json`);
  await writeFile(
    file,
    JSON.stringify(
      { createdAt: new Date().toISOString(), tables: dump },
      null,
      2,
    ),
  );

  console.log(`\n✓ Готово: ${totalRows} строк из ${tables.length} таблиц`);
  console.log(`  → ${file}`);

  // Ротация: имена содержат ISO-дату, поэтому сортировка по имени = по времени.
  const old = (await readdir(dir))
    .filter((f) => /^backup-.*\.json$/.test(f))
    .sort()
    .slice(0, -KEEP_BACKUPS);
  for (const f of old) {
    await unlink(path.join(dir, f));
  }
  if (old.length > 0) {
    console.log(`  Удалено старых копий: ${old.length} (храним ${KEEP_BACKUPS})`);
  }
} catch (err) {
  console.error("✗ Бэкап не удался:", err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
