import { z } from "zod";

import { CODE_LANGUAGES, normalizeLessonImages, normalizeTheoryHtml } from "./lesson-content";
import { matchingAnswerComplete } from "./matching-pairs";
import { outputsMatch } from "./output-match";
import { textAnswersMatch } from "./text-answer";
import { MAX_PRACTICE_OUTPUT } from "./practice-types";
import type { PracticeCheckResult, PracticeItem } from "./practice-types";

export const MAX_PRACTICE_BYTES = 256 * 1024;

const IdSchema = z.string().trim().min(1).max(48);
const CardSchema = z.object({ id: IdSchema, label: z.string().trim().min(1).max(160) }).strict();
const PairSchema = z.object({ leftId: IdSchema, rightId: IdSchema }).strict();
const variantBase = {
  id: IdSchema,
  prompt: z.string().trim().min(1).max(3000),
  explanation: z.string().trim().min(1).max(1000),
};

const StoredChoiceVariantSchema = z.object({
  ...variantBase,
  type: z.literal("choice"),
  options: z.array(z.string().trim().min(1).max(300)).min(2).max(8),
  correctIndex: z.number().int().min(0),
}).strict().refine((variant) => variant.correctIndex < variant.options.length, {
  message: "correctIndex вне диапазона вариантов",
});

const StoredTextVariantSchema = z.object({
  ...variantBase,
  type: z.literal("text"),
  correctAnswer: z.string().trim().min(1).max(1000),
}).strict();

const StoredCodeVariantSchema = z.object({
  ...variantBase,
  type: z.literal("code"),
  language: z.enum(CODE_LANGUAGES).default("python"),
  starterCode: z.string().max(10000).default(""),
  expectedOutput: z.string().max(3000),
  referenceSolution: z.string().trim().min(1).max(10000),
}).strict();

const StoredMatchingVariantSchema = z.object({
  ...variantBase,
  type: z.literal("match"),
  left: z.array(CardSchema).min(2).max(8),
  right: z.array(CardSchema).min(2).max(8),
  correctPairs: z.array(PairSchema).min(2).max(8),
}).strict().superRefine((variant, ctx) => {
  if (!matchingAnswerComplete(variant.left, variant.right, variant.correctPairs)) {
    ctx.addIssue({ code: "custom", message: "Эталон должен соединять каждую карточку ровно один раз" });
  }
  const ids = [...variant.left, ...variant.right].map((card) => card.id);
  if (new Set(ids).size !== ids.length) {
    ctx.addIssue({ code: "custom", message: "ID карточек должны быть уникальными в обеих колонках" });
  }
});

export const StoredPracticeVariantSchema = z.discriminatedUnion("type", [
  StoredChoiceVariantSchema,
  StoredTextVariantSchema,
  StoredCodeVariantSchema,
  StoredMatchingVariantSchema,
]);

export const StoredPracticeItemSchema = z.object({
  id: IdSchema,
  intro: z.string().trim().max(800).optional(),
  variants: z.array(StoredPracticeVariantSchema).min(2).max(3),
}).strict().refine((item) => new Set(item.variants.map((variant) => variant.id)).size === item.variants.length, {
  message: "ID вариантов внутри пункта должны быть уникальными",
  path: ["variants"],
});

export const PracticeContentSchema = z.object({
  format: z.literal("practice-v1"),
  theory: z.string().max(50000).default("").transform((value) => normalizeLessonImages(normalizeTheoryHtml(value))),
  questions: z.array(StoredPracticeItemSchema).min(1).max(50),
  bonusQuestions: z.array(StoredPracticeItemSchema).max(20).default([]),
}).strict().superRefine((content, ctx) => {
  const items = [...content.questions, ...content.bonusQuestions];
  if (new Set(items.map((item) => item.id)).size !== items.length) {
    ctx.addIssue({ code: "custom", message: "ID пунктов должны быть уникальными во всём уроке" });
  }
  if (new TextEncoder().encode(JSON.stringify(content)).byteLength > MAX_PRACTICE_BYTES) {
    ctx.addIssue({ code: "custom", message: "Практика превышает 256 KiB UTF-8" });
  }
});

export type StoredPracticeVariant = z.infer<typeof StoredPracticeVariantSchema>;
export type StoredPracticeItem = z.infer<typeof StoredPracticeItemSchema>;
export type StoredPracticeContent = z.infer<typeof PracticeContentSchema>;

export type SafePracticeContent = {
  format: "practice-v1";
  theory: string;
  questions: PracticeItem[];
  bonusQuestions: PracticeItem[];
};

/** Enumerating public fields prevents answers and explanations leaking in the initial payload. */
export function sanitizePracticeContent(content: StoredPracticeContent): SafePracticeContent {
  const sanitize = (items: StoredPracticeItem[]): PracticeItem[] => items.map((item) => ({
    id: item.id,
    ...(item.intro === undefined ? {} : { intro: item.intro }),
    variants: item.variants.map((variant) => {
      const base = { id: variant.id, prompt: variant.prompt };
      if (variant.type === "choice") return { ...base, type: "choice", options: [...variant.options] };
      if (variant.type === "text") return { ...base, type: "text" };
      if (variant.type === "code") return { ...base, type: "code", language: variant.language, starterCode: variant.starterCode };
      return {
        ...base,
        type: "match",
        left: variant.left.map(({ id, label }) => ({ id, label })),
        right: variant.right.map(({ id, label }) => ({ id, label })),
      };
    }),
  }));
  return { format: "practice-v1", theory: content.theory, questions: sanitize(content.questions), bonusQuestions: sanitize(content.bonusQuestions) };
}

export const PracticeAnswerSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("choice"), optionIndex: z.number().int().min(0).max(7) }).strict(),
  z.object({ type: z.literal("text"), text: z.string().trim().min(1).max(1000) }).strict(),
  z.object({ type: z.literal("code"), executionOk: z.boolean(), output: z.string().max(MAX_PRACTICE_OUTPUT) }).strict(),
  z.object({ type: z.literal("match"), pairs: z.array(PairSchema).min(2).max(8) }).strict(),
]);

export const PracticeAttemptInputSchema = z.object({
  lessonId: z.number().int().positive().max(1_000_000),
  revision: z.string().regex(/^[a-f0-9]{64}$/),
  section: z.enum(["core", "bonus"]),
  itemId: IdSchema,
  variantId: IdSchema,
  answer: PracticeAnswerSchema,
}).strict();

/** Malformed attempts never receive the solution. The caller validates access and content revision. */
export function gradePracticeVariant(variant: StoredPracticeVariant, rawAnswer: unknown): PracticeCheckResult {
  const parsed = PracticeAnswerSchema.safeParse(rawAnswer);
  if (!parsed.success) return { kind: "invalid" };
  const answer = parsed.data;
  if (variant.type === "choice" && answer.type === "choice") {
    if (answer.optionIndex >= variant.options.length) return { kind: "invalid" };
    return {
      kind: "checked",
      correct: answer.optionIndex === variant.correctIndex,
      feedback: { answer: variant.options[variant.correctIndex], explanation: variant.explanation },
    };
  }
  if (variant.type === "text" && answer.type === "text") {
    return {
      kind: "checked",
      correct: textAnswersMatch(answer.text, variant.correctAnswer),
      feedback: { answer: variant.correctAnswer, explanation: variant.explanation },
    };
  }
  if (variant.type === "code" && answer.type === "code") {
    // Execution happens in the browser, as in classic code lessons. The server
    // compares its bounded result with the private expected output, not a passed flag.
    return {
      kind: "checked",
      correct: answer.executionOk && outputsMatch(answer.output, variant.expectedOutput),
      feedback: {
        answer: variant.referenceSolution,
        explanation: variant.explanation,
        codeLanguage: variant.language,
        expectedOutput: variant.expectedOutput,
      },
    };
  }
  if (variant.type === "match" && answer.type === "match") {
    if (!matchingAnswerComplete(variant.left, variant.right, answer.pairs)) return { kind: "invalid" };
    const expected = new Map(variant.correctPairs.map((pair) => [pair.leftId, pair.rightId]));
    return {
      kind: "checked",
      correct: answer.pairs.every((pair) => expected.get(pair.leftId) === pair.rightId),
      feedback: {
        answer: variant.correctPairs.map((pair) => `${variant.left.find((card) => card.id === pair.leftId)!.label} → ${variant.right.find((card) => card.id === pair.rightId)!.label}`).join("\n"),
        explanation: variant.explanation,
        correctPairs: variant.correctPairs.map(({ leftId, rightId }) => ({ leftId, rightId })),
      },
    };
  }
  return { kind: "invalid" };
}
