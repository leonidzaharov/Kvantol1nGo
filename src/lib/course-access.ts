import { prisma } from "@/lib/db";
import {
  categoryIsAccessible,
  lessonIsAccessible,
  type LearningContext,
} from "@/lib/course-access-logic";

export {
  categoryIsAccessible,
  lessonIsAccessible,
  type LearningContext,
} from "@/lib/course-access-logic";

export async function getLearningContext(
  userId: string,
): Promise<LearningContext | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      isAdmin: true,
      groupId: true,
      group: { select: { track: true } },
    },
  });
  if (!user) return null;
  return {
    isAdmin: user.isAdmin,
    groupId: user.groupId,
    track: user.group?.track ?? null,
  };
}

export async function canAccessCategory(
  userId: string,
  categoryId: number,
): Promise<boolean> {
  const [context, category] = await Promise.all([
    getLearningContext(userId),
    prisma.category.findUnique({
      where: { id: categoryId },
      select: {
        isPublished: true,
        track: true,
        groupAccess: { select: { groupId: true } },
      },
    }),
  ]);
  if (!context || !category) return false;
  return categoryIsAccessible(context, {
    ...category,
    groupIds: category.groupAccess.map((item) => item.groupId),
  });
}

export async function canAccessLesson(
  userId: string,
  lessonId: number,
): Promise<boolean> {
  const [context, lesson] = await Promise.all([
    getLearningContext(userId),
    prisma.lesson.findUnique({
      where: { id: lessonId },
      select: {
        isPublished: true,
        groupRestrictions: { select: { groupId: true } },
        category: {
          select: {
            isPublished: true,
            track: true,
            groupAccess: { select: { groupId: true } },
          },
        },
      },
    }),
  ]);
  if (!context || !lesson) return false;
  return lessonIsAccessible(context, {
    isPublished: lesson.isPublished,
    restrictedGroupIds: lesson.groupRestrictions.map((item) => item.groupId),
    category: {
      ...lesson.category,
      groupIds: lesson.category.groupAccess.map((item) => item.groupId),
    },
  });
}
