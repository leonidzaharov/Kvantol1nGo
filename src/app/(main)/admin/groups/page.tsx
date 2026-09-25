import { randomUUID } from "node:crypto";
import { Users } from "lucide-react";

import { prisma } from "@/lib/db";
import { TRACK_LABELS, TRACK_ORDER } from "@/lib/groups";
import { requireAdminOr404 } from "@/lib/server-guard";

import { AdminNav } from "../admin-nav";
import { GroupCreateForm } from "./create-form";
import { StudentRow } from "./student-row";
import { StudentCreateForm } from "./student-create-form";
import { DeleteGroupButton } from "./delete-group-button";

// Админка групп: создание/удаление групп и распределение учеников.
// Доступ только наставнику (isAdmin) — остальным 404.
export default async function AdminGroupsPage() {
  await requireAdminOr404();

  const [groups, students] = await Promise.all([
    prisma.group.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { students: true } } },
    }),
    prisma.user.findMany({
      where: { isAdmin: false },
      orderBy: [{ mentorLabel: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true, currency: true, pixelsRedeemed: true,
        mentorLabel: true,
        profileConfiguredAt: true,
        groupId: true,
        pixelRedemptions: { orderBy: { createdAt: "desc" }, take: 3, select: { id: true, pixels: true, coins: true, createdAt: true } },
      },
    }),
  ]);

  const groupOptions = groups.map(({ id, name, track }) => ({
    id,
    name,
    track,
  }));

  return (
    <div className="px-3">
      <div className="mx-auto flex w-full max-w-[900px] flex-col">
        <div className="flex flex-col items-center">
          <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-neutral-600 text-white">
            <Users className="h-10 w-10" />
          </div>
          <h1 className="my-2 text-center text-2xl font-bold text-neutral-700">
            Админка · Группы
          </h1>
          <p className="mb-6 text-center text-neutral-500">
            Группы по направлениям и распределение учеников — это шаги выбора
            на экране входа.
          </p>
          <AdminNav active="groups" />
        </div>

        <h2 className="mb-3 mt-8 text-lg font-bold text-neutral-700">
          Новая группа
        </h2>
        <GroupCreateForm />

        <h2 className="mb-3 mt-8 text-lg font-bold text-neutral-700">
          Группы
        </h2>
        {groups.length === 0 ? (
          <p className="rounded-2xl border-2 border-dashed border-neutral-200 px-6 py-10 text-center text-neutral-400">
            Групп пока нет — создай первую, например «it-01».
          </p>
        ) : (
          <div className="flex flex-col gap-y-6">
            {TRACK_ORDER.filter((t) =>
              groups.some((g) => g.track === t),
            ).map((t) => (
              <div key={t}>
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-neutral-400">
                  {TRACK_LABELS[t]}
                </h3>
                <ul className="flex flex-col gap-y-2">
                  {groups
                    .filter((g) => g.track === t)
                    .map((g) => (
                      <li
                        key={g.id}
                        className="flex items-center gap-x-4 rounded-2xl border-2 border-neutral-200 p-3"
                      >
                        <span className="flex-1 font-bold uppercase text-neutral-700">
                          {g.name}
                        </span>
                        <span className="text-sm font-bold text-neutral-400">
                          {g._count.students} уч.
                        </span>
                        <DeleteGroupButton
                          id={g.id}
                          name={g.name}
                          studentCount={g._count.students}
                        />
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        <h2 className="mb-3 mt-8 text-lg font-bold text-neutral-700">
          Ученики
        </h2>
        <StudentCreateForm groups={groupOptions} />
        {students.length === 0 ? (
          <p className="rounded-2xl border-2 border-dashed border-neutral-200 px-6 py-10 text-center text-neutral-400">
            Учеников пока нет.
          </p>
        ) : (
          <ul className="mb-10 flex flex-col gap-y-2">
            {students.map((s) => (
              <StudentRow key={s.id} student={s} groups={groupOptions} requestId={randomUUID()} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
