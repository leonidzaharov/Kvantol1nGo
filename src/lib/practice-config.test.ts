import { describe, expect, it } from "vitest";
import { practiceItemsValid } from "./practice-config";
import type { PracticeItem } from "./practice-types";

const item: PracticeItem = {
  id: "code", variants: ["first", "second"].map((id) => ({
    id, type: "code", prompt: "Напечатай число", language: "python", starterCode: "print(1)",
  })),
};

describe("public practice code contract", () => {
  it("accepts code without private grading or feedback fields", () => {
    expect(practiceItemsValid([item])).toBe(true);
  });
  it("rejects oversized starter programs and unsupported runtime languages", () => {
    const code = item.variants[0];
    if (code.type !== "code") throw new Error("fixture");
    expect(practiceItemsValid([{ ...item, variants: [{ ...code, starterCode: "x".repeat(10001) }, item.variants[1]] }])).toBe(false);
    expect(practiceItemsValid([{ ...item, variants: [{ ...code, language: "bash" } as unknown as typeof code, item.variants[1]] }])).toBe(false);
  });
});
