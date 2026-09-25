import { describe, expect, it } from "vitest";

import { calculateLevel, countQuestions } from "./gamification-logic";

describe("calculateLevel", () => {
  it("0 XP — это уровень 1 (стартовый)", () => {
    expect(calculateLevel(0)).toBe(1);
  });

  it("99 XP всё ещё уровень 1, 100 XP — уже уровень 2", () => {
    expect(calculateLevel(99)).toBe(1);
    expect(calculateLevel(100)).toBe(2);
  });

  it("растёт по 100 XP на уровень", () => {
    expect(calculateLevel(250)).toBe(3);
    expect(calculateLevel(600)).toBe(7);
  });
});

describe("countQuestions", () => {
  it("считает элементы массива questions", () => {
    const content = JSON.stringify({ questions: [{}, {}, {}] });
    expect(countQuestions(content)).toBe(3);
  });

  it("нет поля questions → 0", () => {
    expect(countQuestions(JSON.stringify({ title: "урок" }))).toBe(0);
  });

  it("кривой JSON → 0, без падения", () => {
    expect(countQuestions("{не json")).toBe(0);
  });
});
