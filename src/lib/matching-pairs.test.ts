import { describe, expect, it } from "vitest";

import { connectMatchingPair, matchingAnswerComplete, shuffleMatchingCards } from "./matching-pairs";

const left = [{ id: "a", label: "А" }, { id: "b", label: "Б" }];
const right = [{ id: "x", label: "В" }, { id: "y", label: "Г" }];
const pairs = [{ leftId: "a", rightId: "x" }, { leftId: "b", rightId: "y" }];

describe("matching interaction", () => {
  it("replaces occupied links on either side without mutating the draft", () => {
    expect(connectMatchingPair(pairs, "a", "y")).toEqual([{ leftId: "a", rightId: "y" }]);
    expect(pairs).toHaveLength(2);
  });

  it("checks only completeness, so a fully connected wrong answer can be submitted", () => {
    expect(matchingAnswerComplete(left, right, pairs)).toBe(true);
    expect(matchingAnswerComplete(left, right, [{ leftId: "a", rightId: "y" }, { leftId: "b", rightId: "x" }])).toBe(true);
  });

  it("rejects incomplete, duplicate and foreign connections", () => {
    expect(matchingAnswerComplete(left, right, [])).toBe(false);
    expect(matchingAnswerComplete(left, right, [pairs[0], pairs[0]])).toBe(false);
    expect(matchingAnswerComplete(left, right, [{ leftId: "a", rightId: "x" }, { leftId: "b", rightId: "x" }])).toBe(false);
    expect(matchingAnswerComplete(left, right, [{ leftId: "foreign", rightId: "x" }, pairs[1]])).toBe(false);
    expect(matchingAnswerComplete([], [], [])).toBe(false);
  });

  it("keeps initial ordering hydration-safe and preserves all card identities", () => {
    const cards = Array.from({ length: 8 }, (_, i) => ({ id: String(i), label: `Карточка ${i}` }));
    const order = shuffleMatchingCards(cards, "session:left");
    expect(shuffleMatchingCards(cards, "session:left")).toEqual(order);
    expect(new Set(order.map(({ id }) => id))).toEqual(new Set(cards.map(({ id }) => id)));
    expect(cards.map(({ id }) => id)).toEqual(["0", "1", "2", "3", "4", "5", "6", "7"]);
  });
});
