import Link from "next/link";
import { ClipboardCheck } from "lucide-react";

import type { ReviewSubmissionStatus } from "@/generated/prisma";
import { SubmissionStatusBadge } from "@/components/review/submission-status-badge";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/db";
import {
  REVIEW_ASSIGNMENT_STATUS_LABELS,
  REVIEW_RESPONSE_TYPE_LABELS,
} from "@/lib/review-labels";
import { requireUser } from "@/lib/server-guard";

const STATUS_ORDER: Record<ReviewSubmissionStatus, number> = {
  REVISION_REQUESTED: 0,
  SUBMITTED: 2,
  ACCEPTED: 3,
};

export default async function StudentWorksPage() {
  const userId = await requireUser();
  const student = await prisma.user.findUnique({
    where: { id: userId },
    select: { groupId: true, isAdmin: true },
  });

  if (!student || student.isAdmin) {
    return (
      <div className="px-3">
        <p className="mx-auto max-w-xl rounded-2xl bg-neutral-50 p-8 text-center text-neutral-500">
          Работы назначаются ученическим профилям.
        </p>
      </div>
    );
  }

  const audience = {
    OR: [
      { userTargets: { some: { userId } } },
      ...(student.groupId !== null
        ? [{ groupTargets: { some: { groupId: student.groupId } } }]
        : []),
    ],
  };
  const assignments = await prisma.reviewAssignment.findMany({
    where: {
      OR: [
        { status: "PUBLISHED", ...audience },
        { submissions: { some: { userId } } },
      ],
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: {
      submissions: {
        where: { userId },
        select: { status: true, currentVersion: true, updatedAt: true },
      },
    },
  });

  const sortedAssignments = assignments.toSorted((left, right) => {
    const leftSubmission = left.submissions[0];
    const rightSubmission = right.submissions[0];
    const leftOrder = leftSubmission ? STATUS_ORDER[leftSubmission.status] : 1;
    const rightOrder = rightSubmission
      ? STATUS_ORDER[rightSubmission.status]
      : 1;
    return rightOrder === leftOrder
      ? right.createdAt.getTime() - left.createdAt.getTime()
      : leftOrder - rightOrder;
  });

  return (
    <div className="px-3 pb-12">
      <div className="mx-auto w-full max-w-[820px]">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-violet-600 text-white">
            <ClipboardCheck className="h-10 w-10" />
          </div>
          <h1 className="mt-4 text-2xl font-bold text-neutral-800">
            Мои работы
          </h1>
          <p className="mt-2 max-w-xl text-neutral-500">
            Здесь находятся только проекты, которые наставник проверяет
            вручную. Они не влияют на XP, монеты или прохождение уроков.
          </p>
        </div>

        {sortedAssignments.length === 0 ? (
          <p className="mt-8 rounded-2xl border-2 border-dashed border-neutral-200 p-8 text-center text-neutral-400">
            Сейчас у вас нет работ на проверку.
          </p>
        ) : (
          <ul className="mt-8 space-y-4">
            {sortedAssignments.map((assignment) => {
              const submission = assignment.submissions[0];
              return (
                <li
                  key={assignment.id}
                  className="rounded-2xl border-2 border-neutral-200 p-5"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <div className="mb-2 flex flex-wrap gap-2">
                        {submission ? (
                          <SubmissionStatusBadge status={submission.status} />
                        ) : (
                          <span className="inline-flex rounded-full bg-violet-100 px-2.5 py-1 text-xs font-bold text-violet-700">
                            Новая работа
                          </span>
                        )}
                        {assignment.status === "ARCHIVED" ? (
                          <span className="inline-flex rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-bold text-neutral-500">
                            {
                              REVIEW_ASSIGNMENT_STATUS_LABELS[
                                assignment.status
                              ]
                            }
                          </span>
                        ) : null}
                      </div>
                      <h2 className="font-bold text-neutral-800">
                        {assignment.title}
                      </h2>
                      <p className="mt-1 text-sm text-neutral-400">
                        Ответ:{" "}
                        {
                          REVIEW_RESPONSE_TYPE_LABELS[
                            assignment.responseType
                          ]
                        }
                      </p>
                    </div>
                    <Button
                      variant={
                        submission?.status === "REVISION_REQUESTED"
                          ? "secondary"
                          : "secondaryOutline"
                      }
                      asChild
                    >
                      <Link href={`/works/${assignment.id}`}>
                        {submission?.status === "REVISION_REQUESTED"
                          ? "Исправить"
                          : submission
                            ? "Открыть"
                            : "Начать"}
                      </Link>
                    </Button>
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
