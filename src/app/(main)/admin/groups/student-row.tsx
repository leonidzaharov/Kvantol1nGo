"use client";

import { PixelExchangeForm } from "@/components/pixel-exchange-form";
import { useActionState } from "react";

import type { GroupTrack } from "@/generated/prisma";
import { Button } from "@/components/ui/button";
import {
  deleteStudent,
  updateStudent,
  type StudentFormState,
} from "@/lib/actions/student-profile";
import { TRACK_LABELS } from "@/lib/groups";

export type GroupOption = {
  id: number;
  name: string;
  track: GroupTrack;
};

export type StudentRowProps = {
  student: {
    id: string; currency: number; pixelsRedeemed: number;
    pixelRedemptions: { id: string; pixels: number; coins: number; createdAt: Date }[];
    name: string;
    mentorLabel: string | null;
    profileConfiguredAt: Date | null;
    groupId: number | null;
  };
  groups: GroupOption[]; requestId: string;
};

export function StudentRow({ student, groups, requestId }: StudentRowProps) {
  const [state, action, pending] = useActionState<StudentFormState, FormData>(
    updateStudent,
    null,
  );

  return (
    <div className="rounded-2xl border border-neutral-200 p-4">
      <form action={action} className="grid gap-3 sm:grid-cols-2">
        <input type="hidden" name="userId" value={student.id} />
        <label className="flex min-w-0 flex-col gap-1 text-xs font-bold uppercase tracking-wide text-neutral-500">
          Пометка без ФИО
          <input
            name="mentorLabel"
            defaultValue={student.mentorLabel ?? student.name}
            maxLength={40}
            required
            className="w-full min-w-0 rounded-xl border-2 bg-neutral-50 px-3 py-2 text-base normal-case tracking-normal text-neutral-700 outline-none focus:border-green-400"
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-xs font-bold uppercase tracking-wide text-neutral-500">
          Публичный ник
          <input
            name="nickname"
            defaultValue={student.name}
            maxLength={24}
            required
            className="w-full min-w-0 rounded-xl border-2 bg-neutral-50 px-3 py-2 text-base normal-case tracking-normal text-neutral-700 outline-none focus:border-green-400"
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-xs font-bold uppercase tracking-wide text-neutral-500">
          Группа
          <select
            name="groupId"
            defaultValue={student.groupId ?? ""}
            className="w-full min-w-0 rounded-xl border-2 bg-neutral-50 px-3 py-2 text-base normal-case tracking-normal text-neutral-700 outline-none focus:border-green-400"
          >
            <option value="">Без группы</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name} · {TRACK_LABELS[group.track]}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end">
          <Button type="submit" variant="secondary" size="sm" disabled={pending}>
            {pending ? "Сохраняем…" : "Сохранить"}
          </Button>
        </div>

        <label className="flex min-w-0 flex-col gap-1 text-xs font-bold uppercase tracking-wide text-neutral-500">
          Новый PIN (необязательно)
          <input
            name="pin"
            type="password"
            inputMode="numeric"
            pattern="[0-9]{4}"
            maxLength={4}
            autoComplete="new-password"
            placeholder="Оставьте пустым, чтобы не менять"
            className="w-full min-w-0 rounded-xl border-2 bg-neutral-50 px-3 py-2 text-base normal-case tracking-normal text-neutral-700 outline-none focus:border-green-400"
          />
        </label>
        <div className="flex items-end text-xs font-bold text-neutral-400 sm:justify-end">
          {student.profileConfiguredAt ? "Профиль настроен" : "Ждёт первого входа"}
        </div>

        {state?.error ? <p role="alert" className="text-sm font-bold text-rose-500 sm:col-span-2">{state.error}</p> : null}
        {state?.success ? <p role="status" className="text-sm font-bold text-green-600 sm:col-span-2">{state.success}</p> : null}
      </form>
      <PixelExchangeForm userId={student.id} requestId={requestId} coins={student.currency} redeemed={student.pixelsRedeemed} />
      {student.pixelRedemptions.length > 0 && <details className="mt-2 text-xs text-neutral-500"><summary className="cursor-pointer">Последние выдачи</summary><ul className="mt-2 space-y-1">{student.pixelRedemptions.map((receipt) => <li key={receipt.id}>{new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Moscow" }).format(receipt.createdAt)} · {receipt.pixels} пикс. / {receipt.coins} монет</li>)}</ul></details>}
      <form
        action={deleteStudent}
        className="mt-4 border-t-2 border-neutral-100 pt-4"
        onSubmit={(event) => {
          if (
            !confirm(
              `Удалить ученика «${student.name}»? Профиль, прогресс, работы и награды будут удалены окончательно.`,
            )
          ) {
            event.preventDefault();
          }
        }}
      >
        <input type="hidden" name="userId" value={student.id} />
        <Button type="submit" variant="dangerOutline" size="sm">
          Удалить ученика
        </Button>
      </form>
    </div>
  );
}
