import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it, vi } from "vitest";

import { INTEGRATION_ADMIN_ID } from "@/test/integration-global-setup";

vi.mock("@/auth", () => ({
  auth: async () => ({
    user: { id: INTEGRATION_ADMIN_ID, name: "Integration Admin" },
  }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));

import { deleteReviewAssignment } from "@/lib/actions/review-assignments";
import { prisma } from "@/lib/db";

const TEST_PREFIX = "Удаление работы integration";

describe("deleteReviewAssignment + PostgreSQL", () => {
  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { mentorLabel: { startsWith: TEST_PREFIX } },
    });
    await prisma.$disconnect();
  });

  it("deletes a published assignment together with student answers", async () => {
    const student = await prisma.user.create({
      data: {
        id: randomUUID(),
        name: `${TEST_PREFIX} ученик`,
        mentorLabel: `${TEST_PREFIX} ученик`,
        pinHash: "not-used",
        isAdmin: false,
      },
    });
    const assignment = await prisma.reviewAssignment.create({
      data: {
        title: `${TEST_PREFIX} ${randomUUID()}`,
        instructions: "Тест",
        responseType: "TEXT",
        status: "PUBLISHED",
        publishedAt: new Date(),
        userTargets: { create: { userId: student.id } },
      },
    });
    const submission = await prisma.reviewSubmission.create({
      data: {
        assignmentId: assignment.id,
        userId: student.id,
        versions: { create: { version: 1, content: "ответ" } },
      },
    });

    const formData = new FormData();
    formData.set("id", String(assignment.id));
    await expect(deleteReviewAssignment(formData)).rejects.toThrow(
      "NEXT_REDIRECT:/admin/review-assignments",
    );

    await expect(
      prisma.reviewAssignment.findUnique({ where: { id: assignment.id } }),
    ).resolves.toBeNull();
    await expect(
      prisma.reviewSubmission.count({ where: { id: submission.id } }),
    ).resolves.toBe(0);
    await expect(
      prisma.reviewSubmissionVersion.count({
        where: { submissionId: submission.id },
      }),
    ).resolves.toBe(0);
    await expect(
      prisma.user.findUnique({ where: { id: student.id } }),
    ).resolves.not.toBeNull();
    await expect(
      prisma.adminAuditLog.findFirst({
        where: { entityType: "review_assignment", entityId: String(assignment.id), action: "deleted" },
        select: { entityLabel: true },
      }),
    ).resolves.toEqual({ entityLabel: `${assignment.title} (ответов: 1)` });
  });
});
