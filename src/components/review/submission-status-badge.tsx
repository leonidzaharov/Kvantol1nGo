import type { ReviewSubmissionStatus } from "@/generated/prisma";
import {
  REVIEW_SUBMISSION_STATUS_CLASSES,
  REVIEW_SUBMISSION_STATUS_LABELS,
} from "@/lib/review-labels";

export function SubmissionStatusBadge({
  status,
}: {
  status: ReviewSubmissionStatus;
}) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${REVIEW_SUBMISSION_STATUS_CLASSES[status]}`}
    >
      {REVIEW_SUBMISSION_STATUS_LABELS[status]}
    </span>
  );
}
