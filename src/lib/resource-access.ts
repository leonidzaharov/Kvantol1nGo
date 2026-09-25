import { prisma } from "@/lib/db";

export async function canAccessResource(
  userId: string,
  resourceId: number,
): Promise<boolean> {
  const [user, resource] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { isAdmin: true, groupId: true },
    }),
    prisma.resource.findUnique({
      where: { id: resourceId },
      select: {
        isPublished: true,
        groupAccess: { select: { groupId: true } },
      },
    }),
  ]);
  if (!user || !resource) return false;
  if (user.isAdmin) return true;
  if (!resource.isPublished || user.groupId === null) return false;
  return resource.groupAccess.some((item) => item.groupId === user.groupId);
}
