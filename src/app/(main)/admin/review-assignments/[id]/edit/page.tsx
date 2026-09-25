import { notFound } from "next/navigation";

import { prisma } from "@/lib/db";
import { IdSchema, requireAdminOr404 } from "@/lib/server-guard";

import { AssignmentForm } from "../../assignment-form";

type PageProps = { params: Promise<{ id: string }> };

export default async function EditReviewAssignmentPage({
  params,
}: PageProps) {
  await requireAdminOr404();
  const { id: rawId } = await params;
  const parsedId = IdSchema.safeParse(Number(rawId));
  if (!parsedId.success) {
    notFound();
  }

  const [assignment, groups, students] = await Promise.all([
    prisma.reviewAssignment.findUnique({
      where: { id: parsedId.data },
      include: {
        groupTargets: { select: { groupId: true } },
        userTargets: { select: { userId: true } },
        _count: { select: { submissions: true } },
      },
    }),
    prisma.group.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.user.findMany({
      where: { isAdmin: false },
      orderBy: [{ group: { name: "asc" } }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        groupId: true,
        group: { select: { name: true } },
      },
    }),
  ]);
  if (!assignment) {
    notFound();
  }

  return (
    <div className="px-3 pb-10">
      <div className="mx-auto w-full max-w-[760px]">
        <h1 className="my-4 text-2xl font-bold text-neutral-700">
          Изменить работу
        </h1>
        <AssignmentForm
          assignment={{
            id: assignment.id,
            title: assignment.title,
            instructions: assignment.instructions,
            responseType: assignment.responseType,
            codeLanguage: assignment.codeLanguage,
            status: assignment.status,
          }}
          groups={groups}
          students={students.map((student) => ({
            id: student.id,
            name: student.name,
            groupId: student.groupId,
            groupName: student.group?.name ?? null,
          }))}
          selectedGroupIds={assignment.groupTargets.map(
            (target) => target.groupId,
          )}
          selectedUserIds={assignment.userTargets.map(
            (target) => target.userId,
          )}
          hasSubmissions={assignment._count.submissions > 0}
        />
      </div>
    </div>
  );
}
