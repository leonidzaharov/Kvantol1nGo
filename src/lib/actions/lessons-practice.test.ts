import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    $executeRaw: vi.fn(),
    lesson: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
    userLessonProgress: { findFirst: vi.fn() },
  };
  return { tx, transaction: vi.fn(async (run: (transaction: typeof tx) => unknown) => run(tx)), requireAdmin: vi.fn(), audit: vi.fn() };
});
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(() => { throw new Error("REDIRECT"); }) }));
vi.mock("@/lib/db", () => ({ prisma: { ...mocks.tx, $transaction: mocks.transaction } }));
vi.mock("@/lib/admin-audit", () => ({ recordAdminAudit: mocks.audit }));
vi.mock("@/lib/server-guard", async () => {
  const { z } = await import("zod");
  return {
    IdSchema: z.number().int().positive().max(1_000_000),
    parse: (schema: import("zod").ZodType, input: unknown) => schema.parse(input),
    requireAdmin: mocks.requireAdmin,
  };
});

import { saveLesson } from "./lessons";
import { PracticeContentSchema } from "../practice-content";

const makePractice = (prompt = "2 + 2?") => PracticeContentSchema.parse({
  format: "practice-v1", theory: "# Начало\nКороткое объяснение", questions: [{
    id: "one", variants: ["a", "b"].map((id) => ({ id, type: "text", prompt, correctAnswer: "4", explanation: "Две пары" })),
  }], bonusQuestions: [],
});
const classic = { theory: "# Начало\nКороткое объяснение", questions: [{ type: "text", prompt: "Ответ?", correctAnswer: "4" }], bonusQuestions: [] };
function form(content: unknown, id = "7") {
  const data = new FormData();
  Object.entries({ id, title: "Урок", categoryId: "1", xpReward: "10", coinReward: "20", sortOrder: "0", contentJson: JSON.stringify(content) })
    .forEach(([name, value]) => data.set(name, value));
  return data;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAdmin.mockResolvedValue("mentor");
  mocks.tx.lesson.findFirst.mockResolvedValue(null);
  mocks.tx.lesson.findUnique.mockResolvedValue({ content: JSON.stringify(makePractice()), isPublished: false });
  mocks.tx.userLessonProgress.findFirst.mockResolvedValue(null);
  mocks.tx.lesson.update.mockResolvedValue({ id: 7, title: "Урок" });
  mocks.tx.lesson.create.mockResolvedValue({ id: 8, title: "Урок" });
});

describe("save practice content", () => {
  it("rejects unknown and damaged formats before database writes", async () => {
    expect(await saveLesson(null, form({ format: "practice-v2", questions: [] }))).toMatchObject({ error: expect.any(String) });
    expect(await saveLesson(null, form({ format: "practice-v1", questions: [] }))).toMatchObject({ error: expect.any(String) });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("preserves variants and explanations for a new practice", async () => {
    await expect(saveLesson(null, form(makePractice(), ""))).rejects.toThrow("REDIRECT");
    expect(mocks.tx.lesson.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ content: JSON.stringify(makePractice()) }),
    }));
  });

  it("blocks edits to published practice, including meaning and order", async () => {
    mocks.tx.lesson.findUnique.mockResolvedValue({ content: JSON.stringify(makePractice()), isPublished: true });
    expect(await saveLesson(null, form(makePractice("3 + 1?")))).toMatchObject({ error: expect.any(String) });
    expect(mocks.tx.lesson.update).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("still blocks edits after unpublishing if anyone has progress", async () => {
    mocks.tx.userLessonProgress.findFirst.mockResolvedValue({ userId: "user-123" });
    expect(await saveLesson(null, form(makePractice("3 + 1?")))).toMatchObject({ error: expect.any(String) });
    expect(mocks.tx.lesson.update).not.toHaveBeenCalled();
  });

  it("allows metadata updates with identical published practice content", async () => {
    mocks.tx.lesson.findUnique.mockResolvedValue({ content: JSON.stringify(makePractice()), isPublished: true });
    mocks.tx.userLessonProgress.findFirst.mockResolvedValue({ userId: "user-123" });
    const data = form(makePractice());
    data.set("title", "Новое название");
    await expect(saveLesson(null, data)).rejects.toThrow("REDIRECT");
    expect(mocks.tx.lesson.update).toHaveBeenCalled();
  });

  it("blocks converting a classic lesson with progress", async () => {
    mocks.tx.lesson.findUnique.mockResolvedValue({ content: JSON.stringify(classic), isPublished: false });
    mocks.tx.userLessonProgress.findFirst.mockResolvedValue({ userId: "user-123" });
    expect(await saveLesson(null, form(makePractice()))).toMatchObject({ error: expect.any(String) });
    expect(mocks.tx.lesson.update).not.toHaveBeenCalled();
  });

  it("allows conversion of an unpublished classic without progress", async () => {
    mocks.tx.lesson.findUnique.mockResolvedValue({ content: JSON.stringify(classic), isPublished: false });
    await expect(saveLesson(null, form(makePractice()))).rejects.toThrow("REDIRECT");
    expect(mocks.tx.lesson.update).toHaveBeenCalled();
  });

  it("does not bypass content protection by replacing a damaged format with classic", async () => {
    mocks.tx.lesson.findUnique.mockResolvedValue({ content: '{"format":"practice-v1","questions":[]}', isPublished: false });
    mocks.tx.userLessonProgress.findFirst.mockResolvedValue({ userId: "user-123" });
    expect(await saveLesson(null, form(classic))).toMatchObject({ error: expect.any(String) });
    expect(mocks.tx.lesson.update).not.toHaveBeenCalled();
  });

  it("keeps editing classic lessons compatible", async () => {
    mocks.tx.lesson.findUnique.mockResolvedValue({ content: JSON.stringify(classic), isPublished: true });
    mocks.tx.userLessonProgress.findFirst.mockResolvedValue({ userId: "user-123" });
    await expect(saveLesson(null, form({ ...classic, theory: "Исправление" }))).rejects.toThrow("REDIRECT");
    expect(mocks.tx.lesson.update).toHaveBeenCalled();
  });
});
