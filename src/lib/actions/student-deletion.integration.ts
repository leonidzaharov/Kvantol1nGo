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

async function createStudentFixture(groupId: number, suffix: string) {
  const id = randomUUID();
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
