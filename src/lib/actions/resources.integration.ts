import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  INTEGRATION_ADMIN_ID,
  INTEGRATION_GROUP,
  INTEGRATION_STUDENT_ID,
} from "@/test/integration-global-setup";

const sessionState = vi.hoisted(() => ({ userId: "" }));

vi.mock("@/auth", () => ({
  auth: async () =>
    sessionState.userId
      ? { user: { id: sessionState.userId, name: "Integration" } }
      : null,
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));

import { prisma } from "@/lib/db";
import {
  deleteResource,
  saveResource,
  toggleResourcePublication,
} from "@/lib/actions/resources";

function resourceForm(overrides: Record<string, string> = {}): FormData {
  const values = {
    id: "",
    type: "note",
    title: "Интеграционный материал",
    description: "Проверка Server Action",
    url: "",
    body: "Текст материала",
    coinReward: "2",
    sortOrder: "10",
    ...overrides,
  };
  const formData = new FormData();
  for (const [key, value] of Object.entries(values)) {
    formData.set(key, value);
  }
  return formData;
}

describe("resource Server Actions + PostgreSQL", () => {
  let groupId: number;

  beforeEach(async () => {
    sessionState.userId = INTEGRATION_ADMIN_ID;
    await prisma.resource.deleteMany();
    const group = await prisma.group.findUniqueOrThrow({
      where: { name: INTEGRATION_GROUP },
      select: { id: true },
    });
    groupId = group.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("создаёт черновик, назначает группу, публикует, обновляет и удаляет", async () => {
    const createForm = resourceForm();
    createForm.append("groupId", String(groupId));

    await expect(saveResource(null, createForm)).rejects.toThrow(
      "NEXT_REDIRECT:/admin/resources",
    );

    const created = await prisma.resource.findFirstOrThrow({
      where: { title: "Интеграционный материал" },
      include: { groupAccess: true },
    });
    expect(created.isPublished).toBe(false);
    expect(created.groupAccess.map((row) => row.groupId)).toEqual([groupId]);

    const publishForm = new FormData();
    publishForm.set("id", String(created.id));
    publishForm.set("isPublished", "true");
    await toggleResourcePublication(publishForm);
    await expect(
      prisma.resource.findUniqueOrThrow({ where: { id: created.id } }),
    ).resolves.toMatchObject({ isPublished: true });

    const updateForm = resourceForm({
      id: String(created.id),
      title: "Интеграционный материал · обновлён",
      body: "Новый текст",
    });
    updateForm.append("groupId", String(groupId));
    await expect(saveResource(null, updateForm)).rejects.toThrow(
      "NEXT_REDIRECT:/admin/resources",
    );
    await expect(
      prisma.resource.findUniqueOrThrow({ where: { id: created.id } }),
    ).resolves.toMatchObject({
      title: "Интеграционный материал · обновлён",
      body: "Новый текст",
      isPublished: true,
    });

    const deleteForm = new FormData();
    deleteForm.set("id", String(created.id));
    await deleteResource(deleteForm);
    await expect(
      prisma.resource.findUnique({ where: { id: created.id } }),
    ).resolves.toBeNull();

    const audit = await prisma.adminAuditLog.findMany({
      where: { entityType: "resource", entityId: String(created.id) },
      orderBy: { createdAt: "asc" },
      select: { action: true, entityLabel: true },
    });
    expect(audit.map((entry) => entry.action)).toEqual([
      "created",
      "published",
      "updated",
      "deleted",
    ]);
    expect(audit.at(-1)?.entityLabel).toBe(
      "Интеграционный материал · обновлён",
    );
  });

  it("не даёт ученику вызвать административный action", async () => {
    const resource = await prisma.resource.create({
      data: {
        type: "note",
        title: "Защищённый материал",
        body: "Нельзя менять ученику",
        coinReward: 1,
        sortOrder: 1,
        isPublished: false,
      },
    });
    sessionState.userId = INTEGRATION_STUDENT_ID;

    const publishForm = new FormData();
    publishForm.set("id", String(resource.id));
    publishForm.set("isPublished", "true");
    await expect(toggleResourcePublication(publishForm)).rejects.toThrow(
      "FORBIDDEN",
    );
    await expect(
      prisma.resource.findUniqueOrThrow({ where: { id: resource.id } }),
    ).resolves.toMatchObject({ isPublished: false });
  });

  it("отклоняет несуществующую группу без частичной записи", async () => {
    const formData = resourceForm({ title: "Не должен сохраниться" });
    formData.append("groupId", "999999");

    await expect(saveResource(null, formData)).resolves.toEqual({
      error: "Одна из выбранных групп не существует",
    });
    await expect(
      prisma.resource.count({ where: { title: "Не должен сохраниться" } }),
    ).resolves.toBe(0);
  });
});
