"use client";

import {
  deleteReviewAssignment,
  setReviewAssignmentStatus,
} from "@/lib/actions/review-assignments";
import type { ReviewAssignmentStatus } from "@/generated/prisma";
import { Button } from "@/components/ui/button";

type AssignmentControlsProps = {
  id: number;
  title: string;
  status: ReviewAssignmentStatus;
  hasAudience: boolean;
  hasSubmissions: boolean;
};

function StatusForm({
  id,
  status,
  label,
  variant = "secondary",
  confirmText,
  disabled = false,
}: {
  id: number;
  status: ReviewAssignmentStatus;
  label: string;
  variant?: "secondary" | "dangerOutline";
  confirmText?: string;
  disabled?: boolean;
}) {
  return (
    <form
      action={setReviewAssignmentStatus}
      onSubmit={(event) => {
        if (confirmText && !confirm(confirmText)) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <Button type="submit" size="sm" variant={variant} disabled={disabled}>
        {label}
      </Button>
    </form>
  );
}

export function AssignmentControls({
  id,
  title,
  status,
  hasAudience,
  hasSubmissions,
}: AssignmentControlsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {status === "DRAFT" ? (
        <>
          <StatusForm
            id={id}
            status="PUBLISHED"
            label="Опубликовать"
            disabled={!hasAudience}
          />
          {!hasAudience ? (
            <span className="self-center text-xs font-medium text-amber-700">
              Сначала выберите аудиторию
            </span>
          ) : null}
          {!hasSubmissions ? (
            <form
              action={deleteReviewAssignment}
              onSubmit={(event) => {
                if (!confirm(`Удалить черновик «${title}»?`)) {
                  event.preventDefault();
                }
              }}
            >
              <input type="hidden" name="id" value={id} />
              <Button type="submit" size="sm" variant="dangerOutline">
                Удалить
              </Button>
            </form>
          ) : null}
        </>
      ) : null}

      {status === "PUBLISHED" ? (
        <>
          {!hasSubmissions ? (
            <StatusForm
              id={id}
              status="DRAFT"
              label="Вернуть в черновик"
              variant="dangerOutline"
            />
          ) : null}
          <StatusForm
            id={id}
            status="ARCHIVED"
            label="В архив"
            variant="dangerOutline"
            confirmText="Архивировать работу? Новые ответы и исправления станут недоступны."
          />
        </>
      ) : null}

      {status === "ARCHIVED" ? (
        <StatusForm id={id} status="PUBLISHED" label="Опубликовать снова" />
      ) : null}
    </div>
  );
}
