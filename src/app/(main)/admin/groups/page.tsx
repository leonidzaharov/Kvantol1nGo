import { randomUUID } from "node:crypto";
import Link from "next/link";
import { Users } from "lucide-react";

import { prisma } from "@/lib/db";
import { TRACK_LABELS, TRACK_ORDER } from "@/lib/groups";
import { requireAdminOr404 } from "@/lib/server-guard";

import { AdminNav } from "../admin-nav";
import { GroupCreateForm } from "./create-form";
import { DeleteGroupButton } from "./delete-group-button";
import { StudentCreateForm } from "./student-create-form";
import { StudentTable } from "./student-table";

type Tab = "groups" | "create" | "students";
type PageProps = { searchParams: Promise<{ tab?: string }> };

export default async function AdminGroupsPage({ searchParams }: PageProps) {
  await requireAdminOr404();
  const query = await searchParams;
  const tab: Tab = query.tab === "create" || query.tab === "students" ? query.tab : "groups";

  const [groups, studentCount, students] = await Promise.all([
    prisma.group.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { students: true } } },
    }),
    prisma.user.count({ where: { isAdmin: false } }),
    tab === "students" ? prisma.user.findMany({
      where: { isAdmin: false },
      orderBy: [{ mentorLabel: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        currency: true,
        pixelsRedeemed: true,
        mentorLabel: true,
        profileConfiguredAt: true,
        groupId: true,
        pixelRedemptions: {
          orderBy: { createdAt: "desc" },
          take: 3,
          select: { id: true, pixels: true, coins: true, createdAt: true },
        },
      },
    }) : Promise.resolve([]),
  ]);
  const groupOptions = groups.map(({ id, name, track }) => ({ id, name, track }));
  const tabs: { id: Tab; label: string; href: string }[] = [
    { id: "groups", label: "Группы", href: "/admin/groups" },
    { id: "create", label: "Создать ученика", href: "/admin/groups?tab=create" },
    { id: "students", label: `Ученики · ${studentCount}`, href: "/admin/groups?tab=students" },
  ];

  return (
    <div className="px-3">
      <div className="mx-auto flex w-full max-w-[1100px] flex-col">
        <div className="flex flex-col items-center">
          <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-neutral-600 text-white">
            <Users className="h-10 w-10" />
          </div>
          <h1 className="my-2 text-center text-2xl font-bold text-neutral-700">
            Админка · Группы и ученики
          </h1>
          <p className="mb-6 text-center text-neutral-500">
            Здесь создаются группы и профили для входа учеников.
          </p>
          <AdminNav active="groups" />
        </div>

        <nav aria-label="Управление группами и учениками" className="mt-8 flex flex-wrap gap-2 border-b border-neutral-200 pb-3">
          {tabs.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              aria-current={tab === item.id ? "page" : undefined}
              className={`rounded-xl px-4 py-2 text-sm font-bold transition-colors ${
                tab === item.id
                  ? "bg-green-600 text-white"
                  : "bg-neutral-100 text-neutral-700 hover:bg-green-50"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {tab === "groups" && (
          <section className="mb-10" aria-labelledby="groups-title">
            <h2 id="groups-title" className="mb-3 mt-6 text-lg font-bold text-neutral-700">Новая группа</h2>
            <GroupCreateForm />
            <h2 className="mb-3 mt-8 text-lg font-bold text-neutral-700">Группы</h2>
            {groups.length === 0 ? (
              <p className="rounded-2xl border-2 border-dashed border-neutral-200 px-6 py-10 text-center text-neutral-400">
                Групп пока нет — создайте первую, например «it-01».
              </p>
            ) : (
              <div className="flex flex-col gap-6">
                {TRACK_ORDER.filter((track) => groups.some((group) => group.track === track)).map((track) => (
                  <div key={track}>
                    <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-neutral-400">{TRACK_LABELS[track]}</h3>
                    <ul className="grid gap-3 sm:grid-cols-2">
                      {groups.filter((group) => group.track === track).map((group) => (
                        <li key={group.id} className="flex min-w-0 flex-col gap-4 rounded-2xl border-2 border-neutral-200 p-4">
                          <div className="min-w-0">
                            <p className="break-words text-base font-extrabold text-neutral-700">{group.name}</p>
                            <p className="mt-1 text-sm text-neutral-500">{group._count.students} учеников</p>
                          </div>
                          <div className="mt-auto"><DeleteGroupButton id={group.id} name={group.name} studentCount={group._count.students} /></div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {tab === "create" && (
          <section className="mb-10" aria-labelledby="create-student-title">
            <h2 id="create-student-title" className="mb-3 mt-6 text-lg font-bold text-neutral-700">Создать ученика</h2>
            <StudentCreateForm groups={groupOptions} />
          </section>
        )}

        {tab === "students" && (
          <section className="mb-10" aria-labelledby="students-title">
            <h2 id="students-title" className="mb-3 mt-6 text-lg font-bold text-neutral-700">Ученики</h2>
            {students.length === 0 ? (
              <p className="rounded-2xl border-2 border-dashed border-neutral-200 px-6 py-10 text-center text-neutral-400">Учеников пока нет.</p>
            ) : (
              <StudentTable
                students={students.map((student) => ({ ...student, requestId: randomUUID() }))}
                groups={groupOptions}
              />
            )}
          </section>
        )}
      </div>
    </div>
  );
}
