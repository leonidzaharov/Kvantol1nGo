import { describe, expect, it } from "vitest";

import {
  parseReviewAssignmentInput,
  parseReviewDecision,
  parseReviewResponse,
} from "./review-assignment-input";

describe("parseReviewAssignmentInput", () => {
  it("requires a language only for code", () => {
    expect(
      parseReviewAssignmentInput({
        title: "Проект",
        instructions: "Сделай проект",
        responseType: "CODE",
        codeLanguage: "",
      }).ok,
    ).toBe(false);

    expect(
      parseReviewAssignmentInput({
        title: "Проект",
        instructions: "Сделай проект",
        responseType: "CODE",
        codeLanguage: "PYTHON",
      }),
    ).toMatchObject({
      ok: true,
      data: { responseType: "CODE", codeLanguage: "PYTHON" },
    });
  });
});

describe("parseReviewResponse", () => {
  it("accepts only https links", () => {
    expect(parseReviewResponse("LINK", "http://example.com").ok).toBe(false);
    expect(parseReviewResponse("LINK", "https://example.com/project")).toEqual({
      ok: true,
      data: "https://example.com/project",
    });
  });

  it("keeps code as text", () => {
    expect(parseReviewResponse("CODE", "<script>alert(1)</script>")).toEqual({
      ok: true,
      data: "<script>alert(1)</script>",
    });
  });
});

describe("parseReviewDecision", () => {
  it("requires feedback when work is returned", () => {
    expect(
      parseReviewDecision({
        decision: "REVISION_REQUESTED",
        mentorComment: "",
      }).ok,
    ).toBe(false);
    expect(
      parseReviewDecision({ decision: "ACCEPTED", mentorComment: "" }),
    ).toEqual({
      ok: true,
      data: { decision: "ACCEPTED", mentorComment: null },
    });
  });
});
