"use client";

import { useActionState } from "react";

import {
  reviewSubmission,
  type ReviewDecisionFormState,
} from "@/lib/actions/review-assignments";
import { Button } from "@/components/ui/button";

type ReviewDecisionFormProps = {
  assignmentId: number;
  submissionId: number;
};

export function ReviewDecisionForm({
  assignmentId,
  submissionId,
}: ReviewDecisionFormProps) {
  const [state, formAction, pending] = useActionState<
    ReviewDecisionFormState,
    FormData
  >(reviewSubmission, null);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="assignmentId" value={assignmentId} />
      <input type="hidden" name="submissionId" value={submissionId} />

      <label className="block">
        <span className="mb-2 block font-bold text-neutral-700">
          Комментарий наставника
        </span>
        <textarea
          name="mentorComment"
          rows={10}
          maxLength={5_000}
          placeholder="Что получилось хорошо или что нужно исправить"
          className="w-full rounded-xl border-2 border-neutral-200 p-3 font-medium text-neutral-700 focus:border-sky-300 focus:outline-none"
        />
        <span className="mt-1 block text-xs text-neutral-400">
          При возврате комментарий обязателен.
        </span>
      </label>

      {state?.error ? (
        <p className="rounded-xl bg-rose-50 p-3 text-sm font-medium text-rose-700">
          {state.error}
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        <Button
          type="submit"
          name="decision"
          value="ACCEPTED"
          variant="secondary"
          disabled={pending}
        >
          Принять
        </Button>
        <Button
          type="submit"
          name="decision"
          value="REVISION_REQUESTED"
          variant="dangerOutline"
          disabled={pending}
        >
          Вернуть
        </Button>
      </div>
    </form>
  );
}
