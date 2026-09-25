import Link from "next/link";
import { ClipboardCheck, Plus } from "lucide-react";

import type { ReviewSubmissionStatus } from "@/generated/prisma";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/db";
import {
  REVIEW_ASSIGNMENT_STATUS_LABELS,
  REVIEW_RESPONSE_TYPE_LABELS,
} from "@/lib/review-labels";
import { requireAdminOr404 } from "@/lib/server-guard";

import { AdminNav } from "../admin-nav";
import { AssignmentControls } from "./assignment-controls";

export default async function ReviewAssignmentsAdminPage() {
  await requireAdminOr404();

  const [assignments, submissionCounts] = await Promise.all([
    prisma.reviewAssignment.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: {
        _count: {
          select: {
            groupTargets: true,
            userTargets: true,
            submissions: true,
          },
        },
      },
    }),
    // Получаем максимум три агрегированные строки на задание вместо одной
    // строки на каждую ученическую отправку. Содержимое работ не загружается.
    prisma.reviewSubmission.groupBy({
      by: ["assignmentId", "status"],
      _count: { _all: true },
    }),
  ]);
  const countsByAssignment = new Map<
    number,
    Partial<Record<ReviewSubmissionStatus, number>>
  >();
  for (const row of submissionCounts) {
    const counts = countsByAssignment.get(row.assignmentId) ?? {};
    counts[row.status] = row._count._all;
    countsByAssignment.set(row.assignmentId, counts);
  }

  return (
    <div className="px-3">
      <div className="mx-auto flex w-full max-w-[960px] flex-col">
        <div className="flex flex-col items-center">
          <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-violet-600 text-white">
            <ClipboardCheck className="h-10 w-10" />
          </div>
          <h1 className="my-2 text-center text-2xl font-bold text-neutral-700">
            Админка · Работы
          </h1>
          <p className="mb-6 max-w-2xl text-center text-neutral-500">
            Независимые проекты с ручной проверкой. Они не влияют на уроки,
            XP или монеты.
          </p>
          <AdminNav active="reviewAssignments" />
          <div className="mt-4">
            <Button variant="secondary" asChild>
              <Link href="/admin/review-assignments/new">
                <Plus className="mr-2 h-5 w-5" />
                Новая работа
              </Link>
            </Button>
          </div>
        </div>

        {assignments.length === 0 ? (
          <p className="mt-8 rounded-2xl border-2 border-dashed border-neutral-200 px-6 py-10 text-center text-neutral-400">
            Работ пока нет. Создайте первый черновик для старшей группы.
          </p>
        ) : (
          <ul className="mt-8 space-y-4">
            {assignments.map((assignment) => {
              const submissionCount = countsByAssignment.get(assignment.id);
              const waiting = submissionCount?.SUBMITTED ?? 0;
              const revision = submissionCount?.REVISION_REQUESTED ?? 0;
              const hasAudience =
                assignment._count.groupTargets +
                  assignment._count.userTargets >
                0;

              return (
                <li
                  key={assignment.id}
                  className="rounded-2xl border-2 border-neutral-200 p-5"
                >
                  <div className="flex flex-col gap-4 md:flex-row md:items-start">
                    <div className="min-w-0 flex-1">
                      <div className="mb-2 flex flex-wrap gap-2 text-xs font-bold uppercase tracking-wide">
                        <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-neutral-600">
                          {
                            REVIEW_ASSIGNMENT_STATUS_LABELS[
                              assignment.status
                            ]
                          }
                        </span>
                        <span className="rounded-full bg-violet-50 px-2.5 py-1 text-violet-700">
                          {
                            REVIEW_RESPONSE_TYPE_LABELS[
                              assignment.responseType
                            ]
                          }
                        </span>
                      </div>
                      <h2 className="text-lg font-bold text-neutral-800">
                        {assignment.title}
                      </h2>
                      <p className="mt-2 text-sm text-neutral-500">
                        {assignment._count.groupTargets} групп ·{" "}
                        {assignment._count.userTargets} учеников ·{" "}
                        {assignment._count.submissions} отправили
                      </p>
                      {waiting + revision > 0 ? (
                        <p className="mt-1 text-sm font-bold text-amber-700">
                          На проверке: {waiting} · Исправляют: {revision}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="secondaryOutline" asChild>
                        <Link
                          href={`/admin/review-assignments/${assignment.id}`}
                        >
                          Открыть
                        </Link>
                      </Button>
                      <Button size="sm" variant="ghost" asChild>
                        <Link
                          href={`/admin/review-assignments/${assignment.id}/edit`}
                        >
                          Изменить
                        </Link>
                      </Button>
                    </div>
                  </div>
                  <div className="mt-4 border-t border-neutral-100 pt-4">
                    <AssignmentControls
                      id={assignment.id}
                      title={assignment.title}
                      status={assignment.status}
                      hasAudience={hasAudience}
                      hasSubmissions={assignment._count.submissions > 0}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
