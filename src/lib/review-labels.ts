import type {
  ReviewAssignmentStatus,
  ReviewCodeLanguage,
  ReviewResponseType,
  ReviewSubmissionStatus,
} from "@/generated/prisma";

export const REVIEW_ASSIGNMENT_STATUS_LABELS: Record<
  ReviewAssignmentStatus,
  string
> = {
  DRAFT: "Черновик",
  PUBLISHED: "Опубликовано",
  ARCHIVED: "В архиве",
};

export const REVIEW_RESPONSE_TYPE_LABELS: Record<ReviewResponseType, string> = {
  TEXT: "Текст",
  LINK: "Ссылка",
  CODE: "Код",
};

export const REVIEW_CODE_LANGUAGE_LABELS: Record<ReviewCodeLanguage, string> = {
  PYTHON: "Python",
  JAVASCRIPT: "JavaScript",
  HTML: "HTML",
  CSS: "CSS",
  OTHER: "Другой",
};

export const REVIEW_SUBMISSION_STATUS_LABELS: Record<
  ReviewSubmissionStatus,
  string
> = {
  SUBMITTED: "На проверке",
  REVISION_REQUESTED: "Нужно исправить",
  ACCEPTED: "Принято",
};

export const REVIEW_SUBMISSION_STATUS_CLASSES: Record<
  ReviewSubmissionStatus,
  string
> = {
  SUBMITTED: "bg-sky-100 text-sky-700",
  REVISION_REQUESTED: "bg-amber-100 text-amber-800",
  ACCEPTED: "bg-green-100 text-green-700",
};
