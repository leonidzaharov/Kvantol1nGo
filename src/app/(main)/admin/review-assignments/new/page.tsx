import { prisma } from "@/lib/db";
import { requireAdminOr404 } from "@/lib/server-guard";

import { AssignmentForm } from "../assignment-form";

export default async function NewReviewAssignmentPage() {
  await requireAdminOr404();

  const [groups, students] = await Promise.all([
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

  return (
    <div className="px-3 pb-10">
      <div className="mx-auto w-full max-w-[760px]">
        <h1 className="my-4 text-2xl font-bold text-neutral-700">
          Новая работа
        </h1>
        <p className="mb-6 text-neutral-500">
          Сначала сохраните черновик. Публикация выполняется отдельной кнопкой.
        </p>
        <AssignmentForm
          groups={groups}
          students={students.map((student) => ({
            id: student.id,
            name: student.name,
            groupId: student.groupId,
            groupName: student.group?.name ?? null,
          }))}
        />
      </div>
    </div>
  );
}
