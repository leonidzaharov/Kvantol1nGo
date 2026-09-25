export type LearningContext = {
  isAdmin: boolean;
  groupId: number | null;
  track: "intro" | "advanced" | "project" | null;
};

export function categoryIsAccessible(
  context: LearningContext,
  category: {
    isPublished: boolean;
    track: LearningContext["track"];
    groupIds: number[];
  },
): boolean {
  if (context.isAdmin) return true;
  if (!context.groupId || !context.track) return false;
  return (
    category.isPublished &&
    category.track === context.track &&
    category.groupIds.includes(context.groupId)
  );
}

export function lessonIsAccessible(
  context: LearningContext,
  lesson: {
    isPublished: boolean;
    category: {
      isPublished: boolean;
      track: LearningContext["track"];
      groupIds: number[];
    };
    restrictedGroupIds: number[];
  },
): boolean {
  if (context.isAdmin) return true;
  if (!context.groupId) return false;
  if (!categoryIsAccessible(context, lesson.category)) return false;
  return (
    lesson.isPublished &&
    (lesson.restrictedGroupIds.length === 0 ||
      lesson.restrictedGroupIds.includes(context.groupId))
  );
}
