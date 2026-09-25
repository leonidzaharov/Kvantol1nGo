import "server-only";

import { cache } from "react";

import { prisma } from "@/lib/db";

export const getSidebarData = cache(async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, isAdmin: true, groupId: true },
  });
  if (!user) {
    return {
      isAdmin: false,
      name: "Ученик",
      hasReviewAssignments: false,
      revisionRequestCount: 0,
    };
  }
  if (user.isAdmin) {
    return {
      isAdmin: true,
      name: user.name,
      hasReviewAssignments: false,
      revisionRequestCount: 0,
    };
  }

  const audience = {
    OR: [
      { userTargets: { some: { userId } } },
      ...(user.groupId !== null
        ? [{ groupTargets: { some: { groupId: user.groupId } } }]
        : []),
    ],
  };
  const [assignmentCount, revisionRequestCount] = await Promise.all([
    prisma.reviewAssignment.count({
      where: {
        OR: [
          { status: "PUBLISHED", ...audience },
          { submissions: { some: { userId } } },
        ],
      },
    }),
    prisma.reviewSubmission.count({
      where: {
        userId,
        status: "REVISION_REQUESTED",
        assignment: { status: "PUBLISHED", ...audience },
      },
    }),
  ]);

  return {
    isAdmin: false,
    name: user.name,
    hasReviewAssignments: assignmentCount > 0,
    revisionRequestCount,
  };
});
