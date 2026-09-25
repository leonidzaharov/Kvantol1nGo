import type { AdminAuditAction, AdminAuditEntity } from "@/generated/prisma";
import { ClipboardList } from "lucide-react";

import { ADMIN_AUDIT_RETENTION_DAYS } from "@/lib/admin-audit";
import { prisma } from "@/lib/db";
import { requireAdminOr404 } from "@/lib/server-guard";

import { AdminNav } from "../admin-nav";

const ACTION_LABELS: Record<AdminAuditAction, string> = {
  created: "Создано",
  updated: "Изменено",
  deleted: "Удалено",
  published: "Опубликовано",
  unpublished: "Снято с публикации",
  archived: "Перенесено в архив",
  audience_updated: "Изменена аудитория",
  pin_reset: "Сброшен PIN",
  awarded: "Выдано вручную",
  accepted: "Работа принята",
  returned: "Работа возвращена",
  session_started: "Занятие начато",
  session_ended: "Занятие завершено",
};

const ENTITY_LABELS: Record<AdminAuditEntity, string> = {
  student: "Ученик",
  group: "Группа",
  course: "Курс",
  lesson: "Урок",
  resource: "Интересное",
  review_assignment: "Ручная работа",
  review_submission: "Ответ ученика",
  achievement: "Достижение",
  class_session: "Очное занятие",
};

const DATE_FORMATTER = new Intl.DateTimeFormat("ru-RU", {
  timeZone: "Europe/Moscow",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function AdminAuditPage() {
  await requireAdminOr404();

  const entries = await prisma.adminAuditLog.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 100,
    include: { actor: { select: { name: true } } },
  });

  return (
    <div className="px-3">
      <div className="mx-auto flex w-full max-w-[900px] flex-col">
        <div className="flex flex-col items-center">
          <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-neutral-600 text-white">
            <ClipboardList className="h-10 w-10" />
          </div>
          <h1 className="my-2 text-center text-2xl font-bold text-neutral-700">
            Админка · Журнал действий
          </h1>
          <p className="mb-6 max-w-[680px] text-center text-neutral-500">
            Последние важные изменения наставника. PIN, ответы, код и содержимое
            работ сюда не записываются. Записи хранятся {ADMIN_AUDIT_RETENTION_DAYS} дней.
          </p>
          <AdminNav active="audit" />
        </div>

        {entries.length === 0 ? (
          <p className="mt-8 rounded-2xl border-2 border-dashed border-neutral-200 px-6 py-10 text-center font-medium text-neutral-400">
            Журнал пока пуст. Первая запись появится после важного действия в админке.
          </p>
        ) : (
          <ol className="mb-10 mt-8 flex flex-col gap-2">
            {entries.map((entry) => (
              <li
                key={entry.id}
                className="grid gap-2 rounded-2xl border-2 border-neutral-200 p-4 sm:grid-cols-[150px_1fr_auto] sm:items-center"
              >
                <time className="text-sm font-bold text-neutral-400">
                  {DATE_FORMATTER.format(entry.createdAt)}
                </time>
                <div className="min-w-0">
                  <p className="font-bold text-neutral-700">
                    {ACTION_LABELS[entry.action]} · {ENTITY_LABELS[entry.entityType]}
                  </p>
                  <p className="truncate text-sm font-medium text-neutral-500">
                    {entry.entityLabel ?? "Без названия"}
                    {entry.entityId ? ` · ID ${entry.entityId}` : ""}
                  </p>
                </div>
                <span className="text-sm font-bold text-neutral-400">
                  {entry.actor?.name ?? "Удалённый наставник"}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
