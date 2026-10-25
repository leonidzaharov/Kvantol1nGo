import { describe, expect, it } from "vitest";

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
function content(): StoredPracticeContent {
  return { format: "practice-v1", theory: "# Повторение", questions: [{ id: "sums", variants: [choice, text, match] }], bonusQuestions: [] };
}

describe("PracticeContentSchema", () => {
  it("accepts the three variant kinds and fills optional fields", () => {
    const input = { format: "practice-v1", questions: content().questions };
    expect(PracticeContentSchema.parse(input)).toEqual({ ...content(), theory: "" });
  });

  it("rejects empty routes, one variant, code and unrecognised fields", () => {
    for (const input of [
      { ...content(), questions: [] },
      { ...content(), questions: [{ id: "i", variants: [choice] }] },
      { ...content(), questions: [{ id: "i", variants: [choice, { ...text, type: "code" }] }] },
      { ...content(), version: 1 },
    ]) expect(PracticeContentSchema.safeParse(input).success).toBe(false);
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
