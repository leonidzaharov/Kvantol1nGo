import { z } from "zod";

// ============================================================
// Формат Lesson.content (JSON-строка в БД).
//
// Версия 3: { theory?: string, questions: [...], bonusQuestions?: [...] }
//   theory        — markdown-гайд, показывается перед вопросами;
//   questions     — обязательные вопросы и кодовые задания;
//   bonusQuestions — необязательные задания со звёздочкой после основной части.
//
// Обратная совместимость: старые уроки хранят вопросы без поля type —
// такие считаются choice. Отсутствие theory = урок без теории.
// ============================================================

export const ChoiceQuestionSchema = z
  .object({
    type: z.literal("choice").optional(),
    prompt: z.string().trim().min(1).max(1000),
    options: z.array(z.string().trim().min(1).max(300)).min(2).max(8),
    correctIndex: z.number().int().min(0),
  })
  .refine((q) => q.correctIndex < q.options.length, {
    message: "correctIndex вне диапазона вариантов",
  });

// Языки, на которых ученик пишет код-задания. Python — через Pyodide,
// JavaScript — через браузерный worker (см. src/lib/code-runner.ts).
export const CODE_LANGUAGES = ["python", "javascript"] as const;
export type CodeLanguage = (typeof CODE_LANGUAGES)[number];

export const CodeQuestionSchema = z.object({
  type: z.literal("code"),
  prompt: z.string().trim().min(1).max(3000),
  /**
   * Язык задания. По умолчанию python — так старые уроки (без поля) остаются
   * питоновскими. Вводные группы могут давать и JavaScript.
   */
  language: z.enum(CODE_LANGUAGES).default("python"),
  /** Код, с которого ученик начинает (может быть пустым). */
  starterCode: z.string().max(10000).default(""),
  /**
   * Ожидаемый вывод программы (stdout). Сверяется «мягко» — кавычки, лишние
   * пробелы, ё/е и пустые строки по краям прощаются (см. output-match.ts).
   */
  expectedOutput: z.string().min(1).max(3000),
  /**
   * Эталонное решение наставника (не показывается ученику). В админке кнопка
   * «Запустить решение» выполняет его и заполняет expectedOutput из вывода —
   * чтобы ожидаемый текст не набирался руками с опечатками.
   */
  referenceSolution: z.string().max(10000).default(""),
});

export const TextQuestionSchema = z.object({
  type: z.literal("text"),
  prompt: z.string().trim().min(1).max(1000),
  /** Эталон хранится только на сервере и не попадает в браузер ученика. */
  correctAnswer: z.string().trim().min(1).max(1000),
});

// Типы с обязательным литералом type идут первыми. Старый формат без type = choice.
export const LessonQuestionSchema = z.union([
  CodeQuestionSchema,
  TextQuestionSchema,
  ChoiceQuestionSchema,
]);

export const LessonContentSchema = z.object({
  theory: z.string().max(50000).default(""),
  questions: z.array(LessonQuestionSchema).max(50).default([]),
  bonusQuestions: z.array(LessonQuestionSchema).max(20).default([]),
});

export type ChoiceQuestion = z.infer<typeof ChoiceQuestionSchema>;
export type CodeQuestion = z.infer<typeof CodeQuestionSchema>;
export type TextQuestion = z.infer<typeof TextQuestionSchema>;
export type LessonQuestion = z.infer<typeof LessonQuestionSchema>;
export type LessonContent = z.infer<typeof LessonContentSchema>;

/**
 * Разбор content из БД с защитой от битого JSON: на любой ошибке возвращаем
 * пустой урок, а не роняем страницу (так вёл себя и старый код).
 */
export function parseLessonContent(raw: string): LessonContent {
  try {
    const parsed = LessonContentSchema.safeParse(JSON.parse(raw));
    if (parsed.success) {
      return parsed.data;
    }
  } catch {
    /* битый JSON */
  }
  return { theory: "", questions: [], bonusQuestions: [] };
}

/** Тип вопроса с учётом старого формата (нет type = choice). */
export function questionKind(
  q: { type?: string },
): "choice" | "code" | "text" {
  if (q.type === "code") return "code";
  if (q.type === "text") return "text";
  return "choice";
}

// ============================================================
// «Безопасная» версия контента — то, что можно отдать в браузер ученика.
//
// Полный LessonContent содержит ответы: correctIndex у вопросов и
// referenceSolution у код-заданий. Всё, что попало в клиентский компонент,
// видно через F12 — поэтому ответы из payload вырезаются, а проверка
// вариантов делается server action'ом (см. checkAnswer в gamification.ts).
// expectedOutput остаётся: по нему браузерный раннер сверяет вывод, и он же
// показывается ученику как подсказка после второй неудачи.
// ============================================================

export type SafeChoiceQuestion = {
  type?: "choice";
  prompt: string;
  options: string[];
};

export type SafeCodeQuestion = {
  type: "code";
  prompt: string;
  language: CodeLanguage;
  starterCode: string;
  expectedOutput: string;
};

export type SafeTextQuestion = {
  type: "text";
  prompt: string;
};

export type SafeLessonQuestion =
  | SafeChoiceQuestion
  | SafeCodeQuestion
  | SafeTextQuestion;

export type SafeLessonContent = {
  theory: string;
  questions: SafeLessonQuestion[];
  bonusQuestions: SafeLessonQuestion[];
};

function sanitizeQuestions(
  questions: LessonQuestion[],
): SafeLessonQuestion[] {
  return questions.map((q): SafeLessonQuestion => {
    if (q.type === "code") {
      return {
        type: "code",
        prompt: q.prompt,
        language: q.language,
        starterCode: q.starterCode,
        expectedOutput: q.expectedOutput,
      };
    }
    if (q.type === "text") {
      return { type: "text", prompt: q.prompt };
    }
    return { type: "choice", prompt: q.prompt, options: q.options };
  });
}

/** Вырезает ответы из контента перед отправкой на клиент. */
export function sanitizeLessonContent(
  content: LessonContent,
): SafeLessonContent {
  return {
    theory: content.theory,
    questions: sanitizeQuestions(content.questions),
    bonusQuestions: sanitizeQuestions(content.bonusQuestions),
  };
}
