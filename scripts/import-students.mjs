#!/usr/bin/env node
// ============================================================
// Сброс учеников и заливка нового состава групп («первая регистрация»).
//
// Запуск на сервере (из каталога приложения, где есть node_modules/pg):
//   cd /opt/quantorium/current
//   sudo node /tmp/import-students.mjs /tmp/students.json --env=/etc/quantorium.env
//   sudo node /tmp/import-students.mjs /tmp/students.json --env=/etc/quantorium.env --apply
//
// Без --apply скрипт только показывает план и ничего не меняет.
// С --apply:
//   1. делает pg_dump в /var/backups/quantorium (--backup-dir=…);
//   2. в одной транзакции удаляет ВСЕХ учеников (isAdmin = false) вместе
//      с прогрессом, XP, монетами, ачивками, сданными работами и попытками входа;
//      наставники, группы, курсы, уроки и назначения курсов группам остаются;
//   3. создаёт недостающие группы (существующие сохраняют id и назначения);
//   4. создаёт учеников с profileConfiguredAt = NULL и privacyAcceptedAt = NULL:
//      при первом входе ребёнок сам выберет ник и подтвердит согласие с политикой.
//
// Формат students.json (PIN в открытом виде сюда не попадает, только bcrypt-хеш):
//   { "groups":   [{ "name": "IT-01", "track": "intro" }],
//     "students": [{ "group": "IT-01", "nickname": "Максим С",
//                    "mentorLabel": "Максим С.", "pinHash": "$2b$10$…" }] }
// ============================================================

import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

const TRACKS = new Set(["intro", "advanced", "project"]);
// Те же правила, что StudentNicknameSchema / MentorLabelSchema в src/lib/student-identity.ts.
const NICKNAME_RE = /^[\p{L}\p{N} _-]{2,24}$/u;
const MENTOR_LABEL_RE = /^[\p{L}\p{N} .,'’()_-]{2,40}$/u;
const PIN_HASH_RE = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

const collapseSpaces = (value) => String(value ?? "").trim().replace(/\s+/g, " ");

export function validateImport(payload) {
  const errors = [];
  const groups = [];
  const students = [];
  const groupNames = new Set();

  for (const [index, raw] of (payload?.groups ?? []).entries()) {
    const name = collapseSpaces(raw?.name);
    if (!name || name.length > 32) errors.push(`groups[${index}]: название 1–32 символа`);
    else if (groupNames.has(name)) errors.push(`groups[${index}]: группа «${name}» повторяется`);
    if (!TRACKS.has(raw?.track)) errors.push(`groups[${index}]: неизвестное направление «${raw?.track}»`);
    groupNames.add(name);
    groups.push({ name, track: raw?.track });
  }
  if (groups.length === 0) errors.push("нет ни одной группы");

  const nicknamesByGroup = new Map();
  for (const [index, raw] of (payload?.students ?? []).entries()) {
    const where = `students[${index}]`;
    const group = collapseSpaces(raw?.group);
    const nickname = collapseSpaces(raw?.nickname);
    const mentorLabel = collapseSpaces(raw?.mentorLabel);
    if (!groupNames.has(group)) errors.push(`${where}: группа «${group}» не описана в groups`);
    if (!NICKNAME_RE.test(nickname)) errors.push(`${where}: недопустимый ник «${nickname}»`);
    if (!MENTOR_LABEL_RE.test(mentorLabel)) errors.push(`${where}: недопустимая пометка «${mentorLabel}»`);
    if (!PIN_HASH_RE.test(String(raw?.pinHash ?? ""))) errors.push(`${where}: pinHash не похож на bcrypt`);

    const taken = nicknamesByGroup.get(group) ?? new Set();
    const key = nickname.toLocaleLowerCase("ru");
    if (taken.has(key)) errors.push(`${where}: ник «${nickname}» уже есть в группе ${group}`);
    taken.add(key);
    nicknamesByGroup.set(group, taken);
    students.push({ group, nickname, mentorLabel, pinHash: raw?.pinHash });
  }
  if (students.length === 0) errors.push("нет ни одного ученика");

  return { errors, groups, students };
}

/** Одна транзакция: удалить всех учеников, создать группы и новых учеников. */
export async function applyImport(client, { groups, students }) {
  await client.query("BEGIN");
  try {
    const { rows: old } = await client.query(`SELECT id FROM "User" WHERE NOT "isAdmin"`);
    const ids = old.map((row) => row.id);
    // Таблицы без ON DELETE CASCADE на User (как в src/lib/student-deletion.ts);
    // остальное уходит каскадом вместе со строками User.
    for (const table of ["LoginAttempt", "UserLessonProgress", "UserAchievement", "UserResource"]) {
      await client.query(`DELETE FROM "${table}" WHERE "userId" = ANY($1::text[])`, [ids]);
    }
    await client.query(`DELETE FROM "User" WHERE id = ANY($1::text[]) AND NOT "isAdmin"`, [ids]);

    const groupIds = new Map();
    for (const group of groups) {
      const { rows } = await client.query(
        `INSERT INTO "Group" (name, track) VALUES ($1, $2::"GroupTrack")
         ON CONFLICT (name) DO UPDATE SET track = EXCLUDED.track
         RETURNING id`,
        [group.name, group.track],
      );
      groupIds.set(group.name, rows[0].id);
    }
    for (const student of students) {
      await client.query(
        `INSERT INTO "User"
           (id, name, "mentorLabel", "profileConfiguredAt", "privacyAcceptedAt",
            "pinHash", "isAdmin", "groupId")
         VALUES ($1, $2, $3, NULL, NULL, $4, false, $5)`,
        [randomUUID(), student.nickname, student.mentorLabel, student.pinHash, groupIds.get(student.group)],
      );
    }
    await client.query("COMMIT");
    return ids.length;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

function parseArgs(argv) {
  const args = { _: [] };
  for (const arg of argv) {
    const match = arg.match(/^--([^=]+)(?:=(.*))?$/);
    if (match) args[match[1]] = match[2] ?? true;
    else args._.push(arg);
  }
  return args;
}

// Тот же разбор, что loadEnvironmentFile в deploy/linux/quantorium-deploy.mjs.
function loadEnvironmentFile(file) {
  for (const sourceLine of readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = sourceLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(2);
}

function backupDatabase(databaseUrl, dir) {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(dir, `database-before-student-import-${stamp}.dump`);
  execFileSync("pg_dump", ["--dbname", databaseUrl, "--format=custom", "--file", file], {
    stdio: ["ignore", "inherit", "inherit"],
  });
  chmodSync(file, 0o600);
  return file;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.env) {
    if (!existsSync(args.env)) fail(`нет файла окружения ${args.env}`);
    loadEnvironmentFile(args.env);
  }
  const file = args._[0];
  if (!file) fail("укажите путь к students.json");

  const { errors, groups, students } = validateImport(JSON.parse(readFileSync(file, "utf8")));
  if (errors.length > 0) fail(`файл не прошёл проверку:\n  ${errors.join("\n  ")}`);

  const databaseUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!databaseUrl) fail("не задан DIRECT_URL или DATABASE_URL (передайте --env=/etc/quantorium.env)");

  // pg берём из node_modules текущего каталога: скрипт можно положить в /tmp.
  const { Client } = createRequire(path.join(process.cwd(), "package.json"))("pg");
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const { rows: current } = await client.query(
      `SELECT COALESCE(g.name, 'без группы') AS "group", COUNT(*)::int AS count
       FROM "User" u LEFT JOIN "Group" g ON g.id = u."groupId"
       WHERE NOT u."isAdmin" GROUP BY 1 ORDER BY 1`,
    );
    const { rows: existingGroups } = await client.query(`SELECT name, track FROM "Group"`);
    const existing = new Map(existingGroups.map((row) => [row.name, row.track]));

    const totalCurrent = current.reduce((sum, row) => sum + row.count, 0);
    console.log(`Сейчас учеников: ${totalCurrent} — все будут удалены вместе с прогрессом`);
    for (const row of current) console.log(`  ${row.group.padEnd(20)} ${row.count}`);
    console.log(`\nБудет создано учеников: ${students.length}`);
    for (const group of groups) {
      const count = students.filter((student) => student.group === group.name).length;
      const state = !existing.has(group.name)
        ? "новая группа"
        : existing.get(group.name) === group.track
          ? "группа есть"
          : `направление ${existing.get(group.name)} → ${group.track}`;
      console.log(`  ${group.name.padEnd(20)} ${String(count).padStart(3)}  (${state})`);
    }
    const untouched = existingGroups.filter((row) => !groups.some((group) => group.name === row.name));
    if (untouched.length > 0) {
      console.log(`\nОстанутся пустыми: ${untouched.map((row) => row.name).join(", ")}`);
    }

    if (!args.apply) {
      console.log("\nЭто проверка: база не изменена. Для записи добавьте --apply.");
      return;
    }

    if (args["no-backup"]) {
      console.log("\n! Бэкап пропущен (--no-backup)");
    } else {
      const backup = backupDatabase(databaseUrl, args["backup-dir"] || "/var/backups/quantorium");
      console.log(`\n✓ Бэкап: ${backup}`);
    }

    const deleted = await applyImport(client, { groups, students });
    console.log(`✓ Удалено учеников: ${deleted}, создано: ${students.length}`);
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`✗ База не изменена: ${error.message}`);
    process.exitCode = 1;
  });
}
