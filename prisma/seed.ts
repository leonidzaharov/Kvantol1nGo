import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PrismaClient } from "../src/generated/prisma/index.js";
import {
  LessonContentSchema,
  type LessonContent,
} from "../src/lib/lesson-content";

// ============================================================
// Сидер-пайплайн уроков
//
// Уроки больше не лежат в этом файле — они читаются из
// `prisma/seed-lessons/<категория>/*.json`. Имя папки = слаг
// категории, `category.json` внутри хранит её отображаемое имя.
// Чтобы добавить урок: положить новый JSON в нужную папку.
// Чтобы добавить категорию: создать папку + category.json.
//
// При каждом запуске seed чистит каталог (категории/уроки) и
// пересоздаёт его из файловой системы. Прогресс учеников по урокам
// сбрасывается тоже — иначе FK на удалённые уроки висят битыми.
// ============================================================

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED_LESSONS_DIR = path.join(__dirname, "seed-lessons");

const databaseUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("Сид: задайте DIRECT_URL или DATABASE_URL в .env");
}
const adapter = new PrismaPg({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter });

// ---------- Типы JSON-файлов ----------

/** Содержимое <slug>/<NN-name>.json. */
type LessonFile = {
  title: string;
  /** Сколько XP начисляется за первое прохождение. По умолчанию 30. */
  xpReward?: number;
  /** Сколько монет начисляется за первое прохождение. По умолчанию 5. */
  coinReward?: number;
  /** Порядок отображения. Если не задан — берётся из префикса имени файла. */
  sortOrder?: number;
  /** Новые уроки по умолчанию можно оставить черновиками. */
  isPublished?: boolean;
  /** Теорию можно хранить прямо в JSON или рядом в отдельном Markdown-файле. */
  theory?: string;
  theoryFile?: string;
  questions?: unknown[];
  bonusQuestions?: unknown[];
};

/** Содержимое <slug>/category.json. */
type CategoryMeta = {
  name: string;
  icon?: string;
};

type LoadedLesson = {
  title: string;
  xpReward: number;
  coinReward: number;
  sortOrder: number;
  isPublished: boolean;
  content: LessonContent;
};

type LoadedCategory = {
  slug: string;
  meta: CategoryMeta;
  lessons: LoadedLesson[];
};

// ---------- Чтение и валидация ----------

function readJsonFile<T>(filepath: string): T {
  const raw = fs.readFileSync(filepath, "utf-8");
  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    throw new Error(
      `${filepath}: некорректный JSON — ${(err as Error).message}`,
    );
  }
}

function validateLesson(filepath: string, data: LessonFile): LessonContent {
  if (typeof data.title !== "string" || data.title.length === 0) {
    throw new Error(`${filepath}: поле "title" отсутствует или пустое`);
  }

  if (data.theory !== undefined && data.theoryFile !== undefined) {
    throw new Error(
      `${filepath}: используйте только одно из полей "theory" или "theoryFile"`,
    );
  }

  let theory = data.theory ?? "";
  if (data.theoryFile !== undefined) {
    const lessonDirectory = path.resolve(path.dirname(filepath));
    const theoryPath = path.resolve(lessonDirectory, data.theoryFile);
    if (
      path.dirname(theoryPath) !== lessonDirectory ||
      path.extname(theoryPath).toLowerCase() !== ".md"
    ) {
      throw new Error(`${filepath}: theoryFile должен указывать на соседний .md-файл`);
    }
    if (!fs.existsSync(theoryPath)) {
      throw new Error(`${filepath}: файл теории не найден — ${data.theoryFile}`);
    }
    theory = fs.readFileSync(theoryPath, "utf-8");
  }

  const parsed = LessonContentSchema.safeParse({
    theory,
    questions: data.questions ?? [],
    bonusQuestions: data.bonusQuestions ?? [],
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(
      `${filepath}: некорректный контент — ${issue?.message ?? "неизвестная ошибка"}`,
    );
  }
  if (parsed.data.theory.trim() === "" && parsed.data.questions.length === 0) {
    throw new Error(`${filepath}: урок не должен быть пустым`);
  }
  return parsed.data;
}

function loadCategories(): LoadedCategory[] {
  if (!fs.existsSync(SEED_LESSONS_DIR)) {
    throw new Error(`Папка с уроками не найдена: ${SEED_LESSONS_DIR}`);
  }

  const folders = fs
    .readdirSync(SEED_LESSONS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    // Алфавитный порядок папок — детерминированный seed.
    .sort((a, b) => a.name.localeCompare(b.name));

  return folders.map((dir) => {
    const categoryPath = path.join(SEED_LESSONS_DIR, dir.name);
    const metaPath = path.join(categoryPath, "category.json");
    if (!fs.existsSync(metaPath)) {
      throw new Error(`${categoryPath}: отсутствует category.json`);
    }
    const meta = readJsonFile<CategoryMeta>(metaPath);
    if (typeof meta.name !== "string" || meta.name.length === 0) {
      throw new Error(`${metaPath}: поле "name" отсутствует или пустое`);
    }

    const lessonFiles = fs
      .readdirSync(categoryPath)
      .filter((f) => f.endsWith(".json") && f !== "category.json")
      .sort();

    const lessons: LoadedLesson[] = lessonFiles.map((filename, idx) => {
      const filepath = path.join(categoryPath, filename);
      const data = readJsonFile<LessonFile>(filepath);
      const content = validateLesson(filepath, data);

      // sortOrder: явное поле > префикс имени файла > позиция в списке.
      const prefixMatch = /^(\d+)/.exec(filename);
      const fromName = prefixMatch ? parseInt(prefixMatch[1]!, 10) : NaN;
      const sortOrder =
        data.sortOrder ?? (Number.isFinite(fromName) ? fromName : idx + 1);

      return {
        title: data.title,
        xpReward: data.xpReward ?? 30,
        coinReward: data.coinReward ?? 5,
        sortOrder,
        isPublished: data.isPublished ?? true,
        content,
      };
    });

    return { slug: dir.name, meta, lessons };
  });
}

// ---------- Сброс ----------

async function resetCatalog(): Promise<void> {
  // Удаляем в порядке, обратном зависимостям, чтобы FK не ругался.
  // userLessonProgress нужно чистить перед lesson.deleteMany — иначе FK
  // на удалённый lessonId сделает delete невозможным.
  await prisma.userLessonProgress.deleteMany();
  await prisma.lesson.deleteMany();
  await prisma.category.deleteMany();
}

// ---------- main ----------

async function main(): Promise<void> {
  console.log("🌱 Запуск seed-скрипта...");

  // Сначала прочитаем и провалидируем файлы — пусть seed упадёт
  // до того, как успеет что-то снести из БД.
  const categories = loadCategories();
  const totalLessons = categories.reduce((sum, c) => sum + c.lessons.length, 0);
  console.log(
    `📁 Найдено в seed-lessons: ${categories.length} категорий, ${totalLessons} уроков`,
  );

  // Защита от случайного запуска на БД с реальным прогрессом учеников.
  // Если в таблице UserLessonProgress есть данные и не задан SEED_FORCE=1,
  // скрипт прерывается — чтобы не уничтожить прогресс FK-каскадом.
  const existingProgress = await prisma.userLessonProgress.count();
  if (existingProgress > 0 && process.env.SEED_FORCE !== "1") {
    console.error(
      `\n❌ В БД уже есть ${existingProgress} записей UserLessonProgress.\n` +
        `   Seed чистит каталог уроков — это уничтожит прогресс!\n` +
        `   Если это намеренно, запустите:\n\n` +
        `     SEED_FORCE=1 npx tsx prisma/seed.ts\n`,
    );
    process.exit(1);
  }

  await resetCatalog();
  console.log("🧹 Каталог очищен.");

  // Тестовый ученик (PIN: 1234) — оставляем для удобной локальной авторизации.
  const pinHash = await bcrypt.hash("1234", 10);
  const demoGroup = await prisma.group.upsert({
    where: { name: "demo-01" },
    update: { track: "intro" },
    create: { name: "demo-01", track: "intro" },
  });
  const user = await prisma.user.upsert({
    where: { id: "user-123" },
    update: {
      groupId: demoGroup.id,
      mentorLabel: "Иван Иванов",
      profileConfiguredAt: new Date(),
    },
    create: {
      id: "user-123",
      name: "Иван Иванов",
      mentorLabel: "Иван Иванов",
      profileConfiguredAt: new Date(),
      pinHash,
      groupId: demoGroup.id,
      totalXp: 150,
      level: 2,
      currency: 50,
    },
  });
  console.log(`👤 Пользователь: ${user.name} (id=${user.id}, PIN=1234)`);

  for (const category of categories) {
    const created = await prisma.category.create({
      data: {
        name: category.meta.name,
        icon: category.meta.icon ?? null,
        isPublished: true,
        groupAccess: { create: { groupId: demoGroup.id } },
      },
    });
    for (const lesson of category.lessons) {
      await prisma.lesson.create({
        data: {
          categoryId: created.id,
          title: lesson.title,
          content: JSON.stringify(lesson.content),
          xpReward: lesson.xpReward,
          coinReward: lesson.coinReward,
          sortOrder: lesson.sortOrder,
          isPublished: lesson.isPublished,
        },
      });
    }
    console.log(
      `📚 ${category.meta.name} (${category.slug}): ${category.lessons.length} уроков`,
    );
  }

  console.log("🎉 Seed успешно завершён!");
}

main()
  .catch((e) => {
    console.error("❌ Ошибка при выполнении seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
