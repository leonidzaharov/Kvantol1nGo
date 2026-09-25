#!/usr/bin/env node
// ============================================================
// Создание нового профиля ученика в Supabase.
//
// Запуск:
//   npm run create-user -- --name="Маша Петрова" --pin=1234
//   npm run create-user -- --name="Наставник" --pin=8712093465 --admin   (аккаунт с правами админки)
//
// Скрипт:
//   1. Валидирует имя (1..64 символа) и PIN: ученик — ровно 4 цифры,
//      админ — 8..10 цифр (длинный PIN не подобрать перебором).
//   2. Хеширует PIN через bcrypt (cost = 10, как authorize() в src/auth.ts).
//   3. Проверяет, нет ли уже пользователя с таким именем — если есть,
//      предупреждает и просит подтверждения (--force).
//   4. Создаёт запись с дефолтами: totalXp=0, level=1, currency=0,
//      lastActiveDate=null.
//   5. Печатает выданный id (uuid) — пригодится для будущей ротации PIN.
//   6. Никогда не печатает сам PIN или хеш.
// ============================================================

import "dotenv/config";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { Client } from "pg";

function parseArgs() {
  const args = {};
  for (const arg of process.argv.slice(2)) {
    const m = arg.match(/^--([^=]+)(?:=(.*))?$/);
    if (m) args[m[1]] = m[2] ?? true;
  }
  return args;
}

const args = parseArgs();
const name = typeof args.name === "string" ? args.name.trim() : "";
const pin = typeof args.pin === "string" ? args.pin : "";

if (!name) {
  console.error('✗ --name="<имя>" обязателен');
  process.exit(2);
}
if (name.length > 64) {
  console.error("✗ имя длиннее 64 символов — слишком длинно");
  process.exit(2);
}
const isAdmin = args.admin === true;
if (isAdmin ? !/^\d{8,10}$/.test(pin) : !/^\d{4}$/.test(pin)) {
  console.error(
    isAdmin
      ? "✗ --pin для админа должен быть 8–10 цифр"
      : "✗ --pin должен быть ровно 4 цифры",
  );
  process.exit(2);
}

const directUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!directUrl) {
  console.error("✗ задайте DIRECT_URL или DATABASE_URL в .env");
  process.exit(2);
}
const client = new Client({ connectionString: directUrl });
await client.connect();

try {
  const existing = await client.query(
    `SELECT id FROM "User" WHERE name = $1`,
    [name],
  );
  if (existing.rows.length > 0 && !args.force) {
    console.error(
      `✗ пользователь с именем "${name}" уже существует (id=${existing.rows[0].id}).\n` +
        `  Если действительно нужен второй с таким именем — передай --force.`,
    );
    process.exit(2);
  }

  const id = randomUUID();
  const pinHash = await bcrypt.hash(pin, 10);

  await client.query(
    `INSERT INTO "User"
       (id, name, "mentorLabel", "profileConfiguredAt", "pinHash", "isAdmin",
        "totalXp", level, currency, "lastActiveDate", "createdAt")
     VALUES ($1, $2, $3, $4, $5, $6, 0, 1, 0, NULL, NOW())`,
    [id, name, isAdmin ? null : name, isAdmin ? new Date() : null, pinHash, isAdmin],
  );

  console.log(
    `✓ Создан пользователь «${name}» (id=${id})${isAdmin ? " — с правами админа" : ""}`,
  );
} finally {
  await client.end();
}
