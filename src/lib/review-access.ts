import type {
  ReviewAssignmentStatus,
  ReviewSubmissionStatus,
} from "@/generated/prisma";

export type ReviewAccessSnapshot = {
  assignmentStatus: ReviewAssignmentStatus;
  studentId: string;
  studentGroupId: number | null;
  targetUserIds: readonly string[];
  targetGroupIds: readonly number[];
  submissionStatus: ReviewSubmissionStatus | null;
};

export function isReviewAssignmentTargeted(
  snapshot: Pick<
    ReviewAccessSnapshot,
    "studentId" | "studentGroupId" | "targetUserIds" | "targetGroupIds"
  >,
): boolean {
  return (
    snapshot.targetUserIds.includes(snapshot.studentId) ||
    (snapshot.studentGroupId !== null &&
      snapshot.targetGroupIds.includes(snapshot.studentGroupId))
  );
}

/**
 * История собственной отправки остаётся доступной после архивации или
 * изменения аудитории. Чужая и неопубликованная работа недоступна.
 */
export function canViewReviewAssignment(
  snapshot: ReviewAccessSnapshot,
): boolean {
  if (snapshot.submissionStatus !== null) {
    return true;
  }
  return (
    snapshot.assignmentStatus === "PUBLISHED" &&
    isReviewAssignmentTargeted(snapshot)
  );
}

/**
 * Новую версию можно отправить только в опубликованную и всё ещё назначенную
 * работу: первый раз либо после явного возврата наставником.
 */
export function canSubmitReviewAssignment(
  snapshot: ReviewAccessSnapshot,
): boolean {
  if (
    snapshot.assignmentStatus !== "PUBLISHED" ||
    !isReviewAssignmentTargeted(snapshot)
  ) {
    return false;
  }
  return (
    snapshot.submissionStatus === null ||
    snapshot.submissionStatus === "REVISION_REQUESTED"
  );
}
