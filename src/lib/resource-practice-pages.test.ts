import type { ReactElement, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), user: vi.fn(), resources: vi.fn(), studied: vi.fn(), lessons: vi.fn(), Card: vi.fn(() => null),
}));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({ prisma: {
  user: { findUnique: mocks.user }, resource: { findMany: mocks.resources },
  userResource: { findMany: mocks.studied }, lesson: { findMany: mocks.lessons },
} }));
vi.mock("next/navigation", () => ({ redirect: () => { throw new Error("REDIRECT"); } }));
vi.mock("@/app/(main)/interesting/card", () => ({ ResourceCard: mocks.Card }));

import InterestingPage from "@/app/(main)/interesting/page";

function cards(node: ReactNode): Record<string, unknown>[] {
  if (Array.isArray(node)) return node.flatMap(cards);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const element = node as ReactElement<Record<string, unknown>>;
  return element.type === mocks.Card ? [element.props] : cards(element.props.children as ReactNode);
}
const resource = (id: number, url: string) => ({ id, type: "article", url });
const target = (id: number, published = true, track: "intro" | "advanced" = "intro") => ({
  id, isPublished: published, coinReward: 20, groupRestrictions: [], progress: [{ isCompleted: true }],
  category: { isPublished: true, track, groupAccess: [{ groupId: 1 }] },
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "student" } });
  mocks.user.mockResolvedValue({ isAdmin: false, groupId: 1, group: { track: "intro" } });
  mocks.resources.mockResolvedValue([
    resource(11, "/lesson/1"), resource(12, "/lesson/2"), resource(13, "/lesson/3"),
    resource(14, "/lesson/4"), resource(15, "https://example.org"), resource(16, "/lesson/1"),
  ]);
  mocks.studied.mockResolvedValue([]);
  mocks.lessons.mockResolvedValue([target(1), target(2, false), target(3, true, "advanced")]);
});

describe("practice resources page", () => {
  it("bulk-loads unique targets, reuses lesson access and derives completion from lesson progress", async () => {
    const result = cards(await InterestingPage());
    expect(result.map((props) => (props.resource as { id: number }).id)).toEqual([11, 15, 16]);
    expect(result[0].practice).toMatchObject({ available: true, completed: true, preview: false, coinReward: 20 });
    expect(result[2].practice).toEqual(result[0].practice);
    expect(result[0].studied).toBe(false);
    expect(mocks.lessons).toHaveBeenCalledOnce();
    expect(mocks.lessons).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: [1, 2, 3, 4] } } }));
    expect(mocks.lessons.mock.calls[0][0].select.content).toBeUndefined();
  });

  it("shows a missing-target warning to the mentor and permits draft preview", async () => {
    mocks.user.mockResolvedValue({ isAdmin: true, groupId: null, group: null });
    const result = cards(await InterestingPage());
    expect(result).toHaveLength(6);
    expect(result[1].practice).toMatchObject({ available: true, preview: true });
    expect(result[3].practice).toMatchObject({ available: false, error: expect.stringContaining("удалён") });
  });

  it("does not request lesson metadata for an ordinary resources page", async () => {
    mocks.resources.mockResolvedValue([resource(15, "https://example.org")]);
    expect(cards(await InterestingPage())).toHaveLength(1);
    expect(mocks.lessons).not.toHaveBeenCalled();
  });
});
