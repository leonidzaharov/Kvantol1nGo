"use client";

import { useActionState } from "react";

import type {
  ReviewCodeLanguage,
  ReviewResponseType,
} from "@/generated/prisma";
import { LazyCodeEditor } from "@/components/review/lazy-code-editor";
import { Button } from "@/components/ui/button";
import {
  submitReviewAssignment,
  type ReviewSubmissionFormState,
} from "@/lib/actions/review-assignments";

const inputClass =
  "w-full rounded-xl border-2 border-neutral-200 p-3 font-medium text-neutral-700 focus:border-sky-300 focus:outline-none";

type SubmissionFormProps = {
  assignmentId: number;
  responseType: ReviewResponseType;
  codeLanguage: ReviewCodeLanguage | null;
  initialValue?: string;
  isRevision?: boolean;
};

export function SubmissionForm({
  assignmentId,
  responseType,
  codeLanguage,
  initialValue = "",
  isRevision = false,
}: SubmissionFormProps) {
  const [state, formAction, pending] = useActionState<
    ReviewSubmissionFormState,
    FormData
  >(submitReviewAssignment, null);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="assignmentId" value={assignmentId} />

      {responseType === "CODE" ? (
        <div>
          <span className="mb-2 block font-bold text-neutral-700">
            Ваш код
          </span>
          <LazyCodeEditor
            language={codeLanguage ?? "OTHER"}
            initialValue={initialValue}
            name="content"
            ariaLabel="Код для отправки наставнику"
          />
        </div>
      ) : null}

      {responseType === "LINK" ? (
        <label className="block">
          <span className="mb-2 block font-bold text-neutral-700">
            Ссылка на работу
          </span>
          <input
            type="url"
            name="content"
            required
            maxLength={2_000}
            defaultValue={initialValue}
            placeholder="https://…"
            className={inputClass}
          />
        </label>
      ) : null}

      {responseType === "TEXT" ? (
        <label className="block">
          <span className="mb-2 block font-bold text-neutral-700">
            Ваш ответ
          </span>
          <textarea
            name="content"
            required
            rows={10}
            maxLength={10_000}
            defaultValue={initialValue}
            className={inputClass}
          />
        </label>
      ) : null}

      {state?.error ? (
        <p className="rounded-xl bg-rose-50 p-3 font-medium text-rose-700">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" variant="secondary" disabled={pending}>
        {pending
          ? "Отправляю…"
          : isRevision
            ? "Отправить исправленную версию"
            : "Отправить наставнику"}
      </Button>
    </form>
  );
}
