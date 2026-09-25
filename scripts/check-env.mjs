#!/usr/bin/env node
// ============================================================
// Проверка окружения перед деплоем / запуском.
//
// Запускается:
//   - локально: `npm run check-env` (читает .env через dotenv)
//   - в Vercel build: `npm run check-env` стоит первым в `vercel-build`
//     (тогда переменные читаются прямо из process.env, dotenv не нужен).
//
// Цель — упасть РАНЬШЕ, чем приложение поднимется с дырой в конфиге:
// пустой DATABASE_URL, дефолтный AUTH_SECRET, http вместо postgresql и т.п.
// ============================================================

import "dotenv/config";
import path from "node:path";
import { accessSync, constants } from "node:fs";
import { deploymentIsolationErrors } from "./env-safety.mjs";

// Postgres URL должен содержать `user:password@host` — иначе подключение
// упадёт где-то глубоко (видели «FATAL: ENOIDENTIFIER no tenant identifier»
// у Supabase-пулера, когда пользователь случайно вырезал project-ref).
function checkUserinfo(url) {
  const m = url.match(/^[^:]+:\/\/([^@]*)@/);
  if (!m) throw new Error("нет '@' — URL не содержит host");
  const userinfo = m[1];
  if (!userinfo.includes(":")) {
    throw new Error(
      "нет 'user:password' перед '@' — для Supabase-пулера нужен 'postgres.<project-ref>:<password>'",
    );
  }
  const [user, password] = userinfo.split(":", 2);
  if (!user) throw new Error("пустой username перед ':'");
  if (!password) throw new Error("пустой пароль после ':'");
  // Если хост пулера, юзер обязан содержать project-ref (postgres.<ref>).
  if (url.includes("pooler.supabase.com") && !user.includes(".")) {
    throw new Error(
      "у Supabase-пулера username должен иметь вид 'postgres.<project-ref>', а не просто 'postgres'",
    );
  }
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
    name: "SUPABASE_URL",
    check: (v) => {
      if (!v) throw new Error("не задан (нужен для загрузки картинок уроков)");
      if (!/^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(v)) {
        throw new Error(
          "должен выглядеть как https://<project-ref>.supabase.co (Settings → API → Project URL)",
        );
      }
    },
  },
  {
    name: "SUPABASE_SERVICE_ROLE_KEY",
    check: (v) => {
      if (!v) {
        throw new Error(
          "не задан — скопируй service_role из Supabase: Settings → API → Project API keys",
        );
      }
      if (v.length < 40) {
        throw new Error("слишком короткий — это точно не service_role-ключ");
      }
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
  if (name === "AUTH_SECRET" || name === "SUPABASE_SERVICE_ROLE_KEY") {
    return `длина ${value.length}`;
  }
  if (name === "SUPABASE_URL") return value;
  const m = value.match(/^([^:]+):\/\/[^@]*@(.+)$/);
  if (m) return `${m[1]}://<creds>@${m[2].slice(0, 50)}`;
  return "(непарсимое значение — не показываю)";
}

console.log("\nПроверка переменных окружения:");
for (const rule of RULES) {
  if (process.env.STORAGE_DRIVER === "local" && rule.name.startsWith("SUPABASE_")) continue;
  const value = process.env[rule.name];
  try {
    rule.check(value);
    log("ok", rule.name, `OK (${safePreview(rule.name, value)})`);
  } catch (err) {
    log("err", rule.name, err.message);
    failures += 1;
  }
}

// Дополнительная проверка: DATABASE_URL и DIRECT_URL указывают на один хост?
// Иначе разработчик случайно переключил один из них на чужую БД.
if (process.env.DATABASE_URL && process.env.DIRECT_URL) {
  try {
    const dbHost = new URL(process.env.DATABASE_URL.replace("postgresql://", "http://")).hostname;
    const directHost = new URL(process.env.DIRECT_URL.replace("postgresql://", "http://")).hostname;
    // Supabase: pooler-хост и direct-хост отличаются префиксом (aws-0-... vs db.<ref>...),
    // но содержат один project-ref. Не делаем строгое сравнение, просто предупреждаем.
    if (dbHost !== directHost) {
      const dbRef = dbHost.split(".")[0];
      const directRef = directHost.split(".")[0];
      if (dbRef !== directRef && !dbHost.includes(directRef) && !directHost.includes(dbRef)) {
        log(
          "err",
          "consistency",
          `DATABASE_URL хост (${dbHost}) и DIRECT_URL хост (${directHost}) выглядят разными проектами`,
        );
        failures += 1;
      }
    }
  } catch {
    // Не критично — парсинг URL-ов может упасть на нестандартных форматах.
  }
}

const driver = process.env.STORAGE_DRIVER ?? "supabase";
if (!["local", "supabase"].includes(driver)) { failures++; log("error", "STORAGE_DRIVER", "нужен local или supabase"); }
if (driver === "local") {
  try {
    if (!process.env.UPLOADS_DIR || !path.isAbsolute(process.env.UPLOADS_DIR)) throw new Error("нужен абсолютный UPLOADS_DIR");
    accessSync(process.env.UPLOADS_DIR, constants.R_OK | constants.W_OK);
    log("ok", "UPLOADS_DIR", "каталог доступен для чтения и записи");
  } catch { failures++; log("error", "UPLOADS_DIR", "создайте постоянный каталог и выдайте службе права чтения/записи"); }
}

// В Vercel команда check-env выполняется ДО prisma migrate deploy. Preview
// намеренно не дойдёт до миграций, пока явно не подтверждена отдельная staging
// база. Также сверяем project-ref трёх Supabase-переменных, не печатая сам ref.
for (const message of deploymentIsolationErrors(process.env)) {
  log("err", "isolation", message);
  failures += 1;
}

if (failures > 0) {
  console.error(
    `\n\x1b[31mПровалов: ${failures}. Поправь .env (локально) или Vercel env vars (прод) и повтори.\x1b[0m\n`,
  );
  process.exit(1);
}

console.log("\n\x1b[32mВсе проверки пройдены.\x1b[0m\n");
