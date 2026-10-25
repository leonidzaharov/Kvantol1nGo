import type { MatchingCard, MatchingPair } from "./practice-types";

/** Reconnecting an occupied card replaces its old link on either side. */
export function connectMatchingPair(
  pairs: readonly MatchingPair[],
  leftId: string,
  rightId: string,
): MatchingPair[] {
  return [
    ...pairs.filter((pair) => pair.leftId !== leftId && pair.rightId !== rightId),
    { leftId, rightId },
  ];
}

/** Checks completeness only, never whether the answer is correct. */
export function matchingAnswerComplete(
  left: readonly MatchingCard[],
  right: readonly MatchingCard[],
  pairs: readonly MatchingPair[],
): boolean {
  if (left.length < 2 || left.length > 8 || right.length !== left.length) return false;
  const leftIds = new Set(left.map((card) => card.id));
  const rightIds = new Set(right.map((card) => card.id));
  return leftIds.size === left.length && rightIds.size === right.length &&
    pairs.length === left.length &&
    new Set(pairs.map((pair) => pair.leftId)).size === left.length &&
    new Set(pairs.map((pair) => pair.rightId)).size === right.length &&
    pairs.every((pair) => leftIds.has(pair.leftId) && rightIds.has(pair.rightId));
}

/** Called once on mounting a variant; never shuffle on every render. */
export function shuffleMatchingCards(cards: readonly MatchingCard[], seed: string): MatchingCard[] {
  const result = [...cards];
  // Stable seed keeps the first render identical during hydration.
  let state = 2166136261;
  for (const char of seed) state = Math.imul(state ^ char.charCodeAt(0), 16777619) >>> 0;
  for (let i = result.length - 1; i > 0; i -= 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const j = state % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
