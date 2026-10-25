// Public client contract only. No solutions, grading or rewards belong here.
export type MatchingCard = { id: string; label: string };
export type MatchingPair = { leftId: string; rightId: string };

type VariantBase = { id: string; prompt: string };
export type PracticeVariant =
  | (VariantBase & { type: "choice"; options: string[] })
  | (VariantBase & { type: "text" })
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
};

export type PracticeCheckResult =
  | { kind: "checked"; correct: boolean; feedback: PracticeFeedback }
  | { kind: "invalid" }
  | { kind: "content-changed" };

export type CheckPracticeAnswer = (
  attempt: PracticeAttempt,
  signal: AbortSignal,
) => Promise<PracticeCheckResult>;
