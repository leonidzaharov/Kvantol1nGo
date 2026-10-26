import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma";

const mocks = vi.hoisted(() => {
  const tx = {
    $executeRaw: vi.fn(),
    resource: { findUnique: vi.fn() },
    userResource: { create: vi.fn() },
    user: { update: vi.fn() },
  };
  return { tx, transaction: vi.fn(async (run: (transaction: typeof tx) => unknown) => run(tx)), user: vi.fn(), access: vi.fn() };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock("@/lib/resource-access", () => ({ canAccessResource: mocks.access }));
vi.mock("@/lib/server-guard", async () => {
  const { z } = await import("zod");
  return { requireUser: mocks.user, IdSchema: z.number().int().positive(), parse: (schema: import("zod").ZodType, value: unknown) => schema.parse(value) };
});

import { studyResource } from "./study";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.mockResolvedValue("student-local");
  mocks.access.mockResolvedValue(true);
  mocks.tx.resource.findUnique.mockResolvedValue({ type: "note", url: null, coinReward: 2 });
});

describe("resource rewards and linked practice", () => {
  it("rejects direct study requests for a linked lesson before any reward write", async () => {
    mocks.tx.resource.findUnique.mockResolvedValue({ type: "article", url: "/lesson/42", coinReward: 20 });
    await expect(studyResource(3)).rejects.toThrow("PRACTICE_REQUIRES_COMPLETION");
    expect(mocks.tx.$executeRaw).toHaveBeenCalledOnce();
    expect(mocks.tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(mocks.tx.resource.findUnique.mock.invocationCallOrder[0]);
    expect(mocks.tx.userResource.create).not.toHaveBeenCalled();
    expect(mocks.tx.user.update).not.toHaveBeenCalled();
  });

  it("keeps ordinary resources payable after acquiring the resource row lock", async () => {
    await expect(studyResource(3)).resolves.toEqual({ gainedCoins: 2 });
    expect(mocks.tx.userResource.create).toHaveBeenCalledWith({ data: { userId: "student-local", resourceId: 3 } });
    expect(mocks.tx.user.update).toHaveBeenCalledWith({ where: { id: "student-local" }, data: { currency: { increment: 2 } } });
  });

  it("does not mistake an external article for a linked practice", async () => {
    mocks.tx.resource.findUnique.mockResolvedValue({ type: "article", url: "https://example.org/lesson/42", coinReward: 3 });
    await expect(studyResource(3)).resolves.toEqual({ gainedCoins: 3 });
  });

  it("does not award after deletion, authentication failure or denied access", async () => {
    mocks.tx.resource.findUnique.mockResolvedValue(null);
    await expect(studyResource(3)).rejects.toThrow("BAD_REQUEST");
    mocks.access.mockResolvedValue(false);
    await expect(studyResource(3)).rejects.toThrow("FORBIDDEN");
    mocks.user.mockRejectedValue(new Error("UNAUTHORIZED"));
    await expect(studyResource(3)).rejects.toThrow("UNAUTHORIZED");
    expect(mocks.tx.user.update).not.toHaveBeenCalled();
  });

  it("returns zero for a repeated ordinary study and leaves the balance unchanged", async () => {
    mocks.tx.userResource.create.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError("duplicate", { code: "P2002", clientVersion: "7.8.0" }));
    await expect(studyResource(3)).resolves.toEqual({ gainedCoins: 0 });
    expect(mocks.tx.user.update).not.toHaveBeenCalled();
  });
});
