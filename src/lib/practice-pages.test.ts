import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { StoredPracticeContent } from "./practice-content";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), allowed: vi.fn(), admin: vi.fn(), find: vi.fn(), progress: vi.fn(),
  Classic: vi.fn(() => null), Practice: vi.fn(() => null),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/course-access", () => ({ canAccessLesson: mocks.allowed }));
vi.mock("@/lib/server-guard", () => ({ requireAdminOr404: mocks.admin }));
vi.mock("@/lib/db", () => ({ prisma: { lesson: { findUnique: mocks.find }, userLessonProgress: { upsert: mocks.progress } } }));
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NOT_FOUND"); },
  redirect: () => { throw new Error("REDIRECT"); },
}));
vi.mock("@/app/lesson/[id]/QuestRunner", () => ({ QuestRunner: mocks.Classic }));
vi.mock("@/components/practice/LessonPractice", () => ({ LessonPractice: mocks.Practice }));

import LessonPage from "@/app/lesson/[id]/page";
import PreviewPage from "@/app/lesson/[id]/preview/page";

const practice: StoredPracticeContent = {
  format: "practice-v1", theory: "# Введение\n\nПубличное объяснение.",
  questions: ["a", "b"].map((id) => ({ id, variants: [0, 1].map((n) => ({
    id: `${id}${n}`, type: "text", prompt: `Вопрос ${id}${n}`,
    correctAnswer: "SECRET_ANSWER", explanation: "SECRET_EXPLANATION",
  })) })), bonusQuestions: [],
};

const request = { params: Promise.resolve({ id: "42" }) };
type Props = Record<string, unknown>;

describe("practice route integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "student-local-id" } });
    mocks.allowed.mockResolvedValue(true);
    mocks.admin.mockResolvedValue("mentor");
    mocks.find.mockResolvedValue({ id: 42, title: "Практика", content: JSON.stringify(practice), isPublished: true });
    mocks.progress.mockResolvedValue({ isCompleted: false, answeredCore: [1], answeredCount: 2, wrongAttempts: 0, theoryStep: 1 });
  });

  it("selects the practice runner and restores only exact solved indices", async () => {
    const page = await LessonPage(request) as ReactElement<Props>;
    expect(page.type).toBe(mocks.Practice);
    expect(page.props.initialSolvedIds).toEqual(["b"]);
    expect(page.props.revision).toMatch(/^[a-f0-9]{64}$/);
    expect(page.props.sessionKey).toBe("student-local-id:42");
    expect(JSON.stringify(page.props)).not.toContain("SECRET_");
  });

  it("starts completed lessons as unpaid fresh practice without old answers", async () => {
    mocks.progress.mockResolvedValue({ isCompleted: true, answeredCore: [0, 1], answeredCount: 2, theoryStep: 10 });
    const page = await LessonPage(request) as ReactElement<Props>;
    expect(page.props.initialSolvedIds).toEqual([]);
    expect(page.props.initialTheoryStep).toBe(0);
  });

  it("keeps legacy rendering and strips old choice answers", async () => {
    mocks.find.mockResolvedValue({ id: 42, title: "Обычный урок", content: JSON.stringify({ theory: "", questions: [{ prompt: "Вопрос", options: ["А", "Б"], correctIndex: 1 }] }) });
    const page = await LessonPage(request) as ReactElement<Props>;
    expect(page.type).toBe(mocks.Classic);
    expect(JSON.stringify(page.props)).not.toContain("correctIndex");
  });

  it.each(["{broken", JSON.stringify({ format: "practice-v99", questions: [] }), JSON.stringify({ format: "practice-v1", questions: [] })])("rejects damaged/unknown content before writing progress", async (content) => {
    mocks.find.mockResolvedValue({ id: 42, title: "Урок", content });
    await expect(LessonPage(request)).rejects.toThrow("NOT_FOUND");
    expect(mocks.progress).not.toHaveBeenCalled();
  });

  it("does not create progress when lesson access is denied", async () => {
    mocks.allowed.mockResolvedValue(false);
    await expect(LessonPage(request)).rejects.toThrow("NOT_FOUND");
    expect(mocks.progress).not.toHaveBeenCalled();
  });

  it("requires the mentor guard in preview and never initializes student progress", async () => {
    await PreviewPage(request);
    expect(mocks.admin).toHaveBeenCalledOnce();
    expect(mocks.progress).not.toHaveBeenCalled();
  });
});
