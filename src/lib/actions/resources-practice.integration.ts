import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { INTEGRATION_ADMIN_ID, INTEGRATION_GROUP, INTEGRATION_STUDENT_ID } from "@/test/integration-global-setup";

const session = vi.hoisted(() => ({ userId: "" }));
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId } }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
  redirect: (url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); },
}));

import { prisma } from "@/lib/db";
import { lessonRevision } from "@/lib/lesson-revision";
import { completeLesson } from "./gamification";
import { saveResource, toggleResourcePublication } from "./resources";
import { studyResource } from "./study";

const content = JSON.stringify({
  format: "practice-v1", theory: "", questions: [{ id: "one", variants: [
    { id: "a", type: "text", prompt: "2 + 2?", correctAnswer: "4", explanation: "Две пары." },
    { id: "b", type: "text", prompt: "3 + 1?", correctAnswer: "4", explanation: "Три и один." },
  ] }], bonusQuestions: [],
});
let groupId: number;
const categoryIds: number[] = [];

async function lessonFixture(published = false, body = content) {
  const category = await prisma.category.create({ data: {
    name: "Practice resource integration", icon: "test", track: "intro", isPublished: true,
    groupAccess: { create: { groupId } },
  } });
  categoryIds.push(category.id);
  return prisma.lesson.create({ data: {
    title: "Linked practice integration", categoryId: category.id, content: body,
    isPublished: published, xpReward: 10, coinReward: 20,
  } });
}

function form(url: string, extra: Record<string, string> = {}) {
  const data = new FormData();
  Object.entries({ id: "", type: "practice", title: "Practice resource integration", description: "", url,
    body: "", coinReward: "99", sortOrder: "0", ...extra }).forEach(([key, value]) => data.set(key, value));
  data.append("groupId", String(groupId));
  return data;
}
function publication(id: number) {
  const data = new FormData(); data.set("id", String(id)); data.set("isPublished", "true"); return data;
}
async function linkedCard(lessonId: number) {
  return prisma.resource.create({ data: {
    title: "Linked integration", type: "article", url: `/lesson/${lessonId}`, coinReward: 0, isPublished: true,
    groupAccess: { create: { groupId } },
  } });
}

beforeEach(async () => {
  session.userId = INTEGRATION_ADMIN_ID;
  await prisma.resource.deleteMany();
  groupId = (await prisma.group.findUniqueOrThrow({ where: { name: INTEGRATION_GROUP } })).id;
});
afterEach(async () => {
  await prisma.resource.deleteMany();
  await prisma.userLessonProgress.deleteMany({ where: { lesson: { categoryId: { in: categoryIds } } } });
  await prisma.lesson.deleteMany({ where: { categoryId: { in: categoryIds } } });
  await prisma.category.deleteMany({ where: { id: { in: categoryIds } } });
  categoryIds.length = 0;
});
afterAll(async () => { await prisma.$disconnect(); });

describe("linked practice resources + PostgreSQL", () => {
  it("rejects missing or classic targets before creating the card", async () => {
    expect(await saveResource(null, form("/lesson/999999"))).toMatchObject({ error: expect.stringContaining("не найден") });
    const classic = await lessonFixture(false, JSON.stringify({ theory: "Теория", questions: [], bonusQuestions: [] }));
    expect(await saveResource(null, form(`/lesson/${classic.id}`))).toMatchObject({ error: expect.stringContaining("Практика") });
    expect(await prisma.resource.count()).toBe(0);
  });

  it("stores only the link, requires publication and checks every assigned group's access", async () => {
    const lesson = await lessonFixture();
    await expect(saveResource(null, form(`/lesson/000${lesson.id}/`))).rejects.toThrow("NEXT_REDIRECT:/admin/resources");
    const card = await prisma.resource.findFirstOrThrow();
    expect(card).toMatchObject({ type: "article", url: `/lesson/${lesson.id}`, coinReward: 0, isPublished: false });
    await expect(toggleResourcePublication(publication(card.id))).rejects.toThrow("NEXT_REDIRECT:/admin/resources?error=");
    expect((await prisma.resource.findUniqueOrThrow({ where: { id: card.id } })).isPublished).toBe(false);
    await prisma.lesson.update({ where: { id: lesson.id }, data: { isPublished: true } });
    await prisma.categoryGroupAssignment.deleteMany({ where: { categoryId: lesson.categoryId } });
    await expect(toggleResourcePublication(publication(card.id))).rejects.toThrow("NEXT_REDIRECT:/admin/resources?error=");
    await prisma.categoryGroupAssignment.create({ data: { categoryId: lesson.categoryId, groupId } });
    await toggleResourcePublication(publication(card.id));
    expect((await prisma.resource.findUniqueOrThrow({ where: { id: card.id } })).isPublished).toBe(true);
  });

  it("two cards for one lesson share one completion and cannot issue Study rewards", async () => {
    const lesson = await lessonFixture(true);
    const first = await linkedCard(lesson.id), second = await linkedCard(lesson.id);
    session.userId = INTEGRATION_STUDENT_ID;
    await expect(studyResource(first.id)).rejects.toThrow("PRACTICE_REQUIRES_COMPLETION");
    await expect(studyResource(second.id)).rejects.toThrow("PRACTICE_REQUIRES_COMPLETION");
    await prisma.userLessonProgress.create({ data: {
      userId: INTEGRATION_STUDENT_ID, lessonId: lesson.id, totalQuestions: 1, answeredCore: [0], answeredCount: 1,
    } });
    expect(await completeLesson(lesson.id, lessonRevision(content))).toMatchObject({ gainedCoins: 20, firstCompletion: true });
    const balance = (await prisma.user.findUniqueOrThrow({ where: { id: INTEGRATION_STUDENT_ID } })).currency;
    expect(await completeLesson(lesson.id, lessonRevision(content))).toMatchObject({ gainedCoins: 0, firstCompletion: false });
    await expect(studyResource(second.id)).rejects.toThrow("PRACTICE_REQUIRES_COMPLETION");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: INTEGRATION_STUDENT_ID } })).currency).toBe(balance);
    expect(await prisma.userResource.count({ where: { resourceId: { in: [first.id, second.id] } } })).toBe(0);
  });

  it("classifies after a concurrent resource conversion, not before the payout transaction", async () => {
    const lesson = await lessonFixture(true);
    const card = await prisma.resource.create({ data: {
      title: "Conversion integration", type: "article", url: "https://example.org", coinReward: 2, isPublished: true,
      groupAccess: { create: { groupId } },
    } });
    let signalLocked!: () => void, releaseWriter!: () => void;
    const locked = new Promise<void>((resolve) => { signalLocked = resolve; });
    const release = new Promise<void>((resolve) => { releaseWriter = resolve; });
    const writer = prisma.$transaction(async (tx) => {
      await tx.resource.update({ where: { id: card.id }, data: { url: `/lesson/${lesson.id}`, coinReward: 99 } });
      signalLocked();
      await release;
    });
    await locked;
    session.userId = INTEGRATION_STUDENT_ID;
    const attempt = expect(studyResource(card.id)).rejects.toThrow("PRACTICE_REQUIRES_COMPLETION");
    try { await new Promise((resolve) => setTimeout(resolve, 80)); } finally { releaseWriter(); }
    await writer;
    await attempt;
    expect(await prisma.userResource.count({ where: { resourceId: card.id } })).toBe(0);
  });

  it("preserves ordinary resource rewards and deduplicates repeated study", async () => {
    const card = await prisma.resource.create({ data: {
      title: "Ordinary integration", type: "note", body: "Совет", coinReward: 2, isPublished: true,
      groupAccess: { create: { groupId } },
    } });
    session.userId = INTEGRATION_STUDENT_ID;
    const before = (await prisma.user.findUniqueOrThrow({ where: { id: INTEGRATION_STUDENT_ID } })).currency;
    expect(await studyResource(card.id)).toEqual({ gainedCoins: 2 });
    expect(await studyResource(card.id)).toEqual({ gainedCoins: 0 });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: INTEGRATION_STUDENT_ID } })).currency).toBe(before + 2);
  });
});
