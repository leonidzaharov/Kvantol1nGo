import type { Prisma } from "@/generated/prisma";

/**
 * Removes records that deliberately have no cascading foreign key to User.
 * The remaining student-owned rows are removed by their ON DELETE CASCADE
 * relations when the User rows are deleted.
 */
export async function deleteStudentRecords(
  tx: Prisma.TransactionClient,
  userIds: string[],
): Promise<number> {
  if (userIds.length === 0) return 0;

  const userFilter = { userId: { in: userIds } };
  await tx.loginAttempt.deleteMany({ where: userFilter });
  await tx.userLessonProgress.deleteMany({ where: userFilter });
  await tx.userAchievement.deleteMany({ where: userFilter });
  await tx.userResource.deleteMany({ where: userFilter });

  const deleted = await tx.user.deleteMany({
    where: { id: { in: userIds }, isAdmin: false },
  });
  return deleted.count;
}
