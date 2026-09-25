import { afterEach, describe, expect, it, vi } from "vitest";

import type { Prisma } from "../generated/prisma";
import {
  ADMIN_AUDIT_RETENTION_DAYS,
  recordAdminAudit,
} from "./admin-audit";

describe("recordAdminAudit", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("удаляет просроченные записи и сохраняет только безопасные поля", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-04T10:00:00.000Z"));
    const deleteMany = vi.fn().mockResolvedValue({ count: 0 });
    const create = vi.fn().mockResolvedValue({ id: 1 });
    const tx = {
      adminAuditLog: { deleteMany, create },
    } as unknown as Prisma.TransactionClient;

    await recordAdminAudit(tx, {
      actorId: "mentor-id",
      action: "published",
      entityType: "lesson",
      entityId: 42,
      entityLabel: `  ${"У".repeat(220)}  `,
    });

    expect(deleteMany).toHaveBeenCalledWith({
      where: {
        createdAt: {
          lt: new Date(
            Date.now() - ADMIN_AUDIT_RETENTION_DAYS * 24 * 60 * 60 * 1000,
          ),
        },
      },
    });
    expect(create).toHaveBeenCalledWith({
      data: {
        actorId: "mentor-id",
        action: "published",
        entityType: "lesson",
        entityId: "42",
        entityLabel: "У".repeat(200),
      },
    });
  });
});
