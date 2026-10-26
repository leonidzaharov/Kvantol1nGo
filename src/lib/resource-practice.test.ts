import { describe, expect, it } from "vitest";
import { parsePracticeLessonId, resourceFormType, resourcePracticeLessonId } from "./resource-practice";

describe("practice resource links", () => {
  it("accepts a bounded internal lesson path and canonicalizes numeric IDs", () => {
    expect(parsePracticeLessonId(" /lesson/00042/ ")).toBe(42);
    expect(parsePracticeLessonId("/lesson/1000000")).toBe(1_000_000);
  });
  it.each([null, "", "/lesson/0", "/lesson/-1", "/lesson/1000001", "/lesson/42?next=x", "/lesson/42#x", "/lesson/42/preview", "//example.org/lesson/42", "https://example.org/lesson/42", "/lesson/4.2", "/lesson/%34%32"])("rejects a noncanonical destination: %s", (url) => {
    expect(parsePracticeLessonId(url)).toBeNull();
  });
  it("recognizes only stored article links as practice", () => {
    expect(resourcePracticeLessonId({ type: "article", url: "/lesson/42" })).toBe(42);
    expect(resourceFormType({ type: "article", url: "/lesson/42" })).toBe("practice");
    expect(resourceFormType({ type: "article", url: "https://example.org/lesson/42" })).toBe("article");
    expect(resourcePracticeLessonId({ type: "note", url: "/lesson/42" })).toBeNull();
  });
});
