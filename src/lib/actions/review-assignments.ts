"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { Prisma } from "@/generated/prisma";
import { recordAdminAudit } from "@/lib/admin-audit";
import { prisma } from "@/lib/db";
import {
  parseReviewAssignmentInput,
  parseReviewDecision,
  parseReviewResponse,
} from "@/lib/review-assignment-input";
import {
  canSubmitReviewAssignment,
  type ReviewAccessSnapshot,
} from "@/lib/review-access";
import { IdSchema, parse, requireAdmin, requireUser } from "@/lib/server-guard";

const GroupIdListSchema = z.array(IdSchema).max(200);
const UserIdSchema = z.string().uuid();
const UserIdListSchema = z.array(UserIdSchema).max(500);
const AssignmentStatusSchema = z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]);

export type ReviewAssignmentFormState = { error: string } | null;
export type ReviewSubmissionFormState = { error: string } | null;
export type ReviewDecisionFormState = { error: string } | null;

function refreshReviewPages(assignmentId?: number): void {
  revalidatePath("/works");
  revalidatePath("/admin/review-assignments");
  revalidatePath("/", "layout");
  if (assignmentId !== undefined) {
    revalidatePath(`/works/${assignmentId}`);
    revalidatePath(`/admin/review-assignments/${assignmentId}`);
  }
}

export async function saveReviewAssignment(
  _previous: ReviewAssignmentFormState,
  formData: FormData,
): Promise<ReviewAssignmentFormState> {
  const actorId = await requireAdmin();

  const parsedInput = parseReviewAssignmentInput({
    title: formData.get("title"),
    instructions: formData.get("instructions"),
    responseType: formData.get("responseType"),
    codeLanguage: formData.get("codeLanguage"),
  });
  if (!parsedInput.ok) {
    return { error: parsedInput.error };
  }

  const rawId = String(formData.get("id") ?? "").trim();
  const id = rawId === "" ? null : parse(IdSchema, Number(rawId));
  const groupIds = [
    ...new Set(
      parse(
        GroupIdListSchema,
        formData.getAll("groupId").map((value) => Number(value)),
      ),
    ),
  ];
  const userIds = [
    ...new Set(
      parse(
        UserIdListSchema,
        formData.getAll("userId").map((value) => String(value)),
      ),
    ),
  ];

  const [validGroups, validStudents, existing] = await Promise.all([
    prisma.group.findMany({
      where: { id: { in: groupIds } },
      select: { id: true },
    }),
    prisma.user.findMany({
      where: { id: { in: userIds }, isAdmin: false },
      select: { id: true },
    }),
    id === null
      ? Promise.resolve(null)
      : prisma.reviewAssignment.findUnique({
          where: { id },
          select: {
            responseType: true,
            codeLanguage: true,
            _count: { select: { submissions: true } },
          },
        }),
  ]);

  if (validGroups.length !== groupIds.length) {
    return { error: "Одна из выбранных групп больше не существует." };
  }
  if (validStudents.length !== userIds.length) {
    return {
      error: "Один из выбранных учеников не существует или является наставником.",
    };
  }
  if (id !== null && existing === null) {
    return { error: "Работа не найдена." };
  }
  if (
    existing &&
    existing._count.submissions > 0 &&
    (existing.responseType !== parsedInput.data.responseType ||
      existing.codeLanguage !== parsedInput.data.codeLanguage)
  ) {
    return {
      error:
        "После первого ответа нельзя менять формат или язык. Создайте новую работу.",
    };
  }

  const assignmentId = await prisma.$transaction(async (tx) => {
    const assignment =
      id === null
        ? await tx.reviewAssignment.create({
            data: parsedInput.data,
            select: { id: true },
          })
        : await tx.reviewAssignment.update({
            where: { id },
            data: parsedInput.data,
            select: { id: true },
          });

    await Promise.all([
      tx.reviewAssignmentGroup.deleteMany({
        where: { assignmentId: assignment.id },
      }),
      tx.reviewAssignmentUser.deleteMany({
        where: { assignmentId: assignment.id },
      }),
    ]);

    if (groupIds.length > 0) {
      await tx.reviewAssignmentGroup.createMany({
        data: groupIds.map((groupId) => ({
          assignmentId: assignment.id,
          groupId,
        })),
      });
    }
    if (userIds.length > 0) {
      await tx.reviewAssignmentUser.createMany({
        data: userIds.map((userId) => ({
          assignmentId: assignment.id,
          userId,
        })),
      });
    }

    await recordAdminAudit(tx, {
      actorId,
      action: id === null ? "created" : "updated",
      entityType: "review_assignment",
      entityId: assignment.id,
      entityLabel: parsedInput.data.title,
    });

    return assignment.id;
  });

  refreshReviewPages(assignmentId);
  redirect(`/admin/review-assignments/${assignmentId}`);
}

export async function setReviewAssignmentStatus(
  formData: FormData,
): Promise<void> {
  const actorId = await requireAdmin();
  const id = parse(z.coerce.number().pipe(IdSchema), formData.get("id"));
  const status = parse(AssignmentStatusSchema, formData.get("status"));

  const assignment = await prisma.reviewAssignment.findUnique({
    where: { id },
    select: {
      title: true,
      status: true,
      publishedAt: true,
      _count: {
        select: { groupTargets: true, userTargets: true, submissions: true },
      },
    },
  });
  if (!assignment) {
    throw new Error("NOT_FOUND");
  }

  if (
    status === "PUBLISHED" &&
    assignment._count.groupTargets + assignment._count.userTargets === 0
  ) {
    throw new Error("Нельзя опубликовать работу без группы или ученика.");
  }
  if (status === "DRAFT" && assignment._count.submissions > 0) {
    throw new Error("Работу с ответами можно только архивировать.");
  }
  if (status === "ARCHIVED" && assignment.status === "DRAFT") {
    throw new Error("Черновик не нужно архивировать.");
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.reviewAssignment.update({
      where: { id },
      data: {
        status,
        publishedAt:
          status === "PUBLISHED" ? (assignment.publishedAt ?? now) : undefined,
        archivedAt: status === "ARCHIVED" ? now : null,
      },
    });
    await recordAdminAudit(tx, {
      actorId,
      action:
        status === "PUBLISHED"
          ? "published"
          : status === "ARCHIVED"
            ? "archived"
            : "unpublished",
      entityType: "review_assignment",
      entityId: id,
      entityLabel: assignment.title,
    });
  });

  refreshReviewPages(id);
}

export async function deleteReviewAssignment(
  formData: FormData,
): Promise<void> {
  const actorId = await requireAdmin();
  const id = parse(z.coerce.number().pipe(IdSchema), formData.get("id"));

  const assignment = await prisma.reviewAssignment.findUnique({
    where: { id },
    select: {
      title: true,
      status: true,
      _count: { select: { submissions: true } },
    },
  });
  if (!assignment) {
    return;
  }
  if (assignment.status !== "DRAFT" || assignment._count.submissions > 0) {
    throw new Error("Удалять можно только черновик без ответов.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.reviewAssignment.delete({ where: { id } });
    await recordAdminAudit(tx, {
      actorId,
      action: "deleted",
      entityType: "review_assignment",
      entityId: id,
      entityLabel: assignment.title,
    });
  });
  refreshReviewPages(id);
  redirect("/admin/review-assignments");
}

export async function submitReviewAssignment(
  _previous: ReviewSubmissionFormState,
  formData: FormData,
): Promise<ReviewSubmissionFormState> {
  const userId = await requireUser();
  const assignmentId = parse(
    z.coerce.number().pipe(IdSchema),
    formData.get("assignmentId"),
  );

  const [student, assignment, existingSubmission] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { groupId: true, isAdmin: true },
    }),
    prisma.reviewAssignment.findUnique({
      where: { id: assignmentId },
      select: {
        status: true,
        responseType: true,
        groupTargets: { select: { groupId: true } },
        userTargets: { select: { userId: true } },
      },
    }),
    prisma.reviewSubmission.findUnique({
      where: { assignmentId_userId: { assignmentId, userId } },
      select: { id: true, status: true, currentVersion: true },
    }),
  ]);

  if (!student || student.isAdmin || !assignment) {
    return { error: "Работа недоступна." };
  }

  const access: ReviewAccessSnapshot = {
    assignmentStatus: assignment.status,
    studentId: userId,
    studentGroupId: student.groupId,
    targetUserIds: assignment.userTargets.map((target) => target.userId),
    targetGroupIds: assignment.groupTargets.map((target) => target.groupId),
    submissionStatus: existingSubmission?.status ?? null,
  };
  if (!canSubmitReviewAssignment(access)) {
    return {
      error:
        existingSubmission?.status === "SUBMITTED"
          ? "Ответ уже находится на проверке."
          : "Сейчас эту работу нельзя отправить.",
    };
  }

  const parsedContent = parseReviewResponse(
    assignment.responseType,
    formData.get("content"),
  );
  if (!parsedContent.ok) {
    return { error: parsedContent.error };
  }

  const now = new Date();
  try {
    await prisma.$transaction(async (tx) => {
      if (!existingSubmission) {
        await tx.reviewSubmission.create({
          data: {
            assignmentId,
            userId,
            status: "SUBMITTED",
            currentVersion: 1,
            submittedAt: now,
            versions: {
              create: {
                version: 1,
                content: parsedContent.data,
                status: "SUBMITTED",
                submittedAt: now,
              },
            },
          },
        });
        return;
      }

      const nextVersion = existingSubmission.currentVersion + 1;
      const changed = await tx.reviewSubmission.updateMany({
        where: {
          id: existingSubmission.id,
          currentVersion: existingSubmission.currentVersion,
          status: "REVISION_REQUESTED",
        },
        data: {
          status: "SUBMITTED",
          currentVersion: nextVersion,
          submittedAt: now,
          reviewedAt: null,
        },
      });
      if (changed.count !== 1) {
        throw new Error("STALE_SUBMISSION");
      }
      await tx.reviewSubmissionVersion.create({
        data: {
          submissionId: existingSubmission.id,
          version: nextVersion,
          content: parsedContent.data,
          status: "SUBMITTED",
          submittedAt: now,
        },
      });
    });
  } catch (error) {
    if (
      (error instanceof Error && error.message === "STALE_SUBMISSION") ||
      (error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002")
    ) {
      return {
        error:
          "Ответ уже изменился в другой вкладке. Обновите страницу и проверьте статус.",
      };
    }
    throw error;
  }

  refreshReviewPages(assignmentId);
  redirect(`/works/${assignmentId}?sent=1`);
}

export async function reviewSubmission(
  _previous: ReviewDecisionFormState,
  formData: FormData,
): Promise<ReviewDecisionFormState> {
  const actorId = await requireAdmin();
  const assignmentId = parse(
    z.coerce.number().pipe(IdSchema),
    formData.get("assignmentId"),
  );
  const submissionId = parse(
    z.coerce.number().pipe(IdSchema),
    formData.get("submissionId"),
  );
  const parsedDecision = parseReviewDecision({
    decision: formData.get("decision"),
    mentorComment: formData.get("mentorComment"),
  });
  if (!parsedDecision.ok) {
    return { error: parsedDecision.error };
  }

  const submission = await prisma.reviewSubmission.findFirst({
    where: { id: submissionId, assignmentId },
    select: {
      id: true,
      status: true,
      currentVersion: true,
      assignment: { select: { title: true } },
      user: { select: { name: true } },
    },
  });
  if (!submission) {
    return { error: "Ответ не найден." };
  }
  if (submission.status !== "SUBMITTED") {
    return { error: "Эта версия уже проверена или была заменена." };
  }

  const now = new Date();
  try {
    await prisma.$transaction(async (tx) => {
      const changed = await tx.reviewSubmission.updateMany({
        where: {
          id: submission.id,
          status: "SUBMITTED",
          currentVersion: submission.currentVersion,
        },
        data: {
          status: parsedDecision.data.decision,
          reviewedAt: now,
        },
      });
      if (changed.count !== 1) {
        throw new Error("STALE_REVIEW");
      }
      await tx.reviewSubmissionVersion.update({
        where: {
          submissionId_version: {
            submissionId: submission.id,
            version: submission.currentVersion,
          },
        },
        data: {
          status: parsedDecision.data.decision,
          mentorComment: parsedDecision.data.mentorComment,
          reviewedAt: now,
        },
      });
      await recordAdminAudit(tx, {
        actorId,
        action:
          parsedDecision.data.decision === "ACCEPTED" ? "accepted" : "returned",
        entityType: "review_submission",
        entityId: submission.id,
        entityLabel: `${submission.assignment.title} · ${submission.user.name}`,
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "STALE_REVIEW") {
      return {
        error:
          "Ответ уже проверен или ученик отправил новую версию. Обновите страницу.",
      };
    }
    throw error;
  }

  refreshReviewPages(assignmentId);
  redirect(`/admin/review-assignments/${assignmentId}`);
}
