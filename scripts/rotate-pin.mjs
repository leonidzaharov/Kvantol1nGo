#!/usr/bin/env node
// ============================================================
// Ротация PIN-кода для пользователя в Supabase.
//
// Запуск:
//   npm run rotate-pin -- --user-id=<uuid> --pin=<PIN>
//   npm run rotate-pin -- --name="Иван Иванов" --pin=<PIN>
//
// PIN: ученик — ровно 4 цифры, админ — 8..10 цифр (не подобрать перебором).
//
// Скрипт:
//   1. Находит пользователя по id ИЛИ по name (что задано первым).
//   2. Хеширует переданный PIN через bcrypt (cost = 10, как в текущем authorize).
//   3. Обновляет User.pinHash.
//   4. Никогда не печатает сам PIN или хеш.
// ============================================================

import "dotenv/config";
import bcrypt from "bcryptjs";
import { Client } from "pg";

function parseArgs() {
  const args = {};
  for (const arg of process.argv.slice(2)) {
    const m = arg.match(/^--([^=]+)=(.*)$/);
    if (m) args[m[1]] = m[2];
  }
  return args;
}

const args = parseArgs();
// Формат проверяем в два шага: тут — что это вообще цифры разумной длины,
// а после загрузки пользователя — что длина соответствует роли (4 у ученика,
// 8–10 у админа): роль до запроса в БД неизвестна.
const pin = args.pin;
if (!pin || !/^\d{4}$|^\d{8,10}$/.test(pin)) {
  console.error(
    "✗ --pin обязателен: 4 цифры для ученика, 8–10 цифр для админа",
  );
  process.exit(2);
}
if (!args["user-id"] && !args.name) {
  console.error("✗ задайте --user-id=<uuid> или --name=\"<имя>\"");
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
  let user;
  if (args["user-id"]) {
    const res = await client.query(
      `SELECT id, name, "isAdmin" FROM "User" WHERE id = $1`,
      [args["user-id"]],
    );
    user = res.rows[0];
  } else {
    const res = await client.query(
      `SELECT id, name, "isAdmin" FROM "User" WHERE name = $1`,
      [args.name],
    );
    if (res.rows.length > 1) {
      console.error(
        `✗ найдено несколько пользователей с именем "${args.name}". Используй --user-id.`,
      );
      process.exit(2);
    }
    user = res.rows[0];
  }

  if (!user) {
    console.error("✗ пользователь не найден");
    process.exit(2);
  }

  if (user.isAdmin && !/^\d{8,10}$/.test(pin)) {
    console.error(
      `✗ «${user.name}» — админ, его PIN должен быть 8–10 цифр`,
    );
    process.exit(2);
  }
  if (!user.isAdmin && !/^\d{4}$/.test(pin)) {
    console.error(
      `✗ «${user.name}» — ученик, его PIN должен быть ровно 4 цифры`,
    );
    process.exit(2);
  }

  const newHash = await bcrypt.hash(pin, 10);
  await client.query(
    `UPDATE "User" SET "pinHash" = $1 WHERE id = $2`,
    [newHash, user.id],
  );

  console.log(`✓ PIN обновлён для пользователя «${user.name}» (id=${user.id})`);
} finally {
  await client.end();
}
