import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";

import type { ReviewSubmissionStatus } from "@/generated/prisma";
import { SubmissionStatusBadge } from "@/components/review/submission-status-badge";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/db";
import {
  REVIEW_ASSIGNMENT_STATUS_LABELS,
  REVIEW_CODE_LANGUAGE_LABELS,
  REVIEW_RESPONSE_TYPE_LABELS,
} from "@/lib/review-labels";
import { IdSchema, requireAdminOr404 } from "@/lib/server-guard";

import { AssignmentControls } from "../assignment-controls";

type PageProps = { params: Promise<{ id: string }> };

type RosterStudent = {
  id: string;
  name: string;
  groupName: string | null;
  isCurrentTarget: boolean;
};

const STATUS_ORDER: Record<ReviewSubmissionStatus, number> = {
  SUBMITTED: 0,
  REVISION_REQUESTED: 1,
  ACCEPTED: 3,
};

export default async function ReviewAssignmentOverviewPage({
  params,
}: PageProps) {
  await requireAdminOr404();
  const { id: rawId } = await params;
  const parsedId = IdSchema.safeParse(Number(rawId));
  if (!parsedId.success) {
    notFound();
  }

  const assignment = await prisma.reviewAssignment.findUnique({
    where: { id: parsedId.data },
    include: {
      groupTargets: {
        include: {
          group: {
            select: {
              name: true,
              students: {
                where: { isAdmin: false },
                orderBy: { name: "asc" },
                select: { id: true, name: true },
              },
            },
          },
        },
      },
      userTargets: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              group: { select: { name: true } },
            },
          },
        },
      },
      submissions: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              group: { select: { name: true } },
            },
          },
        },
      },
    },
  });
  if (!assignment) {
    notFound();
  }

  const roster = new Map<string, RosterStudent>();
  for (const target of assignment.groupTargets) {
    for (const student of target.group.students) {
      roster.set(student.id, {
        id: student.id,
        name: student.name,
        groupName: target.group.name,
        isCurrentTarget: true,
      });
    }
  }
  for (const target of assignment.userTargets) {
    roster.set(target.user.id, {
      id: target.user.id,
      name: target.user.name,
      groupName: target.user.group?.name ?? null,
      isCurrentTarget: true,
    });
  }
  for (const submission of assignment.submissions) {
    if (!roster.has(submission.user.id)) {
      roster.set(submission.user.id, {
        id: submission.user.id,
        name: submission.user.name,
        groupName: submission.user.group?.name ?? null,
        isCurrentTarget: false,
      });
    }
  }

  const submissionByUser = new Map(
    assignment.submissions.map((submission) => [
      submission.userId,
      submission,
    ]),
  );
  const students = [...roster.values()].sort((left, right) => {
    const leftStatus = submissionByUser.get(left.id)?.status ?? null;
    const rightStatus = submissionByUser.get(right.id)?.status ?? null;
    const leftOrder = leftStatus === null ? 2 : STATUS_ORDER[leftStatus];
    const rightOrder = rightStatus === null ? 2 : STATUS_ORDER[rightStatus];
    return leftOrder - rightOrder || left.name.localeCompare(right.name, "ru");
  });
  const counts = {
    notSubmitted: students.filter(
      (student) =>
        student.isCurrentTarget && !submissionByUser.has(student.id),
    ).length,
    submitted: assignment.submissions.filter(
      (submission) => submission.status === "SUBMITTED",
    ).length,
    revision: assignment.submissions.filter(
      (submission) => submission.status === "REVISION_REQUESTED",
    ).length,
    accepted: assignment.submissions.filter(
      (submission) => submission.status === "ACCEPTED",
    ).length,
  };
  const hasAudience =
    assignment.groupTargets.length + assignment.userTargets.length > 0;
  const hasSubmissions = assignment.submissions.length > 0;

  return (
    <div className="px-3 pb-12">
      <div className="mx-auto w-full max-w-[960px]">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/admin/review-assignments">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Все работы
          </Link>
        </Button>

        <section className="mt-4 rounded-2xl border-2 border-neutral-200 p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-start">
            <div className="min-w-0 flex-1">
              <div className="mb-2 flex flex-wrap gap-2 text-xs font-bold uppercase tracking-wide">
                <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-neutral-600">
                  {REVIEW_ASSIGNMENT_STATUS_LABELS[assignment.status]}
                </span>
                <span className="rounded-full bg-violet-50 px-2.5 py-1 text-violet-700">
                  {REVIEW_RESPONSE_TYPE_LABELS[assignment.responseType]}
                  {assignment.codeLanguage
                    ? ` · ${REVIEW_CODE_LANGUAGE_LABELS[assignment.codeLanguage]}`
                    : ""}
                </span>
              </div>
              <h1 className="text-2xl font-bold text-neutral-800">
                {assignment.title}
              </h1>
              <p className="mt-4 whitespace-pre-wrap leading-7 text-neutral-600">
                {assignment.instructions}
              </p>
            </div>
            <Button variant="secondaryOutline" size="sm" asChild>
              <Link
                href={`/admin/review-assignments/${assignment.id}/edit`}
              >
                <Pencil className="mr-2 h-4 w-4" />
                Изменить
              </Link>
            </Button>
          </div>

          <div className="mt-5 border-t border-neutral-100 pt-4">
            <AssignmentControls
              id={assignment.id}
              title={assignment.title}
              status={assignment.status}
              hasAudience={hasAudience}
              hasSubmissions={hasSubmissions}
            />
          </div>
        </section>

        <section className="mt-6">
          <h2 className="text-xl font-bold text-neutral-800">
            Состояние учеников
          </h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl bg-neutral-100 p-3">
              <p className="text-2xl font-extrabold text-neutral-700">
                {counts.notSubmitted}
              </p>
              <p className="text-sm font-medium text-neutral-500">
                Не отправили
              </p>
            </div>
            <div className="rounded-xl bg-sky-50 p-3">
              <p className="text-2xl font-extrabold text-sky-700">
                {counts.submitted}
              </p>
              <p className="text-sm font-medium text-sky-700">На проверке</p>
            </div>
            <div className="rounded-xl bg-amber-50 p-3">
              <p className="text-2xl font-extrabold text-amber-800">
                {counts.revision}
              </p>
              <p className="text-sm font-medium text-amber-800">Исправляют</p>
            </div>
            <div className="rounded-xl bg-green-50 p-3">
              <p className="text-2xl font-extrabold text-green-700">
                {counts.accepted}
              </p>
              <p className="text-sm font-medium text-green-700">Принято</p>
            </div>
          </div>

          {students.length === 0 ? (
            <p className="mt-4 rounded-2xl border-2 border-dashed border-neutral-200 p-8 text-center text-neutral-400">
              Аудитория пока не выбрана.
            </p>
          ) : (
            <ul className="mt-4 space-y-2">
              {students.map((student) => {
                const submission = submissionByUser.get(student.id);
                return (
                  <li
                    key={student.id}
                    className="flex flex-col gap-3 rounded-xl border border-neutral-200 p-4 sm:flex-row sm:items-center"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-neutral-800">
                        {student.name}
                      </p>
                      <p className="text-xs text-neutral-400">
                        {student.groupName ?? "Без группы"}
                        {!student.isCurrentTarget
                          ? " · больше не назначено"
                          : ""}
                      </p>
                    </div>
                    {submission ? (
                      <>
                        <SubmissionStatusBadge status={submission.status} />
                        <Button size="sm" variant="secondaryOutline" asChild>
                          <Link
                            href={`/admin/review-assignments/${assignment.id}/review/${submission.id}`}
                          >
                            {submission.status === "SUBMITTED"
                              ? "Проверить"
                              : "Посмотреть"}
                          </Link>
                        </Button>
                      </>
                    ) : (
                      <span className="inline-flex rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-bold text-neutral-500">
                        Не отправлено
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
