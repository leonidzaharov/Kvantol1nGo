import type { LessonQuestionsImport } from "@/lib/lesson-document";
import type { StoredPracticeItem, StoredPracticeVariant } from "@/lib/practice-content";

type IdFactory = () => string;
export const createPracticeId: IdFactory = () => {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // getRandomValues also works when the local admin opens the site over HTTP.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

export function createPracticeVariant(
  type: StoredPracticeVariant["type"],
  nextId: IdFactory = createPracticeId,
): StoredPracticeVariant {
  const base = { id: nextId(), prompt: "", explanation: "" };
  if (type === "text") return { ...base, type, correctAnswer: "" };
  if (type === "choice") return { ...base, type, options: ["", ""], correctIndex: 0 };
  if (type === "code") return { ...base, type, language: "python", starterCode: "", expectedOutput: "", referenceSolution: "" };
  const left = [{ id: nextId(), label: "" }, { id: nextId(), label: "" }];
  const right = [{ id: nextId(), label: "" }, { id: nextId(), label: "" }];
  return {
    ...base, type, left, right,
    correctPairs: left.map((card, index) => ({ leftId: card.id, rightId: right[index].id })),
  };
}

export function createPracticeItem(
  type: StoredPracticeVariant["type"],
  nextId: IdFactory = createPracticeId,
): StoredPracticeItem {
  return {
    id: nextId(), intro: "",
    variants: [createPracticeVariant(type, nextId), createPracticeVariant(type, nextId)],
  };
}

/** Imports keep their stable IDs. Duplicate practice items require explicit replacement. */
export function mergeLessonQuestionImport(
  current: LessonQuestionsImport,
  incoming: LessonQuestionsImport,
  mode: "append" | "replace",
  allowFormatChange: boolean,
): LessonQuestionsImport {
  if (current.format !== incoming.format && (!allowFormatChange || current.questions.length + current.bonusQuestions.length > 0)) {
    throw new Error("Формат импортируемых заданий отличается. Создай новый урок для этого формата.");
  }
  if (mode === "replace" || current.format !== incoming.format) return incoming;
  const questions = [...current.questions, ...incoming.questions];
  const bonusQuestions = [...current.bonusQuestions, ...incoming.bonusQuestions];
  if (questions.length > 50 || bonusQuestions.length > 20) {
    throw new Error("В уроке допускается до 50 основных и 20 дополнительных заданий.");
  }
  if (current.format === "practice-v1" && incoming.format === "practice-v1") {
    const all = [...current.questions, ...current.bonusQuestions, ...incoming.questions, ...incoming.bonusQuestions];
    if (new Set(all.map((item) => item.id)).size !== all.length) {
      throw new Error("В импорте повторяются ID пунктов. Выбери замену заданий или задай новым пунктам новые ID.");
    }
    return { format: "practice-v1", questions: [...current.questions, ...incoming.questions], bonusQuestions: [...current.bonusQuestions, ...incoming.bonusQuestions] };
  }
  if (current.format === "classic" && incoming.format === "classic") {
    return { format: "classic", questions: [...current.questions, ...incoming.questions], bonusQuestions: [...current.bonusQuestions, ...incoming.bonusQuestions] };
  }
  return incoming;
}
