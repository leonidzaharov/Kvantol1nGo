#!/usr/bin/env node
// ============================================================
// Восстановление базы из логического бэкапа (scripts/backup-db.mjs).
//
// Бэкап, из которого ни разу не восстанавливались — не бэкап, а лотерея.
// Этот скрипт — вторая половина страховки: заливает JSON-дамп обратно в
// Postgres. Схему он НЕ создаёт (её создают миграции Prisma) — только
// данные: чистит таблицы и вставляет строки заново.
//
// БЕЗОПАСНОСТЬ. Операция разрушительная, поэтому:
//   • по умолчанию — сухой прогон: печатает план и ничего не пишет;
//   • реальная запись только с флагом --yes;
//   • всё в одной транзакции: упало на середине — откат целиком, база
//     остаётся в прежнем состоянии (частично залитых данных не бывает).
//
// Порядок вставки считается из настоящих внешних ключей (топологическая
// сортировка), а не зашит руками: добавишь модель в схему — скрипт
// подхватит её сам.
//
// Примеры:
//   node scripts/restore-db.mjs                    # сухой прогон, последний бэкап
//   node scripts/restore-db.mjs --file backups/backup-2026-07-14.json
//   node scripts/restore-db.mjs --yes              # ВОССТАНОВИТЬ (перезапишет данные!)
//   node scripts/restore-db.mjs --to "postgresql://…?schema=sandbox" --yes
// ============================================================

import "dotenv/config";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

// Служебная таблица истории миграций Prisma. Её состояние описывает СХЕМУ
// целевой базы, а не данные учеников — перезаписывать нельзя, иначе Prisma
// решит, что миграции применены не те.
const SKIP_TABLES = new Set(["_prisma_migrations"]);

// Лимит Postgres — 65535 параметров на запрос. Дробим вставку на порции.
const MAX_PARAMS = 60_000;

function parseArgs(argv) {
  const args = { apply: false, file: null, to: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--yes") args.apply = true;
    else if (a === "--file") args.file = argv[++i];
    else if (a === "--to") args.to = argv[++i];
    else {
      console.error(`✗ Неизвестный аргумент: ${a}`);
      process.exit(1);
    }
  }
  return args;
}

/** Последний по времени файл backups/backup-*.json (имена содержат ISO-дату). */
async function findLatestBackup() {
  const dir = path.join(process.cwd(), "backups");
  let files;
  try {
    files = await readdir(dir);
  } catch {
    return null;
  }
  const backups = files.filter((f) => /^backup-.*\.json$/.test(f)).sort();
  const last = backups.at(-1);
  return last ? path.join(dir, last) : null;
}

/**
 * Prisma кодирует схему в строке подключения как ?schema=…, а node-postgres
 * такого параметра не знает — вынимаем его сами и ставим search_path руками.
 */
function splitSchema(connectionString) {
  const url = new URL(connectionString);
  const schema = url.searchParams.get("schema") ?? "public";
  url.searchParams.delete("schema");
  return { connectionString: url.toString(), schema, host: url.host };
}

/**
 * Топологическая сортировка таблиц по внешним ключам: родители раньше детей.
 * Самоссылки игнорируем (строка ссылается на строку той же таблицы — вставке
 * это не мешает, если данные консистентны).
 */
function topoSort(tables, edges) {
  const remaining = new Set(tables);
  const ordered = [];

  while (remaining.size > 0) {
    // Таблица готова, если все её родители уже вставлены.
    const ready = [...remaining]
      .filter((t) =>
        [...(edges.get(t) ?? [])].every((parent) => !remaining.has(parent)),
      )
      .sort();

    if (ready.length === 0) {
      // Цикл внешних ключей (взаимные ссылки). Вставить такое одной пачкой
      // нельзя — нужны DEFERRABLE-констрейнты. Сейчас в схеме циклов нет;
      // если появятся — упрёмся здесь с понятным сообщением, а не с невнятной
      // ошибкой Postgres на середине заливки.
      throw new Error(
        `Цикл внешних ключей между таблицами: ${[...remaining].join(", ")}. ` +
          `Нужны DEFERRABLE-констрейнты — восстанавливай через pg_dump.`,
      );
    }

    for (const t of ready) {
      ordered.push(t);
      remaining.delete(t);
    }
  }
  return ordered;
}

const args = parseArgs(process.argv.slice(2));

const rawUrl = args.to || process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!rawUrl) {
  console.error("✗ Нет DIRECT_URL/DATABASE_URL в .env — некуда восстанавливать.");
  process.exit(1);
}
const { connectionString, schema, host } = splitSchema(rawUrl);

const file = args.file ? path.resolve(args.file) : await findLatestBackup();
if (!file) {
  console.error("✗ Не нашёл ни одного бэкапа в backups/. Сначала `npm run backup`.");
  process.exit(1);
}

const dump = JSON.parse(await readFile(file, "utf8"));
if (!dump?.tables) {
  console.error(`✗ Файл не похож на бэкап (нет поля "tables"): ${file}`);
  process.exit(1);
}

console.log(`Бэкап:  ${file}`);
console.log(`Снят:   ${dump.createdAt ?? "неизвестно"}`);
console.log(`Цель:   ${host}, схема "${schema}"`);
console.log(args.apply ? "Режим:  ЗАПИСЬ (--yes)\n" : "Режим:  сухой прогон\n");

const client = new pg.Client({ connectionString });

try {
  await client.connect();
  await client.query(`SET search_path TO "${schema}"`);

  // ── Какие таблицы реально есть в целевой схеме ──
  const { rows: existing } = await client.query(
    `SELECT tablename FROM pg_tables WHERE schemaname = $1`,
    [schema],
  );
  const existingTables = new Set(existing.map((r) => r.tablename));

  const dumpTables = Object.keys(dump.tables).filter((t) => !SKIP_TABLES.has(t));
  const targets = dumpTables.filter((t) => existingTables.has(t));

  const missingInDb = dumpTables.filter((t) => !existingTables.has(t));
  const missingInDump = [...existingTables].filter(
    (t) => !SKIP_TABLES.has(t) && !dumpTables.includes(t),
  );
  if (missingInDb.length > 0) {
    console.log(
      `⚠ В бэкапе есть таблицы, которых нет в базе (пропускаю): ${missingInDb.join(", ")}`,
    );
  }
  if (missingInDump.length > 0) {
    // Такие таблицы всё равно будут очищены: восстановление приводит базу
    // к состоянию снимка, а в снимке их не было.
    console.log(
      `⚠ В базе есть таблицы, которых нет в бэкапе (будут очищены): ${missingInDump.join(", ")}`,
    );
  }
  if (targets.length === 0) {
    console.error("✗ Нечего восстанавливать: ни одна таблица бэкапа не найдена в базе.");
    process.exit(1);
  }

  // ── Порядок вставки: родители раньше детей ──
  const { rows: fks } = await client.query(
    `SELECT src.relname AS child, tgt.relname AS parent
       FROM pg_constraint c
       JOIN pg_class src ON src.oid = c.conrelid
       JOIN pg_class tgt ON tgt.oid = c.confrelid
       JOIN pg_namespace n ON n.oid = src.relnamespace
      WHERE c.contype = 'f' AND n.nspname = $1`,
    [schema],
  );
  const edges = new Map(targets.map((t) => [t, new Set()]));
  for (const { child, parent } of fks) {
    if (child !== parent && edges.has(child) && edges.has(parent)) {
      edges.get(child).add(parent);
    }
  }
  const order = topoSort(targets, edges);

  // ── Типы колонок: json/jsonb сериализуем сами ──
  // node-postgres превращает JS-массив в postgres-массив, а не в JSON —
  // на колонке jsonb это даёт мусор. Поэтому такие значения кладём строкой.
  const { rows: cols } = await client.query(
    `SELECT table_name, column_name, data_type
       FROM information_schema.columns WHERE table_schema = $1`,
    [schema],
  );
  const jsonColumns = new Map();
  for (const c of cols) {
    if (c.data_type === "json" || c.data_type === "jsonb") {
      if (!jsonColumns.has(c.table_name)) jsonColumns.set(c.table_name, new Set());
      jsonColumns.get(c.table_name).add(c.column_name);
    }
  }

  console.log("План восстановления:");
  let totalRows = 0;
  for (const t of order) {
    const n = dump.tables[t].length;
    totalRows += n;
    console.log(`  ${t.padEnd(22)} ${String(n).padStart(5)} строк`);
  }
  console.log(`\nИтого: ${totalRows} строк в ${order.length} таблицах`);

  if (!args.apply) {
    console.log(
      "\nЭто сухой прогон — база не изменена.\n" +
        "Чтобы восстановить по-настоящему (СТЕРЕТ текущие данные), запусти с --yes.",
    );
    process.exit(0);
  }

  // ── Заливка: всё в одной транзакции ──
  console.log("\nВосстанавливаю…");
  await client.query("BEGIN");

  // Чистим ВСЕ прикладные таблицы схемы, а не только те, что есть в бэкапе:
  // восстановление приводит базу к состоянию снимка, и таблица, появившаяся
  // после снимка (новая миграция), должна стать пустой — иначе в ней остались
  // бы строки, ссылающиеся на «будущие» данные, которых после отката нет.
  // CASCADE — потому что таблицы связаны ключами; RESTART IDENTITY сбрасывает
  // счётчики id (ниже выставим их по реальным данным).
  const toClear = [...new Set([...order, ...missingInDump])];
  const quoted = toClear.map((t) => `"${schema}"."${t}"`).join(", ");
  await client.query(`TRUNCATE ${quoted} RESTART IDENTITY CASCADE`);

  for (const table of order) {
    const rows = dump.tables[table];
    if (rows.length === 0) continue;

    const columns = Object.keys(rows[0]);
    const jsonCols = jsonColumns.get(table) ?? new Set();
    const chunkSize = Math.max(1, Math.floor(MAX_PARAMS / columns.length));

    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const params = [];
      const tuples = chunk.map((row) => {
        const placeholders = columns.map((col) => {
          const v = row[col];
          params.push(
            v !== null && v !== undefined && jsonCols.has(col)
              ? JSON.stringify(v)
              : v,
          );
          return `$${params.length}`;
        });
        return `(${placeholders.join(", ")})`;
      });

      await client.query(
        `INSERT INTO "${schema}"."${table}" (${columns.map((c) => `"${c}"`).join(", ")})
         VALUES ${tuples.join(", ")}`,
        params,
      );
    }
    console.log(`  ${table.padEnd(22)} ${String(rows.length).padStart(5)} строк ✓`);
  }

  // ── Счётчики автоинкремента ──
  // Строки залиты с явными id, а последовательности после TRUNCATE начинаются
  // с 1 — без этого следующая вставка упала бы на «duplicate key».
  let fixed = 0;
  for (const table of order) {
    for (const col of cols.filter((c) => c.table_name === table)) {
      const { rows: seqRows } = await client.query(
        `SELECT pg_get_serial_sequence($1, $2) AS seq`,
        [`"${schema}"."${table}"`, col.column_name],
      );
      const seq = seqRows[0]?.seq;
      if (!seq) continue;
      // setval(…, max(id), true) — следующий id будет max+1. Если таблица
      // пуста, ставим 1 с is_called=false: первый id снова будет 1.
      await client.query(
        `SELECT setval($1,
           COALESCE((SELECT MAX("${col.column_name}") FROM "${schema}"."${table}"), 1),
           COALESCE((SELECT MAX("${col.column_name}") FROM "${schema}"."${table}"), 0) > 0)`,
        [seq],
      );
      fixed++;
    }
  }

  await client.query("COMMIT");
  console.log(`\n✓ Восстановлено: ${totalRows} строк, счётчиков id поправлено: ${fixed}`);
} catch (err) {
  try {
    await client.query("ROLLBACK");
    console.error("\n✗ Восстановление не удалось — откатил, база не тронута.");
  } catch {
    /* транзакция могла и не начаться */
  }
  console.error(`  ${err.message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
