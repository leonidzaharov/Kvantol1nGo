import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { ResponseView } from "@/components/review/response-view";
import { SubmissionStatusBadge } from "@/components/review/submission-status-badge";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/db";
import {
  canSubmitReviewAssignment,
  canViewReviewAssignment,
  type ReviewAccessSnapshot,
} from "@/lib/review-access";
import {
  REVIEW_CODE_LANGUAGE_LABELS,
  REVIEW_RESPONSE_TYPE_LABELS,
  REVIEW_SUBMISSION_STATUS_LABELS,
} from "@/lib/review-labels";
import { IdSchema, requireUser } from "@/lib/server-guard";

import { SubmissionForm } from "../submission-form";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sent?: string }>;
};

const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Moscow",
});

export default async function StudentWorkPage({
  params,
  searchParams,
}: PageProps) {
  const userId = await requireUser();
  const [{ id: rawId }, query] = await Promise.all([params, searchParams]);
  const parsedId = IdSchema.safeParse(Number(rawId));
  if (!parsedId.success) {
    notFound();
  }

  const [student, assignment] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { groupId: true, isAdmin: true },
    }),
    prisma.reviewAssignment.findUnique({
      where: { id: parsedId.data },
      include: {
        groupTargets: { select: { groupId: true } },
        userTargets: { select: { userId: true } },
        submissions: {
          where: { userId },
          include: { versions: { orderBy: { version: "desc" } } },
        },
      },
    }),
  ]);
  if (!student || student.isAdmin || !assignment) {
    notFound();
  }

  const submission = assignment.submissions[0] ?? null;
  const snapshot: ReviewAccessSnapshot = {
    assignmentStatus: assignment.status,
    studentId: userId,
    studentGroupId: student.groupId,
    targetUserIds: assignment.userTargets.map((target) => target.userId),
    targetGroupIds: assignment.groupTargets.map((target) => target.groupId),
    submissionStatus: submission?.status ?? null,
  };
  if (!canViewReviewAssignment(snapshot)) {
    notFound();
  }

  const canSubmit = canSubmitReviewAssignment(snapshot);
  const currentVersion =
    submission?.versions.find(
      (version) => version.version === submission.currentVersion,
    ) ?? null;
  const isRevision = submission?.status === "REVISION_REQUESTED";

  return (
    <div className="px-3 pb-12">
      <div className="mx-auto w-full max-w-[880px]">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/works">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Мои работы
          </Link>
        </Button>

        <section className="mt-4 rounded-2xl border-2 border-neutral-200 p-5 sm:p-7">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-violet-100 px-2.5 py-1 text-xs font-bold text-violet-700">
              {REVIEW_RESPONSE_TYPE_LABELS[assignment.responseType]}
              {assignment.codeLanguage
                ? ` · ${REVIEW_CODE_LANGUAGE_LABELS[assignment.codeLanguage]}`
                : ""}
            </span>
            {submission ? (
              <SubmissionStatusBadge status={submission.status} />
            ) : null}
          </div>
          <h1 className="mt-3 text-2xl font-bold text-neutral-800">
            {assignment.title}
          </h1>
          <p className="mt-4 whitespace-pre-wrap leading-7 text-neutral-600">
            {assignment.instructions}
          </p>
          <p className="mt-5 rounded-xl bg-neutral-50 p-3 text-sm text-neutral-500">
            Эта работа не влияет на XP, монеты и завершение уроков.
          </p>
        </section>

        {query.sent === "1" ? (
          <p className="mt-5 rounded-xl bg-green-50 p-4 font-bold text-green-700">
            Ответ отправлен наставнику.
          </p>
        ) : null}

        {isRevision && currentVersion?.mentorComment ? (
          <section className="mt-5 rounded-2xl border-2 border-amber-200 bg-amber-50 p-5">
            <h2 className="font-bold text-amber-900">
              Что нужно исправить
            </h2>
            <p className="mt-2 whitespace-pre-wrap text-amber-900">
              {currentVersion.mentorComment}
            </p>
          </section>
        ) : null}

        {canSubmit ? (
          <section className="mt-6 rounded-2xl border-2 border-neutral-200 p-5">
            <h2 className="mb-4 text-xl font-bold text-neutral-800">
              {isRevision ? "Исправленная версия" : "Ваш ответ"}
            </h2>
            <SubmissionForm
              assignmentId={assignment.id}
              responseType={assignment.responseType}
              codeLanguage={assignment.codeLanguage}
              initialValue={isRevision ? (currentVersion?.content ?? "") : ""}
              isRevision={isRevision}
            />
          </section>
        ) : null}

        {submission ? (
          <section className="mt-8">
            <h2 className="text-xl font-bold text-neutral-800">
              История отправок
            </h2>
            <div className="mt-4 space-y-4">
              {submission.versions.map((version, index) => (
                <article
                  key={version.version}
                  className="rounded-2xl border-2 border-neutral-200 p-5"
                >
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-bold text-neutral-800">
                        Версия {version.version}
                        {index === 0 ? " · последняя" : ""}
                      </p>
                      <p className="text-xs text-neutral-400">
                        {dateFormatter.format(version.submittedAt)}
                      </p>
                    </div>
                    <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-bold text-neutral-600">
                      {REVIEW_SUBMISSION_STATUS_LABELS[version.status]}
                    </span>
                  </div>
                  <ResponseView
                    responseType={assignment.responseType}
                    codeLanguage={assignment.codeLanguage}
                    content={version.content}
                    codeAriaLabel={`Код ответа, версия ${version.version}`}
                  />
                  {version.mentorComment ? (
                    <div className="mt-4 rounded-xl bg-amber-50 p-4">
                      <p className="text-xs font-bold uppercase tracking-wide text-amber-800">
                        Комментарий наставника
                      </p>
                      <p className="mt-2 whitespace-pre-wrap text-amber-900">
                        {version.mentorComment}
                      </p>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
