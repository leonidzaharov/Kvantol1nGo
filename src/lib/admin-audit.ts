import type {
  AdminAuditAction,
  AdminAuditEntity,
  Prisma,
} from "../generated/prisma";

export const ADMIN_AUDIT_RETENTION_DAYS = 180;

type AuditInput = {
  actorId: string;
  action: AdminAuditAction;
  entityType: AdminAuditEntity;
  entityId?: string | number | null;
  entityLabel?: string | null;
};

/**
 * This runs inside the same transaction as the administrative mutation. The
 * action and its log are either both saved or both rolled back. Old records
 * are removed automatically on the next important mentor action.
 */
export async function recordAdminAudit(
  tx: Prisma.TransactionClient,
  input: AuditInput,
): Promise<void> {
  const retentionBoundary = new Date(
    Date.now() - ADMIN_AUDIT_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  );

  await tx.adminAuditLog.deleteMany({
    where: { createdAt: { lt: retentionBoundary } },
  });
  await tx.adminAuditLog.create({
    data: {
      actorId: input.actorId,
      action: input.action,
      entityType: input.entityType,
      entityId:
        input.entityId === undefined || input.entityId === null
          ? null
          : String(input.entityId),
      entityLabel: input.entityLabel?.trim().slice(0, 200) || null,
    },
  });
}
