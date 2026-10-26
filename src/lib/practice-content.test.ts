import { describe, expect, it } from "vitest";
import { MAX_PRACTICE_OUTPUT } from "./practice-types";

import {
  gradePracticeVariant,
  PracticeAttemptInputSchema,
  PracticeContentSchema,
  sanitizePracticeContent,
  type StoredPracticeContent,
  type StoredPracticeVariant,
} from "./practice-content";

const choice: StoredPracticeVariant = {
  id: "v1", type: "choice", prompt: "Сколько?", options: ["2", "3"], correctIndex: 0, explanation: "Два шага.",
};
const text: StoredPracticeVariant = {
  id: "v2", type: "text", prompt: "Назови действие", correctAnswer: "Идти вперёд", explanation: "Блок перемещает героя.",
};
const match: StoredPracticeVariant = {
  id: "v3", type: "match", prompt: "Соедини",
  left: [{ id: "l1", label: "2 + 2" }, { id: "l2", label: "3 + 3" }],
  right: [{ id: "r6", label: "6" }, { id: "r4", label: "4" }],
  correctPairs: [{ leftId: "l1", rightId: "r4" }, { leftId: "l2", rightId: "r6" }],
  explanation: "Посчитай каждую сумму.",
};
const code: Extract<StoredPracticeVariant, { type: "code" }> = {
  id: "code1", type: "code", language: "python", prompt: "Выдай пропуски каждому имени.",
  starterCode: 'students = ["Мира", "Тео"]\nfor student in students:\n    print("Пропуск: " + students)',
  expectedOutput: "Пропуск: Мира\nПропуск: Тео",
  referenceSolution: 'students = ["Мира", "Тео"]\nfor student in students:\n    print("Пропуск: " + student)',
  explanation: "students хранит весь список, student хранит одно текущее имя.",
};
function content(): StoredPracticeContent {
  return { format: "practice-v1", theory: "# Повторение", questions: [{ id: "sums", variants: [choice, text, match] }], bonusQuestions: [] };
}

describe("PracticeContentSchema", () => {
  it("accepts the three variant kinds and fills optional fields", () => {
    const input = { format: "practice-v1", questions: content().questions };
    expect(PracticeContentSchema.parse(input)).toEqual({ ...content(), theory: "" });
  });

  it("rejects empty routes, one variant, malformed code and unrecognised fields", () => {
    for (const input of [
      { ...content(), questions: [] },
      { ...content(), questions: [{ id: "i", variants: [choice] }] },
      { ...content(), questions: [{ id: "i", variants: [choice, { ...text, type: "code" }] }] },
      { ...content(), version: 1 },
    ]) expect(PracticeContentSchema.safeParse(input).success).toBe(false);
  });

  it("accepts code with private teaching feedback and defaults its language and starter", () => {
    const input = { ...content(), questions: [{ id: "code", variants: [code, {
      id: "empty", type: "code", prompt: "Программа без вывода", expectedOutput: "",
      referenceSolution: "pass", explanation: "Без print программа ничего не печатает.",
    }] }] };
    expect(PracticeContentSchema.parse(input).questions[0].variants).toEqual([code, {
      id: "empty", type: "code", language: "python", starterCode: "",
      prompt: "Программа без вывода", expectedOutput: "", referenceSolution: "pass",
      explanation: "Без print программа ничего не печатает.",
    }]);
  });

  it("rejects missing reference solutions, unsupported languages and oversized code fields", () => {
    for (const invalid of [
      { ...code, referenceSolution: "   " }, { ...code, referenceSolution: "a".repeat(10001) },
      { ...code, starterCode: "a".repeat(10001) }, { ...code, expectedOutput: "a".repeat(3001) },
      { ...code, language: "bash" }, { ...code, expectedOutput: null }, { ...code, passed: true },
    ]) {
      expect(PracticeContentSchema.safeParse({ ...content(), questions: [{ id: "code", variants: [choice, invalid] }] }).success).toBe(false);
    }
  });

  it("rejects duplicate item IDs across the main and bonus queues and duplicate variant IDs", () => {
    const input = content();
    expect(PracticeContentSchema.safeParse({ ...input, bonusQuestions: input.questions }).success).toBe(false);
    expect(PracticeContentSchema.safeParse({ ...input, questions: [{ id: "i", variants: [choice, choice] }] }).success).toBe(false);
  });

  it("rejects incomplete, repeated, unknown and ambiguous matching keys", () => {
    const invalidVariants = [
      { ...match, correctPairs: match.type === "match" ? match.correctPairs.slice(0, 1) : [] },
      { ...match, correctPairs: [{ leftId: "l1", rightId: "r4" }, { leftId: "l1", rightId: "r6" }] },
      { ...match, correctPairs: [{ leftId: "l1", rightId: "r4" }, { leftId: "l2", rightId: "missing" }] },
      { ...match, right: [{ id: "l1", label: "4" }, { id: "r6", label: "6" }] },
    ];
    for (const variant of invalidVariants) {
      expect(PracticeContentSchema.safeParse({ ...content(), questions: [{ id: "i", variants: [choice, variant] }] }).success).toBe(false);
    }
  });

  it("applies the UTF-8 byte limit, rather than a character limit", () => {
    const input = content();
    input.questions = Array.from({ length: 40 }, (_, i) => ({
      id: `i${i}`, variants: [
        { ...text, id: "a", prompt: "я".repeat(2999), explanation: "я".repeat(999) },
        { ...text, id: "b", prompt: "я".repeat(2999), explanation: "я".repeat(999) },
      ],
    }));
    expect(PracticeContentSchema.safeParse(input).success).toBe(false);
  });
});

describe("sanitizePracticeContent", () => {
  it("removes every private field at every depth and keeps bonus questions safe", () => {
    const input = content();
    input.bonusQuestions = [{ id: "bonus", variants: [choice, match] }];
    const safe = sanitizePracticeContent(input);
    const serialized = JSON.stringify(safe);
    for (const privateKey of ["correctIndex", "correctAnswer", "correctPairs", "explanation"]) {
      expect(serialized).not.toContain(privateKey);
    }
    expect(safe.questions[0].variants[2]).toEqual({
      id: "v3", type: "match", prompt: "Соедини", left: match.type === "match" ? match.left : [], right: match.type === "match" ? match.right : [],
    });
  });

  it("keeps code runnable without disclosing expected output, reference code or explanations", () => {
    const input = { ...content(), questions: [{ id: "code", variants: [code, choice] }], bonusQuestions: [{ id: "bonus", variants: [code, text] }] };
    const safe = sanitizePracticeContent(input);
    expect(safe.questions[0].variants[0]).toEqual({
      id: code.id, type: "code", prompt: code.prompt, language: code.language, starterCode: code.starterCode,
    });
    expect(safe.bonusQuestions[0].variants[0]).toEqual(safe.questions[0].variants[0]);
    const serialized = JSON.stringify(safe);
    for (const privateKey of ["referenceSolution", "expectedOutput", "explanation", "correctIndex", "correctAnswer"]) {
      expect(serialized).not.toContain(privateKey);
    }
    expect(serialized).not.toContain(JSON.stringify(code.referenceSolution));
  });
});

describe("gradePracticeVariant", () => {
  it("returns choice feedback after both valid correct and incorrect attempts", () => {
    expect(gradePracticeVariant(choice, { type: "choice", optionIndex: 0 })).toMatchObject({ kind: "checked", correct: true, feedback: { answer: "2", explanation: "Два шага." } });
    expect(gradePracticeVariant(choice, { type: "choice", optionIndex: 1 })).toMatchObject({ kind: "checked", correct: false });
  });

  it("reuses existing text normalisation and comparison", () => {
    expect(gradePracticeVariant(text, { type: "text", text: "  ИДТИ   вперёд! " })).toMatchObject({ kind: "checked", correct: true });
    expect(gradePracticeVariant(text, { type: "text", text: "повернуть" })).toMatchObject({ kind: "checked", correct: false });
  });

  it("compares the browser execution output using the existing output normalization", () => {
    expect(gradePracticeVariant(code, { type: "code", executionOk: true, output: "  Пропуск:   Мира\r\nПропуск: Тео\n" })).toEqual({
      kind: "checked", correct: true,
      feedback: { answer: code.referenceSolution, explanation: code.explanation, codeLanguage: "python", expectedOutput: code.expectedOutput },
    });
    expect(gradePracticeVariant(code, { type: "code", executionOk: true, output: "Пропуск: Тео\nПропуск: Мира" })).toMatchObject({ kind: "checked", correct: false });
  });

  it("returns a complete teaching explanation for runtime errors and mismatched output", () => {
    for (const answer of [
      { type: "code", executionOk: false, output: 'TypeError: can only concatenate str (not "list") to str' },
      { type: "code", executionOk: false, output: code.expectedOutput },
      { type: "code", executionOk: true, output: "" },
    ]) expect(gradePracticeVariant(code, answer)).toMatchObject({
      kind: "checked", correct: false,
      feedback: { answer: code.referenceSolution, explanation: code.explanation, codeLanguage: "python", expectedOutput: code.expectedOutput },
    });
  });

  it("can grade a deliberately empty expected output without granting a runtime failure", () => {
    const silent = { ...code, referenceSolution: "pass", expectedOutput: "" };
    expect(gradePracticeVariant(silent, { type: "code", executionOk: true, output: "" })).toMatchObject({ kind: "checked", correct: true });
    expect(gradePracticeVariant(silent, { type: "code", executionOk: false, output: "" })).toMatchObject({ kind: "checked", correct: false });
  });

  it("rejects malformed code attempts without revealing the reference solution", () => {
    for (const answer of [
      { type: "code", output: code.expectedOutput },
      { type: "code", executionOk: "true", output: code.expectedOutput },
      { type: "code", executionOk: true, output: code.expectedOutput, passed: true },
      { type: "code", executionOk: true, output: code.expectedOutput, code: "print(1)" },
      { type: "code", executionOk: true, output: "x".repeat(MAX_PRACTICE_OUTPUT + 1) },
      { type: "text", text: code.expectedOutput },
    ]) expect(gradePracticeVariant(code, answer)).toEqual({ kind: "invalid" });
    expect(gradePracticeVariant(code, { type: "code", executionOk: false, output: "x".repeat(MAX_PRACTICE_OUTPUT) })).toMatchObject({ kind: "checked", correct: false });
  });

  it("compares complete pair sets independently of submitted order", () => {
    if (match.type !== "match") throw new Error("fixture");
    expect(gradePracticeVariant(match, { type: "match", pairs: [...match.correctPairs].reverse() })).toMatchObject({ kind: "checked", correct: true, feedback: { correctPairs: match.correctPairs } });
    expect(gradePracticeVariant(match, { type: "match", pairs: [{ leftId: "l1", rightId: "r6" }, { leftId: "l2", rightId: "r4" }] })).toMatchObject({ kind: "checked", correct: false });
  });

  it("does not disclose solutions for malformed or incomplete submissions", () => {
    for (const answer of [null, { type: "text", text: "" }, { type: "choice", optionIndex: 99 }, { type: "choice", optionIndex: 0, reveal: true }]) {
      expect(gradePracticeVariant(choice, answer)).toEqual({ kind: "invalid" });
    }
    for (const pairs of [[], [{ leftId: "l1", rightId: "r4" }], [{ leftId: "l1", rightId: "r4" }, { leftId: "l1", rightId: "r6" }], [{ leftId: "unknown", rightId: "r4" }, { leftId: "l2", rightId: "r6" }]]) {
      expect(gradePracticeVariant(match, { type: "match", pairs })).toEqual({ kind: "invalid" });
    }
    expect(gradePracticeVariant(text, { type: "choice", optionIndex: 0 })).toEqual({ kind: "invalid" });
  });
});

describe("PracticeAttemptInputSchema", () => {
  const request = { lessonId: 1, revision: "a".repeat(64), section: "core", itemId: "i", variantId: "v", answer: { type: "choice", optionIndex: 0 } };
  it("accepts bounded attempts and rejects unknown fields and invalid revisions", () => {
    expect(PracticeAttemptInputSchema.safeParse(request).success).toBe(true);
    expect(PracticeAttemptInputSchema.safeParse({ ...request, lessonId: -1 }).success).toBe(false);
    expect(PracticeAttemptInputSchema.safeParse({ ...request, lessonId: 1_000_001 }).success).toBe(false);
    expect(PracticeAttemptInputSchema.safeParse({ ...request, revision: "old" }).success).toBe(false);
    expect(PracticeAttemptInputSchema.safeParse({ ...request, correct: true }).success).toBe(false);
  });
});
