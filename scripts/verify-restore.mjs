#!/usr/bin/env node
// Проверяет, что JSON-бэкап действительно восстанавливается. Никогда не пишет
// в public: создаёт две уникальные временные схемы, применяет миграции,
// запускает штатный restore-db.mjs, сверяет количество строк и всё удаляет.
//
// Локально без аргументов берётся последний реальный файл из backups/.
// В CI используется --synthetic: персональные данные не нужны, тестовый дамп
// создаётся на лету и удаляется сразу после проверки.

import "dotenv/config";

import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

const SKIP_TABLES = new Set(["_prisma_migrations"]);

function parseArgs(argv) {
  const args = { file: null, synthetic: false, allowPersonalData: false };
  for (let i = 0; i < argv.length; i++) {
    const value = argv[i];
    if (value === "--file") args.file = argv[++i];
    else if (value === "--synthetic") args.synthetic = true;
    else if (value === "--allow-personal-data") args.allowPersonalData = true;
    else throw new Error(`Неизвестный аргумент: ${value}`);
  }
  if (args.file && args.synthetic) {
    throw new Error("Используй либо --file, либо --synthetic, но не оба сразу.");
  }
  if (args.synthetic && args.allowPersonalData) {
    throw new Error("Для синтетической копии --allow-personal-data не нужен.");
  }
  return args;
}

function baseUrl() {
  const raw = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!raw) throw new Error("Нет DIRECT_URL/DATABASE_URL в .env.");
  const url = new URL(raw);
  url.searchParams.delete("schema");
  return url.toString();
}

function schemaUrl(schema) {
  const url = new URL(baseUrl());
  url.searchParams.set("schema", schema);
  return url.toString();
}

function assertSafeSchema(schema) {
  if (!/^restore_(?:source|check)_[a-f0-9]{8}$/.test(schema)) {
    throw new Error(`Отказ удалять небезопасное имя схемы: ${schema}`);
  }
}

async function findLatestBackup() {
  const dir = path.join(process.cwd(), "backups");
  const files = (await readdir(dir))
    .filter((file) => file.startsWith("backup-") && file.endsWith(".json"))
    .sort();
  const latest = files.at(-1);
  return latest ? path.join(dir, latest) : null;
}

async function createSchema(schema) {
  assertSafeSchema(schema);
  const client = new pg.Client({ connectionString: baseUrl() });
  await client.connect();
  try {
    await client.query(`CREATE SCHEMA "${schema}"`);
  } finally {
    await client.end();
  }
}

async function dropSchema(schema) {
  assertSafeSchema(schema);
  const client = new pg.Client({ connectionString: baseUrl() });
  await client.connect();
  try {
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  } finally {
    await client.end();
  }
}

function runNode(args, env = process.env, capture = false) {
  const result = spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    encoding: "utf8",
    stdio: capture ? "pipe" : "inherit",
  });
  if (result.status !== 0) {
    if (capture) {
      if (result.stdout) process.stdout.write(result.stdout);
      if (result.stderr) process.stderr.write(result.stderr);
    }
    throw result.error || new Error(`Команда завершилась с кодом ${result.status}`);
  }
}

function migrateSchema(schema) {
  const prismaCli = fileURLToPath(
    new URL("../node_modules/prisma/build/index.js", import.meta.url),
  );
  const url = schemaUrl(schema);
  runNode(
    [prismaCli, "migrate", "deploy"],
    { DATABASE_URL: url, DIRECT_URL: url },
    true,
  );
}

async function seedSynthetic(schema) {
  const client = new pg.Client({ connectionString: baseUrl() });
  await client.connect();
  try {
    await client.query(`SET search_path TO "${schema}"`);
    const { rows: groups } = await client.query(
      `INSERT INTO "Group" (name, track)
       VALUES ('restore-ci-01', 'intro') RETURNING id`,
    );
    const { rows: categories } = await client.query(
      `INSERT INTO "Category" (name, icon, track, "isPublished")
       VALUES ('Restore CI', '🧪', 'intro', true) RETURNING id`,
    );
    const { rows: lessons } = await client.query(
      `INSERT INTO "Lesson"
         ("categoryId", title, content, "xpReward", "coinReward", "sortOrder", "isPublished")
       VALUES ($1, 'Проверка восстановления', $2, 10, 2, 1, true)
       RETURNING id`,
      [categories[0].id, JSON.stringify({ theory: "Тест", questions: [] })],
    );
    await client.query(
      `INSERT INTO "CategoryGroupAssignment" ("categoryId", "groupId")
       VALUES ($1, $2)`,
      [categories[0].id, groups[0].id],
    );
    const userId = "00000000-0000-4000-8000-000000000099";
    await client.query(
      `INSERT INTO "User"
         (id, name, "pinHash", "groupId", "isAdmin", "totalXp", level, currency)
       VALUES ($1, 'Restore Student', 'not-a-real-pin', $2, false, 10, 1, 2)`,
      [userId, groups[0].id],
    );
    await client.query(
      `INSERT INTO "UserLessonProgress"
         ("userId", "lessonId", "answeredCount", "wrongAttempts",
          "totalQuestions", "isCompleted", "startedAt", "completedAt", "updatedAt")
       VALUES ($1, $2, 1, 0, 1, true, NOW(), NOW(), NOW())`,
      [userId, lessons[0].id],
    );
    const { rows: resources } = await client.query(
      `INSERT INTO "Resource"
         (type, title, body, "coinReward", "sortOrder", "isPublished")
       VALUES ('note', 'Restore note', 'Synthetic backup', 1, 1, true)
       RETURNING id`,
    );
    await client.query(
      `INSERT INTO "ResourceGroupAssignment" ("resourceId", "groupId")
       VALUES ($1, $2)`,
      [resources[0].id, groups[0].id],
    );
  } finally {
    await client.end();
  }
}

async function dumpSchema(schema, file) {
  const client = new pg.Client({ connectionString: baseUrl() });
  await client.connect();
  try {
    await client.query(`SET search_path TO "${schema}"`);
    const { rows: tables } = await client.query(
      `SELECT tablename FROM pg_tables
       WHERE schemaname = $1 ORDER BY tablename`,
      [schema],
    );
    const dump = {};
    for (const { tablename } of tables) {
      const { rows } = await client.query(`SELECT * FROM "${tablename}"`);
      dump[tablename] = rows;
    }
    await writeFile(
      file,
      JSON.stringify({ createdAt: new Date().toISOString(), tables: dump }),
      { encoding: "utf8", mode: 0o600 },
    );
  } finally {
    await client.end();
  }
}

async function validateRestoredRows(schema, file) {
  const dump = JSON.parse(await readFile(file, "utf8"));
  if (!dump?.tables || typeof dump.tables !== "object") {
    throw new Error("Файл не похож на бэкап: нет объекта tables.");
  }

  const client = new pg.Client({ connectionString: baseUrl() });
  await client.connect();
  try {
    const { rows: tables } = await client.query(
      `SELECT tablename FROM pg_tables
       WHERE schemaname = $1 ORDER BY tablename`,
      [schema],
    );
    const existing = tables
      .map((row) => row.tablename)
      .filter((table) => !SKIP_TABLES.has(table));

    let totalRows = 0;
    for (const table of existing) {
      const expectedRows = dump.tables[table] ?? [];
      if (!Array.isArray(expectedRows)) {
        throw new Error(`Таблица ${table} в бэкапе имеет неверный формат.`);
      }
      const { rows } = await client.query(
        `SELECT COUNT(*)::int AS count FROM "${schema}"."${table}"`,
      );
      const actual = rows[0]?.count ?? -1;
      if (actual !== expectedRows.length) {
        throw new Error(
          `После восстановления ${table}: ожидалось ${expectedRows.length}, получено ${actual}.`,
        );
      }
      totalRows += actual;
    }

    const absentTargets = Object.keys(dump.tables).filter(
      (table) => !SKIP_TABLES.has(table) && !existing.includes(table),
    );
    return { tableCount: existing.length, totalRows, absentTargets };
  } finally {
    await client.end();
  }
}

const args = parseArgs(process.argv.slice(2));
const suffix = randomBytes(4).toString("hex");
const targetSchema = `restore_check_${suffix}`;
const sourceSchema = `restore_source_${suffix}`;
const createdSchemas = [];
let temporaryDir = null;

try {
  let file;
  if (args.synthetic) {
    await createSchema(sourceSchema);
    createdSchemas.push(sourceSchema);
    migrateSchema(sourceSchema);
    await seedSynthetic(sourceSchema);

    const backupsDir = path.join(process.cwd(), "backups");
    await mkdir(backupsDir, { recursive: true });
    temporaryDir = await mkdtemp(path.join(backupsDir, ".restore-check-"));
    file = path.join(temporaryDir, "synthetic-backup.json");
    await dumpSchema(sourceSchema, file);
    console.log("Проверяю синтетический бэкап без персональных данных.");
  } else {
    if (!args.allowPersonalData) {
      throw new Error(
        "Реальный бэкап содержит данные учеников. Если DATABASE_URL ведёт в " +
          "разрешённую для них базу, повтори команду с --allow-personal-data.",
      );
    }
    file = args.file ? path.resolve(args.file) : await findLatestBackup();
    if (!file) {
      throw new Error(
        "В backups/ нет копий. Создай `npm run backup` или используй --synthetic.",
      );
    }
    console.log(`Проверяю бэкап: ${path.basename(file)}`);
  }

  await createSchema(targetSchema);
  createdSchemas.push(targetSchema);
  migrateSchema(targetSchema);

  const restoreScript = fileURLToPath(
    new URL("./restore-db.mjs", import.meta.url),
  );
  runNode([
    restoreScript,
    "--file",
    file,
    "--to",
    schemaUrl(targetSchema),
    "--yes",
  ]);

  const result = await validateRestoredRows(targetSchema, file);
  console.log(
    `\n✓ Проверка восстановления пройдена: ${result.totalRows} строк, ` +
      `${result.tableCount} таблиц.`,
  );
  if (result.absentTargets.length > 0) {
    console.log(
      `  Устаревшие таблицы из копии пропущены: ${result.absentTargets.join(", ")}`,
    );
  }
  console.log("  Рабочая схема public не изменялась.");
} catch (error) {
  console.error(`\n✗ Проверка восстановления не пройдена: ${error.message}`);
  process.exitCode = 1;
} finally {
  for (const schema of createdSchemas.reverse()) {
    try {
      await dropSchema(schema);
    } catch (error) {
      console.error(`Не удалось удалить временную схему ${schema}: ${error.message}`);
      process.exitCode = 1;
    }
  }
  if (temporaryDir) {
    await rm(temporaryDir, { recursive: true, force: true });
  }
}
