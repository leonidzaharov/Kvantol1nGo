// ============================================================
// Песочница для E2E: отдельная схема Postgres со своими данными.
//
// Зачем так сложно: прогон «пройти урок» ПИШЕТ в базу (прогресс, XP, монеты,
// попытки входа). Гонять такое по живой базе нельзя — там реальный прогресс
// детей. Поэтому тесты работают в схеме `e2e`: приложение поднимается с
// DATABASE_SCHEMA=e2e (см. src/lib/db.ts), схема создаётся перед прогоном и
// удаляется после. Схема public не затрагивается вообще.
// ============================================================

import { spawnSync } from "node:child_process";
import bcrypt from "bcryptjs";
import pg from "pg";

export const E2E_SCHEMA = "e2e";

/** PIN тестового ученика — фикстура, не секрет: живёт только в схеме e2e. */
export const E2E_PIN = "1234";
export const E2E_STUDENT = "Тест Ученик";
export const E2E_GROUP = "e2e-01";
export const E2E_COURSE = "E2E-курс";
export const E2E_LESSON_TITLE = "Тестовый урок";
export const E2E_ADMIN = "Тест Наставник";
export const E2E_ADMIN_PIN = "12345678";
export const E2E_COPY_COURSE = "HTML — копия";
export const E2E_COPY_LESSON = "Урок копии";
export const E2E_VISIBLE_RESOURCE = "Материал группы e2e";
export const E2E_HIDDEN_RESOURCE = "Скрытый материал другой группы";

/** Урок с двумя шагами теории и вопросом — проверяем новую навигацию целиком. */
const LESSON_CONTENT = JSON.stringify({
  theory:
    "# Тестовая теория\n\nЭто урок для автотеста.\n\n" +
    "## Первый шаг\n\nПрочитай объяснение.\n\n" +
    "## Второй шаг\n\nПосмотри пример.",
  questions: [
    {
      prompt: "Сколько будет 2 + 2?",
      options: ["3", "4", "5"],
      correctIndex: 1,
    },
  ],
  bonusQuestions: [
    {
      type: "choice",
      prompt: "Сколько будет 6 × 7?",
      options: ["36", "42", "49"],
      correctIndex: 1,
    },
  ],
});

function baseUrl(): string {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!url) throw new Error("Нет DIRECT_URL/DATABASE_URL — негде поднять песочницу.");
  return url;
}

/** Та же база, но с ?schema=e2e — для Prisma CLI (миграции). */
export function sandboxUrl(): string {
  const url = new URL(baseUrl());
  url.searchParams.set("schema", E2E_SCHEMA);
  return url.toString();
}

export async function createSandbox(): Promise<{
  lessonId: number;
  copyCourseId: number;
}> {
  const client = new pg.Client({ connectionString: baseUrl() });
  await client.connect();

  try {
    // Схема с нуля: прошлый прогон мог упасть и оставить мусор.
    await client.query(`DROP SCHEMA IF EXISTS "${E2E_SCHEMA}" CASCADE`);
    await client.query(`CREATE SCHEMA "${E2E_SCHEMA}"`);

    // Таблицы создают настоящие миграции — тот же путь, что и на проде.
    const url = sandboxUrl();
    const r = spawnSync("npx", ["prisma", "migrate", "deploy"], {
      stdio: "inherit",
      shell: true,
      env: { ...process.env, DIRECT_URL: url, DATABASE_URL: url },
    });
    if (r.status !== 0) throw new Error("prisma migrate deploy упал");

    await client.query(`SET search_path TO "${E2E_SCHEMA}"`);

    // ── Фикстуры ──
    const { rows: group } = await client.query(
      `INSERT INTO "Group" (name, track) VALUES ($1, 'intro') RETURNING id`,
      [E2E_GROUP],
    );
    const { rows: category } = await client.query(
      `INSERT INTO "Category" (name, icon, track, "isPublished")
       VALUES ('E2E-курс', '🧪', 'intro', true) RETURNING id`,
    );
    const { rows: lesson } = await client.query(
      `INSERT INTO "Lesson" (title, "categoryId", content, "xpReward", "coinReward", "sortOrder", "isPublished")
       VALUES ($1, $2, $3, 20, 5, 1, true) RETURNING id`,
      [E2E_LESSON_TITLE, category[0].id, LESSON_CONTENT],
    );
    await client.query(
      `INSERT INTO "CategoryGroupAssignment" ("categoryId", "groupId") VALUES ($1, $2)`,
      [category[0].id, group[0].id],
    );
    const { rows: visibleResource } = await client.query(
      `INSERT INTO "Resource" (type, title, body, "coinReward", "sortOrder", "isPublished")
       VALUES ('note', $1, 'Видно тестовой группе', 1, 1, true) RETURNING id`,
      [E2E_VISIBLE_RESOURCE],
    );
    await client.query(
      `INSERT INTO "ResourceGroupAssignment" ("resourceId", "groupId") VALUES ($1, $2)`,
      [visibleResource[0].id, group[0].id],
    );
    await client.query(
      `INSERT INTO "Resource" (type, title, body, "coinReward", "sortOrder", "isPublished")
       VALUES ('note', $1, 'Не назначено тестовой группе', 1, 2, true)`,
      [E2E_HIDDEN_RESOURCE],
    );
    const { rows: copyCategory } = await client.query(
      `INSERT INTO "Category" (name, icon, track, "isPublished")
       VALUES ($1, '📘', 'intro', false) RETURNING id`,
      [E2E_COPY_COURSE],
    );
    await client.query(
      `INSERT INTO "Lesson" (title, "categoryId", content, "xpReward", "coinReward", "sortOrder", "isPublished")
       VALUES ($1, $2, $3, 10, 5, 1, false)`,
      [E2E_COPY_LESSON, copyCategory[0].id, LESSON_CONTENT],
    );

    // Ачивка «первый урок»: цель 1 → откроется ровно на этом уроке.
    // Проверяем заодно, что тост и начисление монет работают.
    await client.query(
      `INSERT INTO "Achievement" (title, description, icon, metric, "targetValue", "rewardCurrency", "isActive")
       VALUES ('Первый урок', 'Пройден первый урок.', '🎯', 'lessons_completed', 1, 25, true)`,
    );

    // Миграция achievements_v2 засеяла 8 «встроенных» ачивок — в песочнице
    // они мешают (лишние тосты). Оставляем только нашу.
    await client.query(`DELETE FROM "Achievement" WHERE code IS NOT NULL`);

    const pinHash = await bcrypt.hash(E2E_PIN, 10);
    await client.query(
      `INSERT INTO "User"
         (id, name, "mentorLabel", "profileConfiguredAt", "pinHash", "groupId", "isAdmin")
       VALUES (gen_random_uuid(), $1, $1, NOW(), $2, $3, false)`,
      [E2E_STUDENT, pinHash, group[0].id],
    );
    const adminPinHash = await bcrypt.hash(E2E_ADMIN_PIN, 10);
    await client.query(
      `INSERT INTO "User" (id, name, "pinHash", "isAdmin")
       VALUES (gen_random_uuid(), $1, $2, true)`,
      [E2E_ADMIN, adminPinHash],
    );

    return {
      lessonId: lesson[0].id,
      copyCourseId: copyCategory[0].id,
    };
  } finally {
    await client.end();
  }
}

export async function dropSandbox(): Promise<void> {
  const client = new pg.Client({ connectionString: baseUrl() });
  await client.connect();
  try {
    await client.query(`DROP SCHEMA IF EXISTS "${E2E_SCHEMA}" CASCADE`);
  } finally {
    await client.end();
  }
}

/** Проверка, что ручные работы не меняют прогресс и экономику ученика. */
export async function readStudentRewards(): Promise<{
  totalXp: number;
  currency: number;
}> {
  const client = new pg.Client({ connectionString: baseUrl() });
  await client.connect();
  try {
    await client.query(`SET search_path TO "${E2E_SCHEMA}"`);
    const { rows } = await client.query<{
      totalXp: number;
      currency: number;
    }>(
      `SELECT "totalXp", currency FROM "User" WHERE name = $1 AND "isAdmin" = false`,
      [E2E_STUDENT],
    );
    if (!rows[0]) {
      throw new Error("Тестовый ученик не найден.");
    }
    return rows[0];
  } finally {
    await client.end();
  }
}

/** Изолирует сценарий живого занятия от сессий, созданных другими E2E-тестами. */
export async function resetClassroomSessions(): Promise<void> {
  const client = new pg.Client({ connectionString: baseUrl() });
  await client.connect();
  try {
    await client.query(`SET search_path TO "${E2E_SCHEMA}"`);
    await client.query(`DELETE FROM "ClassSession"`);
  } finally {
    await client.end();
  }
}
