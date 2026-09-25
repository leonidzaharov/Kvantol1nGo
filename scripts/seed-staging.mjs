#!/usr/bin/env node

import "dotenv/config";
import bcrypt from "bcryptjs";
import { Client } from "pg";

import { deploymentIsolationErrors } from "./env-safety.mjs";

const ADMIN_ID = "staging-admin";
const STUDENT_IDS = ["staging-student-1", "staging-student-2"];
const allowedUserIds = [ADMIN_ID, ...STUDENT_IDS];

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(2);
}

if (process.env.KVANTO_DEPLOYMENT_ENV !== "staging") {
  fail("нужно KVANTO_DEPLOYMENT_ENV=staging");
}
if (process.env.STAGING_DATABASE_CONFIRM !== "isolated-test-data") {
  fail("нужно STAGING_DATABASE_CONFIRM=isolated-test-data");
}

const isolationErrors = deploymentIsolationErrors({
  ...process.env,
  VERCEL_ENV: "preview",
});
if (isolationErrors.length > 0) {
  fail(isolationErrors.join("; "));
}

const adminPin = process.env.STAGING_ADMIN_PIN ?? "";
const studentPin = process.env.STAGING_STUDENT_PIN ?? "";
if (!/^\d{8,10}$/.test(adminPin)) {
  fail("STAGING_ADMIN_PIN должен содержать 8–10 цифр");
}
if (!/^\d{4}$/.test(studentPin)) {
  fail("STAGING_STUDENT_PIN должен содержать ровно 4 цифры");
}
const secondStudentPin = String((Number(studentPin) + 1) % 10_000).padStart(4, "0");

const databaseUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!databaseUrl) fail("не задан DIRECT_URL или DATABASE_URL");
const client = new Client({ connectionString: databaseUrl });
await client.connect();

try {
  await client.query("BEGIN");

  // Главный предохранитель: скрипт работает только на пустой БД или на уже
  // созданном им staging. Наличие любого настоящего профиля прекращает запуск.
  const foreignUsers = await client.query(
    `SELECT id FROM "User" WHERE NOT (id = ANY($1::text[])) LIMIT 1`,
    [allowedUserIds],
  );
  if (foreignUsers.rowCount > 0) {
    throw new Error(
      "в базе есть профиль, не принадлежащий staging; данные не изменены",
    );
  }

  const group = await client.query(
    `INSERT INTO "Group" (name, track)
     VALUES ('staging-01', 'intro')
     ON CONFLICT (name) DO UPDATE SET track = EXCLUDED.track
     RETURNING id`,
  );
  const groupId = group.rows[0].id;
  const [adminPinHash, studentPinHash, secondStudentPinHash] = await Promise.all([
    bcrypt.hash(adminPin, 10),
    bcrypt.hash(studentPin, 10),
    bcrypt.hash(secondStudentPin, 10),
  ]);
  await client.query(
    `INSERT INTO "User" (id, name, "pinHash", "isAdmin", "createdAt")
     VALUES ($1, 'Тестовый наставник', $2, true, NOW())
     ON CONFLICT (id) DO UPDATE
     SET name = EXCLUDED.name, "pinHash" = EXCLUDED."pinHash", "isAdmin" = true`,
    [ADMIN_ID, adminPinHash],
  );

  for (const [index, id] of STUDENT_IDS.entries()) {
    await client.query(
      `INSERT INTO "User"
         (id, name, "mentorLabel", "profileConfiguredAt", "pinHash", "isAdmin", "groupId", "createdAt")
       VALUES ($1, $2, $2, NOW(), $3, false, $4, NOW())
       ON CONFLICT (id) DO UPDATE
       SET name = EXCLUDED.name, "mentorLabel" = EXCLUDED."mentorLabel",
           "profileConfiguredAt" = EXCLUDED."profileConfiguredAt",
           "pinHash" = EXCLUDED."pinHash", "isAdmin" = false,
           "groupId" = EXCLUDED."groupId"`,
      [
        id,
        `Тестовый ученик ${index + 1}`,
        index === 0 ? studentPinHash : secondStudentPinHash,
        groupId,
      ],
    );
  }

  const existingCategory = await client.query(
    `SELECT id FROM "Category" WHERE name = 'Staging · Проверка' LIMIT 1`,
  );
  const category = existingCategory.rows[0]
    ? await client.query(
        `UPDATE "Category"
         SET icon = '🧪', track = 'intro', "isPublished" = true
         WHERE id = $1 RETURNING id`,
        [existingCategory.rows[0].id],
      )
    : await client.query(
        `INSERT INTO "Category" (name, icon, track, "isPublished")
         VALUES ('Staging · Проверка', '🧪', 'intro', true) RETURNING id`,
      );
  const categoryId = category.rows[0].id;

  await client.query(
    `INSERT INTO "CategoryGroupAssignment" ("categoryId", "groupId")
     VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [categoryId, groupId],
  );

  const lessonContent = JSON.stringify({
    theory:
      "# Проверка staging\n\nЭтот урок существует только в тестовом окружении.",
    questions: [
      {
        type: "choice",
        prompt: "Какое это окружение?",
        options: ["Production", "Staging"],
        correctIndex: 1,
      },
      {
        type: "text",
        prompt: "Напиши слово: тест",
        correctAnswer: "тест",
      },
    ],
    bonusQuestions: [
      {
        type: "choice",
        prompt: "Можно ли здесь использовать данные настоящих учеников?",
        options: ["Нет", "Да"],
        correctIndex: 0,
      },
    ],
  });
  const existingLesson = await client.query(
    `SELECT id FROM "Lesson"
     WHERE "categoryId" = $1 AND title = 'Проверочный урок' LIMIT 1`,
    [categoryId],
  );
  if (existingLesson.rows[0]) {
    await client.query(
      `UPDATE "Lesson"
       SET content = $2, "xpReward" = 10, "coinReward" = 5,
           "sortOrder" = 1, "isPublished" = true
       WHERE id = $1`,
      [existingLesson.rows[0].id, lessonContent],
    );
  } else {
    await client.query(
      `INSERT INTO "Lesson"
       ("categoryId", title, content, "xpReward", "coinReward", "sortOrder", "isPublished")
       VALUES ($1, 'Проверочный урок', $2, 10, 5, 1, true)`,
      [categoryId, lessonContent],
    );
  }

  const existingResource = await client.query(
    `SELECT id FROM "Resource" WHERE title = 'Staging · Интересное' LIMIT 1`,
  );
  const resource = existingResource.rows[0]
    ? await client.query(
        `UPDATE "Resource"
         SET type = 'note', body = 'Тестовая карточка для проверки группового доступа.',
             "coinReward" = 1, "sortOrder" = 1, "isPublished" = true
         WHERE id = $1 RETURNING id`,
        [existingResource.rows[0].id],
      )
    : await client.query(
        `INSERT INTO "Resource"
         (type, title, body, "coinReward", "sortOrder", "isPublished")
         VALUES ('note', 'Staging · Интересное',
                 'Тестовая карточка для проверки группового доступа.', 1, 1, true)
         RETURNING id`,
      );
  await client.query(
    `INSERT INTO "ResourceGroupAssignment" ("resourceId", "groupId")
     VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [resource.rows[0].id, groupId],
  );

  const existingAssignment = await client.query(
    `SELECT id FROM "ReviewAssignment"
     WHERE title = 'Staging · Работа на проверку' LIMIT 1`,
  );
  const assignment = existingAssignment.rows[0]
    ? await client.query(
        `UPDATE "ReviewAssignment"
         SET instructions = 'Отправь короткий тестовый текст.',
             "responseType" = 'TEXT', status = 'PUBLISHED',
             "publishedAt" = COALESCE("publishedAt", NOW()),
             "updatedAt" = NOW()
         WHERE id = $1 RETURNING id`,
        [existingAssignment.rows[0].id],
      )
    : await client.query(
        `INSERT INTO "ReviewAssignment"
         (title, instructions, "responseType", status, "publishedAt", "createdAt", "updatedAt")
         VALUES ('Staging · Работа на проверку',
                 'Отправь короткий тестовый текст.', 'TEXT', 'PUBLISHED', NOW(), NOW(), NOW())
         RETURNING id`,
      );
  await client.query(
    `INSERT INTO "ReviewAssignmentGroup" ("assignmentId", "groupId")
     VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [assignment.rows[0].id, groupId],
  );

  await client.query("COMMIT");
  console.log("✓ Staging заполнен безопасными тестовыми данными.");
  console.log("  Наставник: Тестовый наставник");
  console.log("  Ученики: Тестовый ученик 1, Тестовый ученик 2");
  console.log("  PIN намеренно не выводятся; они взяты из переменных окружения.");
} catch (error) {
  await client.query("ROLLBACK");
  console.error(`✗ Staging не изменён: ${error.message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
