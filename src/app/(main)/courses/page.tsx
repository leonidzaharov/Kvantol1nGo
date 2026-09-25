import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { ACTIVE_COURSE_COOKIE } from "@/lib/active-course";
import { getLearningContext } from "@/lib/course-access";
import { prisma } from "@/lib/db";
import { TRACK_LABELS } from "@/lib/groups";

import { List } from "./list";

export default async function CoursesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  const context = await getLearningContext(session.user.id);
  if (!context) redirect("/api/orphan-signout");

  const studentWhere = context.groupId
    ? {
        isPublished: true,
        groupAccess: { some: { groupId: context.groupId } },
      }
    : { id: -1 };

  const [categories, cookieStore] = await Promise.all([
    prisma.category.findMany({
      where: context.isAdmin ? undefined : studentWhere,
      orderBy: { id: "asc" },
      select: { id: true, name: true, icon: true },
    }),
    cookies(),
  ]);
  const activeRaw = cookieStore.get(ACTIVE_COURSE_COOKIE)?.value;
  const activeCourseId = activeRaw ? Number(activeRaw) : undefined;

  return (
    <div className="mx-auto h-full max-w-[912px] px-3">
      <h1 className="text-2xl font-bold text-neutral-700">Выбор курса</h1>
      {!context.isAdmin && !context.groupId && (
        <p className="mt-4 rounded-2xl bg-amber-50 p-5 font-medium text-amber-800">
          Наставник ещё не назначил тебе учебную группу.
        </p>
      )}
      {context.track && (
        <p className="mt-1 text-neutral-500">
          Направление твоей группы — {TRACK_LABELS[context.track].toLowerCase()}.
        </p>
      )}
      {!context.isAdmin && context.groupId && categories.length === 0 && (
        <p className="mt-4 rounded-2xl bg-sky-50 p-5 font-medium text-sky-700">
          Наставник пока не открыл ни одного курса для твоей группы.
        </p>
      )}
      <List courses={categories} activeCourseId={activeCourseId} />
    </div>
  );
}
