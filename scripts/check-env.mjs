#!/usr/bin/env node
// ============================================================
// Проверка окружения перед деплоем / запуском.
//
// Запускается:
//   - локально: `npm run check-env` (читает .env через dotenv)
//   - на Debian-сервере: шаг автодеплоя перед `next build`
//
// Цель — упасть РАНЬШЕ, чем приложение поднимется с дырой в конфиге:
// пустой DATABASE_URL, дефолтный AUTH_SECRET, неправильный UPLOADS_DIR.
// ============================================================

import "dotenv/config";
import path from "node:path";
import { accessSync, constants } from "node:fs";
import { deploymentIsolationErrors } from "./env-safety.mjs";

// Postgres URL должен содержать `user:password@host` — иначе подключение
// упадёт где-то глубоко с непонятной ошибкой аутентификации.
function checkUserinfo(url) {
  const m = url.match(/^[^:]+:\/\/([^@]*)@/);
  if (!m) throw new Error("нет '@' — URL не содержит host");
  const userinfo = m[1];
  if (!userinfo.includes(":")) {
    throw new Error("нет 'user:password' перед '@'");
  }
  const [user, password] = userinfo.split(":", 2);
  if (!user) throw new Error("пустой username перед ':'");
  if (!password) throw new Error("пустой пароль после ':'");
}

/** Каждое правило — функция, которая бросает Error при провале. */
const RULES = [
  {
    name: "DATABASE_URL",
    check: (v) => {
      if (!v) throw new Error("не задан");
      if (!/^postgres(ql)?:\/\//.test(v)) {
        throw new Error("должен начинаться с postgres:// или postgresql://");
      }
      if (v.includes("file:")) {
        throw new Error("осталась SQLite-строка — миграция не завершена");
      }
      checkUserinfo(v);
    },
  },
  {
    name: "DIRECT_URL",
    check: (v) => {
      if (!v) throw new Error("не задан (нужен для prisma migrate)");
      if (!/^postgres(ql)?:\/\//.test(v)) {
        throw new Error("должен начинаться с postgres:// или postgresql://");
      }
      checkUserinfo(v);
    },
  },
  {
    name: "AUTH_SECRET",
    check: (v) => {
      if (!v) throw new Error("не задан");
      if (v.length < 32) {
        throw new Error(
          `слишком короткий (${v.length} символов). Сгенерируй: openssl rand -base64 32`,
        );
      }
      const weak = [
        "dev-secret-key-quantorium-12345",
        "secret",
        "changeme",
        "test",
        "замени",
      ];
      if (weak.some((w) => v.toLowerCase().includes(w.toLowerCase()))) {
        throw new Error("содержит дефолтное/слабое значение — замени");
      }
    },
  },
];

let failures = 0;
const log = (level, name, msg) => {
  const tag = level === "ok" ? "✓" : "✗";
  const colour = level === "ok" ? "\x1b[32m" : "\x1b[31m";
  console.log(`  ${colour}${tag}\x1b[0m ${name.padEnd(16)} ${msg}`);
};

// Безопасный preview: для DB-URL показываем только хост:порт/db, кредитные
// данные (user:password между protocol:// и @) выкусываем.
function safePreview(name, value) {
  if (name === "AUTH_SECRET") {
    return `длина ${value.length}`;
  }
  const m = value.match(/^([^:]+):\/\/[^@]*@(.+)$/);
  if (m) return `${m[1]}://<creds>@${m[2].slice(0, 50)}`;
  return "(непарсимое значение — не показываю)";
}

console.log("\nПроверка переменных окружения:");
for (const rule of RULES) {
  const value = process.env[rule.name];
  try {
    rule.check(value);
    log("ok", rule.name, `OK (${safePreview(rule.name, value)})`);
  } catch (err) {
    log("err", rule.name, err.message);
    failures += 1;
  }
}

// Дополнительная проверка: DATABASE_URL и DIRECT_URL ведут в одну базу?
// Хосты могут отличаться (пулер vs прямое соединение), а вот имя базы
// в path — нет. Ловит случайное переключение одного URL на чужую БД.
if (process.env.DATABASE_URL && process.env.DIRECT_URL) {
  try {
    const db = new URL(process.env.DATABASE_URL).pathname;
    const direct = new URL(process.env.DIRECT_URL).pathname;
    if (db !== direct) {
      log(
        "err",
        "consistency",
        `DATABASE_URL и DIRECT_URL указывают на разные базы (${db} ≠ ${direct})`,
      );
      failures += 1;
    }
  } catch {
    // Не критично — парсинг URL-ов может упасть на нестандартных форматах.
  }
}

// Хранилище загрузок — только локальная папка на сервере.
const driver = process.env.STORAGE_DRIVER ?? "local";
if (driver !== "local") {
  failures++;
  log("error", "STORAGE_DRIVER", "поддерживается только local — файлы в UPLOADS_DIR на сервере");
} else {
  try {
    if (!process.env.UPLOADS_DIR || !path.isAbsolute(process.env.UPLOADS_DIR)) throw new Error("нужен абсолютный UPLOADS_DIR");
    accessSync(process.env.UPLOADS_DIR, constants.R_OK | constants.W_OK);
    log("ok", "UPLOADS_DIR", "каталог доступен для чтения и записи");
  } catch { failures++; log("error", "UPLOADS_DIR", "создайте постоянный каталог и выдайте службе права чтения/записи"); }
}

// check-env выполняется ДО prisma migrate deploy в автодеплое — staging-
// конфигурация обязана явно подтвердить, что это изолированная тестовая база.
for (const message of deploymentIsolationErrors(process.env)) {
  log("err", "isolation", message);
  failures += 1;
}

if (failures > 0) {
  console.error(
    `\n\x1b[31mПровалов: ${failures}. Поправь .env (локально) или env на сервере и повтори.\x1b[0m\n`,
  );
  process.exit(1);
}

console.log("\n\x1b[32mВсе проверки пройдены.\x1b[0m\n");
