import { randomUUID } from "node:crypto";

import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

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

import { deleteGroup } from "@/lib/actions/groups";
import { deleteStudent } from "@/lib/actions/student-profile";
import { prisma } from "@/lib/db";

const TEST_PREFIX = "Удаление integration";

function formWith(name: string, value: string): FormData {
  const formData = new FormData();
  formData.set(name, value);
  return formData;
}

async function createStudentFixture(
  groupId: number,
  suffix: string,
  id: string = randomUUID(),
) {
  const student = await prisma.user.create({
    data: {
      id,
      name: `${TEST_PREFIX} ${suffix}`,
      mentorLabel: `${TEST_PREFIX} ${suffix}`,
      pinHash: "not-used",
      groupId,
      isAdmin: false,
    },
  });
  await prisma.loginAttempt.create({
    data: { userId: id, succeeded: false },
  });
  return student;
}

describe("student and group deletion Server Actions + PostgreSQL", () => {
  afterEach(async () => {
    const students = await prisma.user.findMany({
      where: { mentorLabel: { startsWith: TEST_PREFIX } },
      select: { id: true },
    });
    const ids = students.map(({ id }) => id);
    if (ids.length > 0) {
      await prisma.loginAttempt.deleteMany({ where: { userId: { in: ids } } });
      await prisma.userResource.deleteMany({ where: { userId: { in: ids } } });
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
    }
    await prisma.resource.deleteMany({
      where: { title: { startsWith: TEST_PREFIX } },
    });
    await prisma.group.deleteMany({
      where: { name: { startsWith: TEST_PREFIX } },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("deletes one student and all records that identify that student", async () => {
    const group = await prisma.group.create({
      data: { name: `${TEST_PREFIX} student ${randomUUID()}`, track: "intro" },
    });
    const student = await createStudentFixture(group.id, "один");
    const resource = await prisma.resource.create({
      data: { type: "note", title: `${TEST_PREFIX} ресурс`, body: "Тест" },
    });
    await prisma.userResource.create({
      data: { userId: student.id, resourceId: resource.id },
    });

    await deleteStudent(formWith("userId", student.id));

    await expect(
      prisma.user.findUnique({ where: { id: student.id } }),
    ).resolves.toBeNull();
    await expect(
      prisma.loginAttempt.count({ where: { userId: student.id } }),
    ).resolves.toBe(0);
    await expect(
      prisma.userResource.count({ where: { userId: student.id } }),
    ).resolves.toBe(0);
    await expect(
      prisma.group.findUnique({ where: { id: group.id } }),
    ).resolves.not.toBeNull();
  });

  it("deletes a student with a legacy non-UUID id from the migrated database", async () => {
    const group = await prisma.group.create({
      data: { name: `${TEST_PREFIX} legacy ${randomUUID()}`, track: "intro" },
    });
    const student = await createStudentFixture(group.id, "наследный", "user-123");

    await deleteStudent(formWith("userId", student.id));

    await expect(
      prisma.user.findUnique({ where: { id: "user-123" } }),
    ).resolves.toBeNull();
  });

  it("deletes a student who has progress, rewards, classroom and review data", async () => {
    const group = await prisma.group.create({
      data: { name: `${TEST_PREFIX} full ${randomUUID()}`, track: "intro" },
    });
    const student = await createStudentFixture(group.id, "полный");
    const category = await prisma.category.create({
      data: { name: `${TEST_PREFIX} курс` },
    });
    const lesson = await prisma.lesson.create({
      data: { categoryId: category.id, title: `${TEST_PREFIX} урок`, content: "{}" },
    });
    const achievement = await prisma.achievement.create({
      data: { title: `${TEST_PREFIX} ачивка`, description: "Тест", targetValue: 1 },
    });
    const session = await prisma.classSession.create({
      data: { groupId: group.id, lessonId: lesson.id },
    });
    const assignment = await prisma.reviewAssignment.create({
      data: { title: `${TEST_PREFIX} работа`, instructions: "Тест", responseType: "TEXT" },
    });

    await prisma.user.update({
      where: { id: student.id },
      data: { showcaseAchievementId: achievement.id, currency: 40, pixelsRedeemed: 1 },
    });
    await prisma.userLessonProgress.create({
      data: { userId: student.id, lessonId: lesson.id, isCompleted: true },
    });
    await prisma.userAchievement.create({
      data: { userId: student.id, achievementId: achievement.id, isUnlocked: true },
    });
    await prisma.pixelRedemption.create({
      data: { userId: student.id, actorId: INTEGRATION_ADMIN_ID, pixels: 1, coins: 20 },
    });
    await prisma.sessionStudentProgress.create({
      data: { sessionId: session.id, userId: student.id },
    });
    await prisma.sessionQuestionProgress.create({
      data: { sessionId: session.id, userId: student.id, section: "core", questionIndex: 0 },
    });
    await prisma.reviewAssignmentUser.create({
      data: { assignmentId: assignment.id, userId: student.id },
    });
    await prisma.reviewSubmission.create({
      data: {
        assignmentId: assignment.id,
        userId: student.id,
        versions: { create: { version: 1, content: "ответ" } },
      },
    });

    try {
      await deleteStudent(formWith("userId", student.id));
      await expect(
        prisma.user.findUnique({ where: { id: student.id } }),
      ).resolves.toBeNull();
    } finally {
      await prisma.reviewAssignment.delete({ where: { id: assignment.id } });
      await prisma.classSession.deleteMany({ where: { id: session.id } });
      await prisma.userLessonProgress.deleteMany({ where: { lessonId: lesson.id } });
      await prisma.userAchievement.deleteMany({ where: { achievementId: achievement.id } });
      await prisma.user.updateMany({
        where: { showcaseAchievementId: achievement.id },
        data: { showcaseAchievementId: null },
      });
      await prisma.pixelRedemption.deleteMany({ where: { userId: student.id } });
      await prisma.achievement.delete({ where: { id: achievement.id } });
      await prisma.lesson.delete({ where: { id: lesson.id } });
      await prisma.category.delete({ where: { id: category.id } });
    }
  });

  it("deletes a group, every student in it, and their identifying records", async () => {
    const group = await prisma.group.create({
      data: { name: `${TEST_PREFIX} group ${randomUUID()}`, track: "intro" },
    });
    const first = await createStudentFixture(group.id, "первый");
    const second = await createStudentFixture(group.id, "второй");

    await deleteGroup(formWith("id", String(group.id)));

    await expect(
      prisma.group.findUnique({ where: { id: group.id } }),
    ).resolves.toBeNull();
    await expect(
      prisma.user.count({ where: { id: { in: [first.id, second.id] } } }),
    ).resolves.toBe(0);
    await expect(
      prisma.loginAttempt.count({
        where: { userId: { in: [first.id, second.id] } },
      }),
    ).resolves.toBe(0);
  });
});
