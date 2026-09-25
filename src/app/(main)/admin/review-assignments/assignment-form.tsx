"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import type {
  ReviewAssignmentStatus,
  ReviewCodeLanguage,
  ReviewResponseType,
} from "@/generated/prisma";
import {
  saveReviewAssignment,
  type ReviewAssignmentFormState,
} from "@/lib/actions/review-assignments";
import {
  REVIEW_CODE_LANGUAGE_LABELS,
  REVIEW_RESPONSE_TYPE_LABELS,
} from "@/lib/review-labels";
import { Button } from "@/components/ui/button";

import { AudienceSelector } from "./audience-selector";

const inputClass =
  "w-full rounded-xl border-2 border-neutral-200 p-3 font-medium text-neutral-700 focus:border-sky-300 focus:outline-none disabled:bg-neutral-100 disabled:text-neutral-500";

type AssignmentFormProps = {
  assignment?: {
    id: number;
    title: string;
    instructions: string;
    responseType: ReviewResponseType;
    codeLanguage: ReviewCodeLanguage | null;
    status: ReviewAssignmentStatus;
  };
  groups: { id: number; name: string }[];
  students: {
    id: string;
    name: string;
    groupId: number | null;
    groupName: string | null;
  }[];
  selectedGroupIds?: number[];
  selectedUserIds?: string[];
  hasSubmissions?: boolean;
};

export function AssignmentForm({
  assignment,
  groups,
  students,
  selectedGroupIds,
  selectedUserIds,
  hasSubmissions = false,
}: AssignmentFormProps) {
  const [state, formAction, pending] = useActionState<
    ReviewAssignmentFormState,
    FormData
  >(saveReviewAssignment, null);
  const [responseType, setResponseType] = useState<ReviewResponseType>(
    assignment?.responseType ?? "TEXT",
  );
  const [codeLanguage, setCodeLanguage] = useState<ReviewCodeLanguage>(
    assignment?.codeLanguage ?? "PYTHON",
  );

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="id" value={assignment?.id ?? ""} />

      <label className="flex flex-col gap-1.5">
        <span className="font-bold text-neutral-700">Название</span>
        <input
          type="text"
          name="title"
          required
          maxLength={120}
          defaultValue={assignment?.title ?? ""}
          placeholder="Например: JS · Массивы · Практическая работа"
          className={inputClass}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="font-bold text-neutral-700">Инструкция</span>
        <textarea
          name="instructions"
          required
          rows={8}
          maxLength={10_000}
          defaultValue={assignment?.instructions ?? ""}
          placeholder="Что нужно сделать и что отправить на проверку"
          className={inputClass}
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="font-bold text-neutral-700">Формат ответа</span>
          <select
            name="responseType"
            value={responseType}
            disabled={hasSubmissions}
            onChange={(event) =>
              setResponseType(event.target.value as ReviewResponseType)
            }
            className={inputClass}
          >
            {(Object.keys(REVIEW_RESPONSE_TYPE_LABELS) as ReviewResponseType[]).map(
              (value) => (
                <option key={value} value={value}>
                  {REVIEW_RESPONSE_TYPE_LABELS[value]}
                </option>
              ),
            )}
          </select>
          {hasSubmissions ? (
            <input type="hidden" name="responseType" value={responseType} />
          ) : null}
        </label>

        {responseType === "CODE" ? (
          <label className="flex flex-col gap-1.5">
            <span className="font-bold text-neutral-700">Язык кода</span>
            <select
              name="codeLanguage"
              value={codeLanguage}
              disabled={hasSubmissions}
              onChange={(event) =>
                setCodeLanguage(event.target.value as ReviewCodeLanguage)
              }
              className={inputClass}
            >
              {(Object.keys(REVIEW_CODE_LANGUAGE_LABELS) as ReviewCodeLanguage[]).map(
                (value) => (
                  <option key={value} value={value}>
                    {REVIEW_CODE_LANGUAGE_LABELS[value]}
                  </option>
                ),
              )}
            </select>
            {hasSubmissions ? (
              <input type="hidden" name="codeLanguage" value={codeLanguage} />
            ) : null}
          </label>
        ) : (
          <input type="hidden" name="codeLanguage" value="" />
        )}
      </div>

      {hasSubmissions ? (
        <p className="rounded-xl bg-sky-50 p-3 text-sm font-medium text-sky-800">
          Формат заблокирован после первого ответа. Название, инструкцию и
          аудиторию можно уточнить.
        </p>
      ) : null}

      <AudienceSelector
        groups={groups}
        students={students}
        initialGroupIds={selectedGroupIds}
        initialUserIds={selectedUserIds}
      />

      {state?.error ? (
        <p className="rounded-xl bg-rose-50 p-3 font-medium text-rose-700">
          {state.error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending
            ? "Сохраняю…"
            : assignment
              ? "Сохранить изменения"
              : "Сохранить черновик"}
        </Button>
        <Button variant="ghost" asChild>
          <Link
            href={
              assignment
                ? `/admin/review-assignments/${assignment.id}`
                : "/admin/review-assignments"
            }
          >
            Отмена
          </Link>
        </Button>
      </div>
    </form>
  );
}
