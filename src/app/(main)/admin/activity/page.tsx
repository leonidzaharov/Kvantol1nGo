import Link from "next/link";
import { Activity } from "lucide-react";

import { Button } from "@/components/ui/button";
import { endClassSession } from "@/lib/actions/classroom";
import { getClassroomDashboardSnapshot } from "@/lib/classroom-dashboard";
import { prisma } from "@/lib/db";
import { classroomActiveCutoff } from "@/lib/classroom-session-logic";
import { requireAdminOr404 } from "@/lib/server-guard";

import { AdminNav } from "../admin-nav";
import { LiveDashboard } from "./live-dashboard";
import {
  SessionLauncher,
  type LauncherGroup,
} from "./session-launcher";

type PageProps = {
  searchParams: Promise<{ sessionId?: string }>;
};

export default async function AdminActivityPage({
  searchParams,
}: PageProps) {
  await requireAdminOr404();
  const { sessionId: rawSessionId } = await searchParams;
  const now = new Date();
  await prisma.classSession.updateMany({
    where: {
      activatedAt: { not: null, lte: classroomActiveCutoff(now) },
      endedAt: null,
    },
    data: { endedAt: now },
  });

  const [groups, categories, activeSessions] = await Promise.all([
    prisma.group.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.category.findMany({
      where: { isPublished: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: {
        id: true,
        name: true,
        groupAccess: { select: { groupId: true } },
        lessons: {
          where: { isPublished: true },
          orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
          select: {
            id: true,
            title: true,
            groupRestrictions: { select: { groupId: true } },
          },
        },
      },
    }),
    prisma.classSession.findMany({
      where: {
        activatedAt: { not: null },
        endedAt: null,
      },
      orderBy: { activatedAt: "desc" },
      select: {
        id: true,
        group: { select: { name: true } },
        lesson: { select: { title: true } },
      },
    }),
  ]);

  const launcherGroups: LauncherGroup[] = groups.map((group) => ({
    ...group,
    courses: categories.flatMap((category) => {
      if (!category.groupAccess.some((item) => item.groupId === group.id)) {
        return [];
      }
      const lessons = category.lessons
        .filter(
          (lesson) =>
            lesson.groupRestrictions.length === 0 ||
            lesson.groupRestrictions.some((item) => item.groupId === group.id),
        )
        .map(({ id, title }) => ({ id, title }));
      return lessons.length > 0
        ? [{ id: category.id, name: category.name, lessons }]
        : [];
    }),
  }));

  const requestedId = Number.parseInt(rawSessionId ?? "", 10);
  const selectedSessionId =
    (Number.isInteger(requestedId) &&
    activeSessions.some((item) => item.id === requestedId)
      ? requestedId
      : activeSessions[0]?.id) ?? null;
  const snapshot =
    selectedSessionId === null
      ? null
      : await getClassroomDashboardSnapshot(selectedSessionId);

  return (
    <div className="px-3">
      <div className="mx-auto flex w-full max-w-[1100px] flex-col">
        <div className="flex flex-col items-center">
          <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-sky-500 text-white">
            <Activity className="h-10 w-10" />
          </div>
          <h1 className="my-2 text-center text-2xl font-bold text-neutral-700">
            Админка · Текущий урок
          </h1>
          <p className="mb-6 text-center text-neutral-500">
            Живой экран очного занятия: кто работает, застрял или уже закончил.
          </p>
          <AdminNav active="activity" />
        </div>

        <section className="mt-8 space-y-3">
          <h2 className="text-lg font-bold text-neutral-700">
            Начать новое занятие
          </h2>
          <SessionLauncher groups={launcherGroups} />
          <p className="text-sm text-neutral-500">
            Запуск нового занятия автоматически завершит прежнее занятие этой
            группы.
          </p>
        </section>

        {activeSessions.length > 0 && (
          <nav
            aria-label="Активные занятия"
            className="mt-6 flex flex-wrap gap-2"
          >
            {activeSessions.map((item) => (
              <Button
                key={item.id}
                variant={
                  item.id === selectedSessionId ? "secondary" : "ghost"
                }
                size="sm"
                asChild
              >
                <Link href={`/admin/activity?sessionId=${item.id}`}>
                  {item.group.name} · {item.lesson.title}
                </Link>
              </Button>
            ))}
          </nav>
        )}

        <section className="my-8">
          {snapshot ? (
            <div className="space-y-5">
              <LiveDashboard initialSnapshot={snapshot} />
              <form action={endClassSession} className="flex justify-end">
                <input
                  type="hidden"
                  name="sessionId"
                  value={snapshot.session.id}
                />
                <Button type="submit" variant="dangerOutline">
                  Завершить занятие
                </Button>
              </form>
            </div>
          ) : (
            <p className="rounded-2xl border-2 border-dashed border-neutral-200 px-6 py-12 text-center text-neutral-400">
              Активного занятия пока нет. Выберите группу и урок выше.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
