"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  saveCategoryGroups,
  saveLessonGroups,
  type AccessFormState,
} from "@/lib/actions/program";

type GroupOption = { id: number; name: string };

function Message({ state }: { state: AccessFormState }) {
  if (!state) return null;
  return (
    <p
      role="status"
      className={
        state.error
          ? "rounded-xl bg-rose-50 p-3 text-sm font-medium text-rose-600"
          : "rounded-xl bg-green-50 p-3 text-sm font-medium text-green-700"
      }
    >
      {state.error ?? state.success}
    </p>
  );
}

export function CategoryGroupAccessForm({
  categoryId,
  groups,
  selectedIds,
}: {
  categoryId: number;
  groups: GroupOption[];
  selectedIds: number[];
}) {
  const [state, action, pending] = useActionState(saveCategoryGroups, null);
  return (
    <form action={action} className="space-y-3 rounded-2xl border-2 border-neutral-200 p-4">
      <input type="hidden" name="categoryId" value={categoryId} />
      <div>
        <h2 className="font-bold text-neutral-700">Группы курса</h2>
        <p className="text-sm text-neutral-500">
          Курс увидят только отмеченные группы после публикации.
        </p>
      </div>
      {groups.length === 0 ? (
        <p className="text-sm text-amber-600">
          Сначала создайте группу этого направления.
        </p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {groups.map((group) => (
            <label key={group.id} className="flex items-center gap-2 rounded-xl bg-neutral-50 p-3">
              <input
                type="checkbox"
                name="groupId"
                value={group.id}
                defaultChecked={selectedIds.includes(group.id)}
                className="h-5 w-5 accent-green-600"
              />
              <span className="font-medium text-neutral-700">{group.name}</span>
            </label>
          ))}
        </div>
      )}
      <Message state={state} />
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Сохраняю…" : "Сохранить группы"}
      </Button>
    </form>
  );
}

export function LessonGroupAccessForm({
  lessonId,
  groups,
  selectedIds,
}: {
  lessonId: number;
  groups: GroupOption[];
  selectedIds: number[];
}) {
  const initialRestricted = selectedIds.length > 0;
  const [restricted, setRestricted] = useState(initialRestricted);
  const [state, action, pending] = useActionState(saveLessonGroups, null);
  return (
    <form action={action} className="space-y-3 rounded-2xl border-2 border-neutral-200 p-4">
      <input type="hidden" name="lessonId" value={lessonId} />
      <input type="hidden" name="restricted" value={String(restricted)} />
      <div>
        <h2 className="font-bold text-neutral-700">Аудитория урока</h2>
        <p className="text-sm text-neutral-500">
          По умолчанию урок наследует все группы курса.
        </p>
      </div>
      <label className="flex items-center gap-2">
        <input
          type="radio"
          name="audience"
          checked={!restricted}
          onChange={() => setRestricted(false)}
        />
        <span>Все группы курса</span>
      </label>
      <label className="flex items-center gap-2">
        <input
          type="radio"
          name="audience"
          checked={restricted}
          onChange={() => setRestricted(true)}
        />
        <span>Только выбранные группы</span>
      </label>
      {restricted && (
        <div className="grid gap-2 sm:grid-cols-2">
          {groups.map((group) => (
            <label key={group.id} className="flex items-center gap-2 rounded-xl bg-neutral-50 p-3">
              <input
                type="checkbox"
                name="groupId"
                value={group.id}
                defaultChecked={selectedIds.includes(group.id)}
                className="h-5 w-5 accent-green-600"
              />
              <span className="font-medium text-neutral-700">{group.name}</span>
            </label>
          ))}
        </div>
      )}
      <Message state={state} />
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Сохраняю…" : "Сохранить аудиторию"}
      </Button>
    </form>
  );
}
