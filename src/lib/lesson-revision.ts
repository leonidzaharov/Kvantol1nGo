import "server-only";

import { createHash } from "node:crypto";
import type { Prisma } from "@/generated/prisma";

export function lessonRevision(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

/** Checks share the lock; saving content must wait for all active checks. */
export async function lockLessonContent(
  tx: Prisma.TransactionClient,
  lessonId: number,
  exclusive = false,
): Promise<void> {
  if (exclusive) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(24102026, ${lessonId}::integer)`;
  } else {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(24102026, ${lessonId}::integer)`;
  }
}
