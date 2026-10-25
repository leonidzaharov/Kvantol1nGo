import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    $executeRaw: vi.fn(),
    lesson: { findUnique: vi.fn() },
    user: { findUniqueOrThrow: vi.fn(), update: vi.fn() },
    userLessonProgress: { findUnique: vi.fn(), upsert: vi.fn(), count: vi.fn() },
  };
  return {
    tx, transaction: vi.fn(async (run: (transaction: typeof tx) => unknown) => run(tx)),
    requireUser: vi.fn(), canAccess: vi.fn(), balanceLock: vi.fn(), achievements: vi.fn(), telemetry: vi.fn(), completion: vi.fn(),
  };
});
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { ...mocks.tx, $transaction: mocks.transaction } }));
vi.mock("@/lib/server-guard", async () => {
  const { z } = await import("zod");
  return {
    IdSchema: z.number().int().positive().max(1_000_000),
    parse: (schema: import("zod").ZodType, input: unknown) => schema.parse(input),
    requireUser: mocks.requireUser,
  };
});
vi.mock("@/lib/course-access", () => ({ canAccessLesson: mocks.canAccess }));
vi.mock("@/lib/student-balance-lock", () => ({ lockStudentBalance: mocks.balanceLock }));
vi.mock("@/lib/achievements", () => ({ advanceAchievements: mocks.achievements }));
vi.mock("@/lib/classroom-progress", () => ({ recordClassroomAttempt: mocks.telemetry, markClassroomLessonCompleted: mocks.completion }));

import { checkAnswer, checkTextAnswer, completeLesson } from "./gamification";
import { checkClassicLessonAttempt } from "../classic-lesson-attempt";
import { lessonRevision } from "../lesson-revision";
import { PracticeContentSchema } from "../practice-content";

const content = JSON.stringify(PracticeContentSchema.parse({
  format: "practice-v1", theory: "", questions: ["one", "two"].map((id) => ({
    id, variants: ["a", "b"].map((variantId) => ({ id: variantId, type: "text", prompt: "2 + 2?", correctAnswer: "4", explanation: "Две пары" })),
  })), bonusQuestions: [],
}));
const lesson = { id: 7, content, category: { id: 1, name: "Курс" }, xpReward: 10, coinReward: 20 };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue("user-123");
  mocks.canAccess.mockResolvedValue(true);
  mocks.tx.lesson.findUnique.mockResolvedValue(lesson);
  mocks.tx.userLessonProgress.findUnique.mockResolvedValue({ isCompleted: false, answeredCore: [0, 1], answeredCount: 2, wrongAttempts: 1 });
  mocks.tx.userLessonProgress.count.mockResolvedValue(1);
  mocks.tx.user.findUniqueOrThrow.mockResolvedValue({ id: "user-123", totalXp: 0, level: 1, groupId: 3 });
  mocks.tx.user.update.mockResolvedValue({ totalXp: 10, level: 1, lastActiveDate: new Date() });
  mocks.achievements.mockResolvedValue([]);
});

describe("completeLesson with practice", () => {
  it("uses existing rewards only after exact coverage and matching revision", async () => {
    expect(await completeLesson(7, lessonRevision(content))).toMatchObject({ gainedCoins: 20, gainedXp: 10, firstCompletion: true });
    expect(mocks.balanceLock).toHaveBeenCalled();
    expect(mocks.tx.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ currency: { increment: 20 } }) }));
  });

  it("does not award coins for skipped items even when count looks complete", async () => {
    mocks.tx.userLessonProgress.findUnique.mockResolvedValue({ isCompleted: false, answeredCore: [1], answeredCount: 2 });
    await expect(completeLesson(7, lessonRevision(content))).rejects.toThrow("LESSON_INCOMPLETE");
    expect(mocks.tx.user.update).not.toHaveBeenCalled();
    expect(mocks.tx.userLessonProgress.upsert).not.toHaveBeenCalled();
  });

  it.each([undefined, "0".repeat(64)])("rejects missing or stale revision without payment", async (revision) => {
    await expect(completeLesson(7, revision)).rejects.toThrow("CONTENT_CHANGED");
    expect(mocks.tx.user.update).not.toHaveBeenCalled();
  });

  it.each([
    "{bad",
    '{"format":"practice-v2","questions":[]}',
    '{"format":"practice-v1","questions":[]}',
  ])("rejects damaged and unknown content rather than awarding for an empty lesson", async (bad) => {
    mocks.tx.lesson.findUnique.mockResolvedValue({ ...lesson, content: bad });
    await expect(completeLesson(7, lessonRevision(bad))).rejects.toThrow("INVALID_LESSON_CONTENT");
    expect(mocks.tx.user.update).not.toHaveBeenCalled();
  });

  it("awards zero on repeated completion", async () => {
    mocks.tx.userLessonProgress.findUnique.mockResolvedValue({ isCompleted: true, answeredCore: [0, 1], answeredCount: 2 });
    expect(await completeLesson(7, lessonRevision(content))).toMatchObject({ gainedCoins: 0, gainedXp: 0, firstCompletion: false });
    expect(mocks.tx.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ currency: { increment: 0 } }) }));
  });
});

describe("classic compatibility", () => {
  it("old choice, text and client-reported code APIs cannot solve practice", async () => {
    expect(await checkAnswer(7, 0, 0)).toBe(false);
    expect(await checkTextAnswer(7, 0, "4")).toBe(false);
    expect(await checkClassicLessonAttempt("user-123", 7, 0, "core", () => true)).toBe(false);
    expect(mocks.tx.userLessonProgress.upsert).not.toHaveBeenCalled();
    expect(mocks.telemetry).not.toHaveBeenCalled();
  });

  it("retains classic grading, string normalization and legacy count completion", async () => {
    const classic = JSON.stringify({ theory: "", questions: [{ type: "text", prompt: "Ответ?", correctAnswer: "Привет" }], bonusQuestions: [] });
    mocks.tx.lesson.findUnique.mockResolvedValue({ ...lesson, content: classic });
    mocks.tx.userLessonProgress.findUnique.mockResolvedValue({ isCompleted: false, answeredCore: [], answeredCount: 1 });
    expect(await checkTextAnswer(7, 0, "  привет  ")).toBe(true);
    expect(await completeLesson(7)).toMatchObject({ firstCompletion: true });
  });
});
