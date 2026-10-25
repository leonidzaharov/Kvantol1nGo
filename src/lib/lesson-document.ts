import { LessonContentSchema, type LessonContent, type LessonQuestion } from "./lesson-content";
import { MAX_PRACTICE_BYTES, PracticeContentSchema, type StoredPracticeContent, type StoredPracticeItem } from "./practice-content";

export type LessonDocument = LessonContent | StoredPracticeContent;
export type LessonQuestionsImport =
  | { format: "classic"; questions: LessonQuestion[]; bonusQuestions: LessonQuestion[] }
  | { format: "practice-v1"; questions: StoredPracticeItem[]; bonusQuestions: StoredPracticeItem[] };

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isPracticeContent(content: LessonDocument): content is StoredPracticeContent {
  return "format" in content && content.format === "practice-v1";
}

/** Strict format dispatch. A broken or unknown format must not become an empty lesson. */
export function parseLessonDocument(raw: string): LessonDocument | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (!isObject(value)) return null;
    if ("format" in value) {
      if (value.format !== "practice-v1" || new TextEncoder().encode(raw).byteLength > MAX_PRACTICE_BYTES) return null;
      const result = PracticeContentSchema.safeParse(value);
      return result.success && parseLessonMarkdown(result.data.theory).questionImport === null ? result.data : null;
    }
    if (!("theory" in value || "questions" in value || "bonusQuestions" in value)) return null;
    const result = LessonContentSchema.safeParse(value);
    return result.success && parseLessonMarkdown(result.data.theory).questionImport === null ? result.data : null;
  } catch {
    return null;
  }
}

/** Throws before editor state changes; a format marker is never silently discarded. */
export function parseLessonQuestionsImport(raw: unknown): LessonQuestionsImport {
  if (isObject(raw) && "format" in raw) {
    if (raw.format !== "practice-v1") throw new Error("Неизвестный формат урока. Поддерживается practice-v1 или классический JSON без format");
    if (new TextEncoder().encode(JSON.stringify(raw)).byteLength > MAX_PRACTICE_BYTES) throw new Error("Практика превышает 256 KiB UTF-8");
    const result = PracticeContentSchema.safeParse(raw);
    if (!result.success) throw new Error(`Некорректная практика: ${result.error.issues[0]?.message ?? "проверьте JSON"}`);
    return { format: "practice-v1", questions: result.data.questions, bonusQuestions: result.data.bonusQuestions };
  }
  const value = Array.isArray(raw) ? { questions: raw } : raw;
  if (!isObject(value) || !("questions" in value || "bonusQuestions" in value)) throw new Error("Нужен массив вопросов или объект с questions и bonusQuestions");
  const result = LessonContentSchema.safeParse(value);
  if (!result.success) throw new Error(`Некорректные задания: ${result.error.issues[0]?.message ?? "проверьте JSON"}`);
  if (result.data.questions.length + result.data.bonusQuestions.length === 0) throw new Error("В JSON нет заданий");
  return { format: "classic", questions: result.data.questions, bonusQuestions: result.data.bonusQuestions };
}

/** Optional fenced command is removed before Markdown rendering or image uploads. */
export function parseLessonMarkdown(raw: string): { theory: string; questionImport: LessonQuestionsImport | null } {
  let fence: { marker: string; length: number; special: boolean; start: number; bodyStart: number } | null = null;
  let command: { start: number; end: number; body: string } | null = null;
  let offset = 0;
  for (const chunk of raw.matchAll(/[^\n]*(?:\n|$)/g)) {
    const line = chunk[0].replace(/\r?\n$/, "");
    const match = /^ {0,3}(`{3,}|~{3,})([^\r\n]*)$/.exec(offset === 0 ? line.replace(/^\uFEFF/, "") : line);
    if (match) {
      const marker = match[1][0];
      const length = match[1].length;
      const info = match[2].trim();
      if (fence) {
        if (marker === fence.marker && length >= fence.length && info === "") {
          if (fence.special) command = { start: fence.start, end: offset + chunk[0].length, body: raw.slice(fence.bodyStart, offset) };
          fence = null;
        }
      } else {
        const special = /^kvantolingo(?:\s|$)/i.test(info);
        if (special && info.toLowerCase() !== "kvantolingo") throw new Error("После kvantolingo не нужны дополнительные параметры");
        if (special && command) throw new Error("В Markdown допускается только один блок kvantolingo");
        fence = { marker, length, special, start: offset, bodyStart: offset + chunk[0].length };
      }
    }
    offset += chunk[0].length;
  }
  if (fence?.special) throw new Error("Закройте блок kvantolingo строкой с теми же обратными кавычками");
  if (!command) return { theory: raw, questionImport: null };
  let json: unknown;
  try {
    json = JSON.parse(command.body);
  } catch {
    throw new Error("В блоке kvantolingo должен быть корректный JSON заданий");
  }
  return {
    theory: raw.slice(0, command.start) + raw.slice(command.end),
    questionImport: parseLessonQuestionsImport(json),
  };
}
