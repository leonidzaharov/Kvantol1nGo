import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { ResponseView } from "@/components/review/response-view";
import { SubmissionStatusBadge } from "@/components/review/submission-status-badge";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/db";
import { REVIEW_SUBMISSION_STATUS_LABELS } from "@/lib/review-labels";
import { IdSchema, requireAdminOr404 } from "@/lib/server-guard";

import { ReviewDecisionForm } from "../../../review-decision-form";

type PageProps = {
  params: Promise<{ id: string; submissionId: string }>;
};

const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Moscow",
});

export default async function ReviewSubmissionPage({ params }: PageProps) {
  await requireAdminOr404();
  const values = await params;
  const assignmentId = IdSchema.safeParse(Number(values.id));
  const submissionId = IdSchema.safeParse(Number(values.submissionId));
  if (!assignmentId.success || !submissionId.success) {
    notFound();
  }

  const submission = await prisma.reviewSubmission.findFirst({
    where: {
      id: submissionId.data,
      assignmentId: assignmentId.data,
    },
    include: {
      assignment: true,
      user: {
        select: {
          name: true,
          group: { select: { name: true } },
        },
      },
      versions: { orderBy: { version: "desc" } },
    },
  });
  if (!submission) {
    notFound();
  }
  const currentVersion = submission.versions.find(
    (version) => version.version === submission.currentVersion,
  );
  if (!currentVersion) {
    throw new Error("У ответа отсутствует текущая версия.");
  }

  return (
    <div className="px-3 pb-12">
      <div className="mx-auto w-full max-w-[1180px]">
        <Button variant="ghost" size="sm" asChild>
          <Link
            href={`/admin/review-assignments/${submission.assignmentId}`}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            К списку учеников
          </Link>
        </Button>

        <div className="mt-4">
          <p className="text-sm font-bold text-violet-700">
            {submission.assignment.title}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold text-neutral-800">
              {submission.user.name}
            </h1>
            <SubmissionStatusBadge status={submission.status} />
          </div>
          <p className="text-sm text-neutral-400">
            {submission.user.group?.name ?? "Без группы"} · версия{" "}
            {currentVersion.version} ·{" "}
            {dateFormatter.format(currentVersion.submittedAt)}
          </p>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
          <section className="min-w-0 rounded-2xl border-2 border-neutral-200 p-5">
            <h2 className="mb-4 text-lg font-bold text-neutral-800">
              Ответ ученика
            </h2>
            <ResponseView
              responseType={submission.assignment.responseType}
              codeLanguage={submission.assignment.codeLanguage}
              content={currentVersion.content}
              codeAriaLabel={`Код ученика, версия ${currentVersion.version}`}
            />
          </section>

          <aside className="self-start rounded-2xl border-2 border-neutral-200 p-5 lg:sticky lg:top-4">
            <h2 className="mb-4 text-lg font-bold text-neutral-800">
              Решение наставника
            </h2>
            {submission.status === "SUBMITTED" ? (
              <ReviewDecisionForm
                assignmentId={submission.assignmentId}
                submissionId={submission.id}
              />
            ) : (
              <div>
                <SubmissionStatusBadge status={submission.status} />
                <p className="mt-4 whitespace-pre-wrap rounded-xl bg-neutral-50 p-4 text-neutral-700">
                  {currentVersion.mentorComment ??
                    (submission.status === "ACCEPTED"
                      ? "Работа принята без дополнительного комментария."
                      : "Комментарий не указан.")}
                </p>
              </div>
            )}
          </aside>
        </div>

        {submission.versions.length > 1 ? (
          <section className="mt-8">
            <h2 className="text-xl font-bold text-neutral-800">
              Предыдущие версии
            </h2>
            <div className="mt-4 space-y-4">
              {submission.versions
                .filter(
                  (version) => version.version !== submission.currentVersion,
                )
                .map((version) => (
                  <details
                    key={version.version}
                    className="rounded-2xl border border-neutral-200 p-4"
                  >
                    <summary className="cursor-pointer font-bold text-neutral-700">
                      Версия {version.version} ·{" "}
                      {REVIEW_SUBMISSION_STATUS_LABELS[version.status]} ·{" "}
                      {dateFormatter.format(version.submittedAt)}
                    </summary>
                    <div className="mt-4">
                      <ResponseView
                        responseType={submission.assignment.responseType}
                        codeLanguage={submission.assignment.codeLanguage}
                        content={version.content}
                        codeAriaLabel={`Код ученика, версия ${version.version}`}
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
                    </div>
                  </details>
                ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
