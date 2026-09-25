import { describe, expect, it } from "vitest";

import { normalizeTextAnswer, textAnswersMatch } from "./text-answer";

describe("soft text answer check", () => {
  it("ignores case, repeated spaces and trailing punctuation", () => {
    expect(textAnswersMatch("  Я   программирую.  ", "я программирую")).toBe(
      true,
    );
    expect(textAnswersMatch("Ответ?!", "ответ")).toBe(true);
  });

  it("keeps meaningful punctuation inside the answer", () => {
    expect(textAnswersMatch("казнить, нельзя", "казнить нельзя")).toBe(false);
  });

  it("does not accept an empty normalized answer", () => {
    expect(normalizeTextAnswer(" ... ")).toBe("");
    expect(textAnswersMatch("...", "...")).toBe(false);
  });
});
