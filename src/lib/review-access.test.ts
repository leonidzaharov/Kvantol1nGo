import { describe, expect, it } from "vitest";

import {
  canSubmitReviewAssignment,
  canViewReviewAssignment,
  type ReviewAccessSnapshot,
} from "./review-access";

const base: ReviewAccessSnapshot = {
  assignmentStatus: "PUBLISHED",
  studentId: "student-1",
  studentGroupId: 10,
  targetUserIds: [],
  targetGroupIds: [10],
  submissionStatus: null,
};

describe("review assignment access", () => {
  it("allows a targeted student to view and submit", () => {
    expect(canViewReviewAssignment(base)).toBe(true);
    expect(canSubmitReviewAssignment(base)).toBe(true);
  });

  it("does not expose a draft or another group's work", () => {
    expect(
      canViewReviewAssignment({ ...base, assignmentStatus: "DRAFT" }),
    ).toBe(false);
    expect(
      canViewReviewAssignment({ ...base, targetGroupIds: [99] }),
    ).toBe(false);
  });

  it("keeps own history visible but blocks archived resubmission", () => {
    const archived: ReviewAccessSnapshot = {
      ...base,
      assignmentStatus: "ARCHIVED",
      targetGroupIds: [],
      submissionStatus: "ACCEPTED",
    };
    expect(canViewReviewAssignment(archived)).toBe(true);
    expect(canSubmitReviewAssignment(archived)).toBe(false);
  });

  it("allows resubmission only after an explicit return", () => {
    expect(
      canSubmitReviewAssignment({ ...base, submissionStatus: "SUBMITTED" }),
    ).toBe(false);
    expect(
      canSubmitReviewAssignment({
        ...base,
        submissionStatus: "REVISION_REQUESTED",
      }),
    ).toBe(true);
    expect(
      canSubmitReviewAssignment({ ...base, submissionStatus: "ACCEPTED" }),
    ).toBe(false);
  });
});
