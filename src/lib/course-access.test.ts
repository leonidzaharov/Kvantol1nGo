import { describe, expect, it } from "vitest";

import {
  categoryIsAccessible,
  lessonIsAccessible,
  type LearningContext,
} from "./course-access-logic";

const student: LearningContext = {
  isAdmin: false,
  groupId: 7,
  track: "intro",
};
const category = {
  isPublished: true,
  track: "intro" as const,
  groupIds: [7, 8],
};

describe("categoryIsAccessible", () => {
  it("allows an assigned group into a published course", () => {
    expect(categoryIsAccessible(student, category)).toBe(true);
  });

  it("rejects a draft and an unassigned group", () => {
    expect(categoryIsAccessible(student, { ...category, isPublished: false })).toBe(false);
    expect(categoryIsAccessible(student, { ...category, groupIds: [8] })).toBe(false);
  });

  it("rejects a student without a group and allows an admin", () => {
    expect(categoryIsAccessible({ ...student, groupId: null, track: null }, category)).toBe(false);
    expect(categoryIsAccessible({ ...student, isAdmin: true }, { ...category, isPublished: false })).toBe(true);
  });
});

describe("lessonIsAccessible", () => {
  it("inherits all course groups when unrestricted", () => {
    expect(lessonIsAccessible(student, {
      isPublished: true,
      category,
      restrictedGroupIds: [],
    })).toBe(true);
  });

  it("can be narrowed to selected groups", () => {
    expect(lessonIsAccessible(student, {
      isPublished: true,
      category,
      restrictedGroupIds: [8],
    })).toBe(false);
  });

  it("rejects lesson and course drafts", () => {
    expect(lessonIsAccessible(student, {
      isPublished: false,
      category,
      restrictedGroupIds: [],
    })).toBe(false);
    expect(lessonIsAccessible(student, {
      isPublished: true,
      category: { ...category, isPublished: false },
      restrictedGroupIds: [],
    })).toBe(false);
  });
});
