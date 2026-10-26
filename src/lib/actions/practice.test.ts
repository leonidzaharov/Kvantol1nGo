import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    $executeRaw: vi.fn(),
    lesson: { findUnique: vi.fn() },
    userLessonProgress: { findUnique: vi.fn(), upsert: vi.fn() },
  };
  return {
    tx,
    transaction: vi.fn(async (run: (transaction: typeof tx) => unknown) => run(tx)),
    requireUser: vi.fn(), requireAdmin: vi.fn(), canAccess: vi.fn(), telemetry: vi.fn(),
  };
});
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ prisma: { ...mocks.tx, $transaction: mocks.transaction } }));
vi.mock("@/lib/server-guard", () => ({ requireUser: mocks.requireUser, requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/course-access", () => ({ canAccessLesson: mocks.canAccess }));
vi.mock("@/lib/classroom-progress", () => ({ recordClassroomAttempt: mocks.telemetry }));

import { checkPracticeAnswer, previewPracticeAnswer } from "./practice";
import { lessonRevision } from "../lesson-revision";
import { PracticeContentSchema } from "../practice-content";
import { assertCoreSolved, solvedPracticeIndices } from "../lesson-progress";

const item = (id: string) => ({
  id,
  variants: ["first", "second"].map((variantId) => ({
    id: variantId, type: "choice", prompt: "2 + 2?", options: ["4", "5"],
    correctIndex: 0, explanation: "Сложи две пары",
  })),
});
const content = JSON.stringify(PracticeContentSchema.parse({
  format: "practice-v1", theory: "", questions: [item("one"), item("two")], bonusQuestions: [item("bonus")],
}));
const attempt = {
  lessonId: 7, revision: lessonRevision(content), section: "core", itemId: "one", variantId: "first",
  answer: { type: "choice", optionIndex: 0 },
};
const codeContent = JSON.stringify(PracticeContentSchema.parse({
  format: "practice-v1", theory: "", questions: [{ id: "one", variants: ["first", "second"].map((id) => ({
    id, type: "code", prompt: "Напечатай каждое имя", language: "python", starterCode: 'print(students)',
    expectedOutput: "Мира\nТео", referenceSolution: 'for student in ["Мира", "Тео"]:\n    print(student)',
    explanation: "student хранит одно имя, students хранит список.",
  })) }, item("two")], bonusQuestions: [],
}));
const codeAttempt = { ...attempt, revision: lessonRevision(codeContent), answer: { type: "code", executionOk: true, output: "Мира\nТео" } };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue("user-123");
  mocks.requireAdmin.mockResolvedValue("mentor");
  mocks.canAccess.mockResolvedValue(true);
  mocks.tx.lesson.findUnique.mockResolvedValue({ content });
  mocks.tx.userLessonProgress.findUnique.mockResolvedValue(null);
});

describe("practice actions", () => {
  it("persists a successful browser execution only after comparing its output with the stored expectation", async () => {
    mocks.tx.lesson.findUnique.mockResolvedValue({ content: codeContent });
    expect(await checkPracticeAnswer(codeAttempt)).toMatchObject({
      kind: "checked", correct: true,
      feedback: { codeLanguage: "python", expectedOutput: "Мира\nТео", explanation: "student хранит одно имя, students хранит список." },
    });
    expect(mocks.tx.userLessonProgress.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ answeredCore: [0], answeredCount: 1 }),
    }));
    expect(mocks.telemetry).toHaveBeenCalledWith(expect.objectContaining({ correct: true, questionIndex: 0 }));
    expect(JSON.stringify(mocks.telemetry.mock.calls)).not.toContain("Мира");
  });

  it("reveals the code explanation on a runtime failure without solving the item", async () => {
    mocks.tx.lesson.findUnique.mockResolvedValue({ content: codeContent });
    expect(await checkPracticeAnswer({ ...codeAttempt, answer: { type: "code", executionOk: false, output: "TypeError: list instead of string" } })).toMatchObject({
      kind: "checked", correct: false,
      feedback: { answer: 'for student in ["Мира", "Тео"]:\n    print(student)', codeLanguage: "python" },
    });
    expect(mocks.tx.userLessonProgress.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ answeredCore: [], answeredCount: 0, wrongAttempts: 1 }),
    }));
  });

  it("does not accept a client passed flag instead of a code execution result", async () => {
    mocks.tx.lesson.findUnique.mockResolvedValue({ content: codeContent });
    expect(await checkPracticeAnswer({ ...codeAttempt, answer: { type: "code", passed: true } })).toEqual({ kind: "invalid" });
    expect(mocks.tx.userLessonProgress.upsert).not.toHaveBeenCalled();
  });

  it("previews code feedback through the mentor guard without progress writes", async () => {
    mocks.tx.lesson.findUnique.mockResolvedValue({ content: codeContent });
    expect(await previewPracticeAnswer(codeAttempt)).toMatchObject({ kind: "checked", correct: true, feedback: { codeLanguage: "python" } });
    expect(mocks.requireAdmin).toHaveBeenCalledOnce();
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.tx.userLessonProgress.upsert).not.toHaveBeenCalled();
    expect(mocks.telemetry).not.toHaveBeenCalled();
  });

  it("grades on the server and persists the canonical index for a non-UUID user", async () => {
    const result = await checkPracticeAnswer({ ...attempt, itemId: "two" });
    expect(result).toMatchObject({ kind: "checked", correct: true, feedback: { answer: "4" } });
    expect(mocks.tx.userLessonProgress.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ userId: "user-123", answeredCore: [1], answeredCount: 1 }),
    }));
    expect(mocks.telemetry).toHaveBeenCalledWith(expect.objectContaining({ questionIndex: 1, section: "core" }));
  });

  it("wrong answers reveal feedback without marking the item solved", async () => {
    expect(await checkPracticeAnswer({ ...attempt, answer: { type: "choice", optionIndex: 1 } }))
      .toMatchObject({ kind: "checked", correct: false, feedback: { explanation: "Сложи две пары" } });
    expect(mocks.tx.userLessonProgress.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ answeredCore: [], answeredCount: 0, wrongAttempts: 1 }),
    }));
  });

  it("never expands an old count into a solved prefix", async () => {
    mocks.tx.userLessonProgress.findUnique.mockResolvedValue({ isCompleted: false, answeredCount: 2, answeredCore: [1] });
    await checkPracticeAnswer({ ...attempt, answer: { type: "choice", optionIndex: 1 } });
    expect(mocks.tx.userLessonProgress.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({ answeredCore: [1], answeredCount: 1 }),
    }));
  });

  it("does not rewrite progress for a completed replay or solved item", async () => {
    mocks.tx.userLessonProgress.findUnique.mockResolvedValue({ isCompleted: true, answeredCore: [0, 1] });
    await checkPracticeAnswer(attempt);
    expect(mocks.tx.userLessonProgress.upsert).not.toHaveBeenCalled();
    mocks.tx.userLessonProgress.findUnique.mockResolvedValue({ isCompleted: false, answeredCore: [0] });
    await checkPracticeAnswer(attempt);
    expect(mocks.tx.userLessonProgress.upsert).not.toHaveBeenCalled();
  });

  it("rejects stale content before progress writes or feedback", async () => {
    expect(await checkPracticeAnswer({ ...attempt, revision: "0".repeat(64) })).toEqual({ kind: "content-changed" });
    expect(mocks.tx.userLessonProgress.upsert).not.toHaveBeenCalled();
    expect(mocks.telemetry).not.toHaveBeenCalled();
  });

  it.each([
    { ...attempt, itemId: "missing" },
    { ...attempt, variantId: "missing" },
    { ...attempt, answer: { type: "choice", optionIndex: 7 } },
    { ...attempt, answer: true },
    { ...attempt, questionIndex: 1 },
  ])("rejects malformed or unknown attempts without feedback", async (input) => {
    expect(await checkPracticeAnswer(input)).toEqual({ kind: "invalid" });
    expect(mocks.tx.userLessonProgress.upsert).not.toHaveBeenCalled();
    expect(mocks.telemetry).not.toHaveBeenCalled();
  });

  it("requires access and propagates authentication failures", async () => {
    mocks.canAccess.mockResolvedValue(false);
    await expect(checkPracticeAnswer(attempt)).rejects.toThrow("FORBIDDEN");
    expect(mocks.transaction).not.toHaveBeenCalled();
    mocks.requireUser.mockRejectedValue(new Error("UNAUTHORIZED"));
    await expect(checkPracticeAnswer(attempt)).rejects.toThrow("UNAUTHORIZED");
  });

  it("keeps a saved answer successful when optional telemetry fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.telemetry.mockRejectedValueOnce(new Error("session unavailable"));
    expect(await checkPracticeAnswer(attempt)).toMatchObject({ kind: "checked", correct: true });
    expect(mocks.tx.userLessonProgress.upsert).toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith("Practice classroom telemetry unavailable");
    warn.mockRestore();
  });

  it("rejects bonus before core completion and keeps bonus separate", async () => {
    const bonus = { ...attempt, section: "bonus", itemId: "bonus" };
    expect(await checkPracticeAnswer(bonus)).toEqual({ kind: "invalid" });
    expect(mocks.telemetry).not.toHaveBeenCalled();
    mocks.tx.userLessonProgress.findUnique.mockResolvedValue({ answeredCore: [0, 1], answeredCount: 2 });
    expect(await checkPracticeAnswer(bonus)).toMatchObject({ kind: "checked", correct: true });
    expect(mocks.tx.userLessonProgress.upsert).not.toHaveBeenCalled();
    expect(mocks.telemetry).toHaveBeenCalledWith(expect.objectContaining({ section: "bonus", questionIndex: 0 }));
  });

  it("mentor preview requires admin rights and never persists anything", async () => {
    expect(await previewPracticeAnswer(attempt)).toMatchObject({ kind: "checked", correct: true });
    expect(mocks.requireAdmin).toHaveBeenCalled();
    expect(mocks.requireUser).not.toHaveBeenCalled();
    expect(mocks.tx.userLessonProgress.upsert).not.toHaveBeenCalled();
    expect(mocks.telemetry).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
    mocks.requireAdmin.mockRejectedValue(new Error("FORBIDDEN"));
    await expect(previewPracticeAnswer(attempt)).rejects.toThrow("FORBIDDEN");
  });
});

describe("exact practice coverage", () => {
  it("rejects holes even when answeredCount claims full completion", () => {
    expect(() => assertCoreSolved({ answeredCore: [1], answeredCount: 2 }, 2, true)).toThrow("LESSON_INCOMPLETE");
    expect(() => assertCoreSolved({ answeredCore: [0, 1], answeredCount: 0 }, 2, true)).not.toThrow();
    expect(() => assertCoreSolved(null, 0, true)).toThrow("LESSON_INCOMPLETE");
  });
  it("retains legacy completion and sanitizes exact indices", () => {
    expect(() => assertCoreSolved({ answeredCore: [], answeredCount: 2 }, 2)).not.toThrow();
    expect(() => assertCoreSolved(null, 0)).not.toThrow();
    expect(solvedPracticeIndices([1, 1, -1, 0.5, 4, 0], 2)).toEqual([0, 1]);
  });
});
