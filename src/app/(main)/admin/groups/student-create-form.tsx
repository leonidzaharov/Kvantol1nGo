"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import {
  createStudent,
  type StudentFormState,
} from "@/lib/actions/student-profile";

type GroupOption = { id: number; name: string };

export function StudentCreateForm({ groups }: { groups: GroupOption[] }) {
  const [state, action, pending] = useActionState<StudentFormState, FormData>(
    createStudent,
    null,
  );

  return (
    <form action={action} className="grid gap-3 rounded-2xl border-2 border-neutral-200 p-4 sm:grid-cols-2">
      <label className="flex flex-col gap-1 text-xs font-bold uppercase tracking-wide text-neutral-500">
        Пометка без ФИО
        <input
          name="mentorLabel"
          maxLength={40}
          placeholder="Например: Синий кот · место 4"
          required
          className="rounded-xl border-2 bg-neutral-50 px-3 py-2 text-base normal-case tracking-normal text-neutral-700 outline-none focus:border-green-400"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-bold uppercase tracking-wide text-neutral-500">
        Временный ник
        <input
          name="nickname"
          maxLength={24}
          placeholder="Синий кот"
          required
          className="rounded-xl border-2 bg-neutral-50 px-3 py-2 text-base normal-case tracking-normal text-neutral-700 outline-none focus:border-green-400"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-bold uppercase tracking-wide text-neutral-500">
        PIN
        <input
          name="pin"
          type="password"
          inputMode="numeric"
          pattern="[0-9]{4}"
          maxLength={4}
          autoComplete="new-password"
          placeholder="4 цифры"
          required
          className="rounded-xl border-2 bg-neutral-50 px-3 py-2 text-base normal-case tracking-normal text-neutral-700 outline-none focus:border-green-400"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-bold uppercase tracking-wide text-neutral-500">
        Группа
        <select
          name="groupId"
          defaultValue=""
          className="rounded-xl border-2 bg-neutral-50 px-3 py-2 text-base normal-case tracking-normal text-neutral-700 outline-none focus:border-green-400"
        >
          <option value="">Без группы</option>
          {groups.map((group) => (
            <option key={group.id} value={group.id}>{group.name}</option>
          ))}
        </select>
      </label>

      <div className="sm:col-span-2">
        <p className="mb-3 text-sm text-neutral-500">
          Не указывайте имя и фамилию. Ученик найдёт временный ник на экране входа, а после ввода PIN выберет собственный.
        </p>
        {state?.error ? <p role="alert" className="mb-3 text-sm font-bold text-rose-500">{state.error}</p> : null}
        {state?.success ? <p role="status" className="mb-3 text-sm font-bold text-green-600">{state.success}</p> : null}
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Создаём…" : "Создать ученика"}
        </Button>
      </div>
    </form>
  );
}
