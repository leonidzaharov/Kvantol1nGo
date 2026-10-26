// Public client contract only. No solutions, grading or rewards belong here.
import type { CodeLanguage } from "./lesson-content";

export const MAX_PRACTICE_OUTPUT = 10_000;

export type MatchingCard = { id: string; label: string };
export type MatchingPair = { leftId: string; rightId: string };

type VariantBase = { id: string; prompt: string };
export type PracticeVariant =
  | (VariantBase & { type: "choice"; options: string[] })
  | (VariantBase & { type: "text" })
  | (VariantBase & { type: "code"; language: CodeLanguage; starterCode: string })
  | (VariantBase & {
      type: "match";
      left: MatchingCard[];
      right: MatchingCard[];
    });

export type PracticeItem = {
  id: string;
  intro?: string;
  variants: PracticeVariant[];
};

export type PracticeAnswer =
  | { type: "choice"; optionIndex: number }
  | { type: "text"; text: string }
  | { type: "code"; executionOk: boolean; output: string }
  | { type: "match"; pairs: MatchingPair[] };

export type PracticeAttempt = {
  itemId: string;
  variantId: string;
  answer: PracticeAnswer;
};

export type PracticeFeedback = {
  answer: string;
  explanation: string;
  // Returned by the checker after an attempt, never in the initial question.
  correctPairs?: MatchingPair[];
  codeLanguage?: CodeLanguage;
  expectedOutput?: string;
};

export type PracticeCheckResult =
  | { kind: "checked"; correct: boolean; feedback: PracticeFeedback }
  | { kind: "invalid" }
  | { kind: "content-changed" };

export type CheckPracticeAnswer = (
  attempt: PracticeAttempt,
  signal: AbortSignal,
) => Promise<PracticeCheckResult>;
