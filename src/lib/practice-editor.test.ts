import { describe, expect, it } from "vitest";

import { createPracticeItem, createPracticeVariant, mergeLessonQuestionImport } from "./practice-editor";
import type { LessonQuestionsImport } from "./lesson-document";

const classic = (): Extract<LessonQuestionsImport, { format: "classic" }> => ({
  format: "classic", questions: [{ type: "text", prompt: "Дважды два?", correctAnswer: "4" }], bonusQuestions: [],
});
function practice(id: string): Extract<LessonQuestionsImport, { format: "practice-v1" }> {
  return {
    format: "practice-v1", questions: [{ id, intro: "Попробуй", variants: [
      { id: "first", type: "text", prompt: "Дважды два?", correctAnswer: "4", explanation: "Сложили 2 и 2" },
      { id: "second", type: "text", prompt: "Трижды два?", correctAnswer: "6", explanation: "Сложили три двойки" },
    ] }], bonusQuestions: [],
  };
}

describe("practice editor drafts", () => {
  it("creates two variants with independent stable IDs without mutating the draft", () => {
    let id = 0;
    const item = createPracticeItem("match", () => `id-${++id}`);
    expect(item.variants).toHaveLength(2);
    expect(item.variants.every((variant) => variant.type === "match")).toBe(true);
    const ids = [item.id, ...item.variants.flatMap((variant) => variant.type === "match" ? [variant.id, ...variant.left.map((card) => card.id), ...variant.right.map((card) => card.id)] : [variant.id])];
    expect(new Set(ids).size).toBe(ids.length);
    for (const variant of item.variants) {
      if (variant.type !== "match") continue;
      expect(variant.correctPairs).toEqual(variant.left.map((card, index) => ({ leftId: card.id, rightId: variant.right[index].id })));
    }
  });

  it("does not retain answers of a different variant type", () => {
    const variant = createPracticeVariant("choice", () => "variant");
    expect(variant).toEqual({ id: "variant", type: "choice", prompt: "", explanation: "", options: ["", ""], correctIndex: 0 });
    expect(variant).not.toHaveProperty("correctAnswer");
    expect(variant).not.toHaveProperty("correctPairs");
  });

  it("creates two independent Python teaching variants with explicitly empty author fields", () => {
    let id = 0;
    const item = createPracticeItem("code", () => `code-${++id}`);
    expect(item.id).toBe("code-1");
    expect(item.variants).toEqual(["code-2", "code-3"].map((variantId) => ({
      id: variantId, type: "code", prompt: "", explanation: "", language: "python",
      starterCode: "", expectedOutput: "", referenceSolution: "",
    })));
    expect(item.variants[0]).not.toBe(item.variants[1]);
    expect(item.variants[0]).not.toHaveProperty("correctPairs");
    expect(item.variants[0]).not.toHaveProperty("correctAnswer");
  });
});

describe("safe lesson question imports", () => {
  it("appends classic questions while preserving bonus sections", () => {
    const incoming = classic();
    incoming.bonusQuestions = [incoming.questions[0]];
    const merged = mergeLessonQuestionImport(classic(), incoming, "append", false);
    expect(merged.questions).toHaveLength(2);
    expect(merged.bonusQuestions).toHaveLength(1);
  });

  it("keeps imported solutions, explanations and IDs unchanged", () => {
    const incoming = practice("new-item");
    const merged = mergeLessonQuestionImport(practice("old-item"), incoming, "append", false);
    if (merged.format !== "practice-v1") throw new Error("Expected practice import");
    expect(merged.questions[1]).toEqual(incoming.questions[0]);
    expect(merged.questions[0].id).toBe("old-item");
  });

  it("rejects a cross-format replacement unless the caller explicitly allows adoption", () => {
    expect(() => mergeLessonQuestionImport(classic(), practice("item"), "replace", false)).toThrow("Формат");
    expect(mergeLessonQuestionImport({ format: "classic", questions: [], bonusQuestions: [] }, practice("item"), "append", true)).toEqual(practice("item"));
  });

  it("rejects duplicate IDs across core and bonus without renaming imported IDs", () => {
    const incoming = practice("item");
    incoming.bonusQuestions = incoming.questions;
    incoming.questions = [];
    expect(() => mergeLessonQuestionImport(practice("item"), incoming, "append", false)).toThrow("ID");
    expect(mergeLessonQuestionImport(practice("item"), practice("item"), "replace", false)).toEqual(practice("item"));
  });

  it("does not mutate existing content during append or replacement", () => {
    const current = practice("before");
    const snapshot = structuredClone(current);
    mergeLessonQuestionImport(current, practice("after"), "append", false);
    mergeLessonQuestionImport(current, practice("after"), "replace", false);
    expect(current).toEqual(snapshot);
  });

  it("checks combined section limits", () => {
    const current = classic();
    current.questions = Array.from({ length: 50 }, () => classic().questions[0]);
    expect(() => mergeLessonQuestionImport(current, classic(), "append", false)).toThrow("50");
  });
});
