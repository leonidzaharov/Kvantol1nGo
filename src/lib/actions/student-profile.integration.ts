import bcrypt from "bcryptjs";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

import {
  INTEGRATION_ADMIN_ID,
  INTEGRATION_GROUP,
} from "@/test/integration-global-setup";

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

import { createStudent } from "@/lib/actions/student-profile";
import { prisma } from "@/lib/db";

const TEST_LABEL_PREFIX = "Одинаковый PIN";

function studentForm({
  mentorLabel,
  nickname,
  groupId,
}: {
  mentorLabel: string;
  nickname: string;
  groupId: number;
}): FormData {
  const formData = new FormData();
  formData.set("mentorLabel", mentorLabel);
  formData.set("nickname", nickname);
  formData.set("pin", "1234");
  formData.set("groupId", String(groupId));
  return formData;
}

describe("student profile Server Actions + PostgreSQL", () => {
  afterEach(async () => {
    await prisma.user.deleteMany({
      where: { mentorLabel: { startsWith: TEST_LABEL_PREFIX } },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("создаёт двух учеников с одинаковым PIN", async () => {
    const group = await prisma.group.findUniqueOrThrow({
      where: { name: INTEGRATION_GROUP },
      select: { id: true },
    });

    await expect(
      createStudent(
        null,
        studentForm({
          mentorLabel: `${TEST_LABEL_PREFIX} первый`,
          nickname: "Первый тестовый",
          groupId: group.id,
        }),
      ),
    ).resolves.toMatchObject({ success: expect.any(String) });

    await expect(
      createStudent(
        null,
        studentForm({
          mentorLabel: `${TEST_LABEL_PREFIX} второй`,
          nickname: "Второй тестовый",
          groupId: group.id,
        }),
      ),
    ).resolves.toMatchObject({ success: expect.any(String) });

    const students = await prisma.user.findMany({
      where: { mentorLabel: { startsWith: TEST_LABEL_PREFIX } },
      orderBy: { mentorLabel: "asc" },
      select: { pinHash: true },
    });

    expect(students).toHaveLength(2);
    await expect(
      Promise.all(students.map((student) => bcrypt.compare("1234", student.pinHash))),
    ).resolves.toEqual([true, true]);
  });
});
