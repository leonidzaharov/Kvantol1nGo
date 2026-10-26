// Synthetic browser-test content. Only the disposable e2e schema is written.
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import pg from "pg";
import { PracticeContentSchema } from "../src/lib/practice-content";
import { E2E_COURSE, E2E_GROUP, E2E_PIN, E2E_SCHEMA } from "./sandbox";

export const PRACTICE_CODE = {
  firstPrompt: "Выдай пропуск каждому имени. Исправь переменную в print.",
  secondPrompt: "Выведи каждый предмет рюкзака. Используй текущий item.",
  wrong: 'students = ["Мира", "Тео"]\nfor student in students:\n    print("Пропуск: " + students)',
  firstSolution: 'students = ["Мира", "Тео"]\nfor student in students:\n    print("Пропуск: " + student)',
  secondSolution: 'items = ["карта", "вода"]\nfor item in items:\n    print(item)',
  explanation: "students хранит весь список, а student получает одно текущее имя. Для строки пропуска нужно текущее имя.",
};

export type PracticeFixture = { lessonId: number; userId: string; studentName: string; title: string };

function client() {
  const value = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!value) throw new Error("Для E2E нужна локальная PostgreSQL.");
  const url = new URL(value);
  if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) throw new Error("Code practice E2E requires loopback PostgreSQL.");
  return new pg.Client({ connectionString: value });
}

const content = PracticeContentSchema.parse({
  format: "practice-v1", theory: "",
  questions: [
    {
      id: "current-item", variants: [
        { id: "names", type: "code", language: "python", prompt: PRACTICE_CODE.firstPrompt,
          starterCode: PRACTICE_CODE.wrong, referenceSolution: PRACTICE_CODE.firstSolution,
          expectedOutput: "Пропуск: Мира\nПропуск: Тео", explanation: PRACTICE_CODE.explanation },
        { id: "bag", type: "code", language: "python", prompt: PRACTICE_CODE.secondPrompt,
          starterCode: 'items = ["карта", "вода"]\nfor item in items:\n    print(items)',
          referenceSolution: PRACTICE_CODE.secondSolution, expectedOutput: "карта\nвода",
          explanation: "items хранит все предметы, item получает по одному предмету на каждом шаге." },
      ],
    },
    { id: "range", variants: [0, 1].map((n) => ({
      id: `range-${n}`, type: "choice", prompt: "Сколько чисел даёт range(1, 4)?",
      options: ["3", "4"], correctIndex: 0, explanation: "Правая граница не входит: получаются 1, 2, 3.",
    })) },
    { id: "condition", variants: [0, 1].map((n) => ({
      id: `condition-${n}`, type: "text", prompt: "При каком energy станет ложным условие energy < 3?",
      correctAnswer: "3", explanation: "При значении 3 проверка 3 < 3 ложна.",
    })) },
  ],
  bonusQuestions: [{ id: "bonus", variants: [0, 1].map((n) => ({
    id: `bonus-${n}`, type: "text", prompt: "Сколько повторов у range(2)?",
    correctAnswer: "2", explanation: "Диапазон содержит 0 и 1, всего два значения.",
  })) }],
});

export async function createPracticeFixture(): Promise<PracticeFixture> {
  const connection = client();
  await connection.connect();
  try {
    await connection.query("BEGIN");
    // Missing e2e schema must fail, never fall back to public.
    const group = await connection.query<{ id: number }>(`SELECT id FROM "${E2E_SCHEMA}"."Group" WHERE name = $1`, [E2E_GROUP]);
    const category = await connection.query<{ id: number }>(`SELECT id FROM "${E2E_SCHEMA}"."Category" WHERE name = $1`, [E2E_COURSE]);
    if (!group.rows[0] || !category.rows[0]) throw new Error("E2E sandbox fixtures not found.");
    const userId = randomUUID();
    const studentName = `Практика Python ${userId.slice(0, 8)}`;
    await connection.query(
      `INSERT INTO "${E2E_SCHEMA}"."User" (id, name, "mentorLabel", "pinHash", "groupId", "profileConfiguredAt", "privacyAcceptedAt")
       VALUES ($1, $2, $2, $3, $4, NOW(), NOW())`,
      [userId, studentName, await bcrypt.hash(E2E_PIN, 10), group.rows[0].id],
    );
    const title = `Практика циклов ${userId.slice(0, 8)}`;
    const lesson = await connection.query<{ id: number }>(
      `INSERT INTO "${E2E_SCHEMA}"."Lesson" (title, "categoryId", content, "xpReward", "coinReward", "sortOrder", "isPublished")
       VALUES ($1, $2, $3, 10, 20, 999, true) RETURNING id`,
      [title, category.rows[0].id, JSON.stringify(content)],
    );
    await connection.query("COMMIT");
    return { lessonId: lesson.rows[0].id, userId, studentName, title };
  } catch (error) {
    await connection.query("ROLLBACK");
    throw error;
  } finally { await connection.end(); }
}

export async function readPracticeState(fixture: PracticeFixture) {
  const connection = client();
  await connection.connect();
  try {
    const progress = await connection.query<{ answeredCore: number[]; isCompleted: boolean; wrongAttempts: number }>(
      `SELECT "answeredCore", "isCompleted", "wrongAttempts" FROM "${E2E_SCHEMA}"."UserLessonProgress" WHERE "lessonId"=$1 AND "userId"=$2`,
      [fixture.lessonId, fixture.userId],
    );
    const user = await connection.query<{ currency: number }>(`SELECT currency FROM "${E2E_SCHEMA}"."User" WHERE id=$1`, [fixture.userId]);
    return { progress: progress.rows[0] ?? null, currency: user.rows[0].currency };
  } finally { await connection.end(); }
}
