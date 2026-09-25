"use client";

import { useActionState } from "react";

import { createGroup, type GroupFormState } from "@/lib/actions/groups";
import { TRACK_LABELS, TRACK_ORDER } from "@/lib/groups";
import { Button } from "@/components/ui/button";

// Форма «создать группу»: имя + направление. Ошибки (пустое имя, дубль)
// показываем под формой через useActionState.
export function GroupCreateForm() {
  const [state, formAction, pending] = useActionState<GroupFormState, FormData>(
    createGroup,
    null,
  );

  return (
    <form
      action={formAction}
      className="flex flex-wrap items-end gap-3 rounded-2xl border-2 border-neutral-200 p-4"
    >
      <div className="flex min-w-[160px] flex-1 flex-col gap-y-1">
        <label
          htmlFor="group-name"
          className="text-xs font-bold uppercase tracking-wide text-neutral-400"
        >
          Название
        </label>
        <input
          id="group-name"
          name="name"
          type="text"
          maxLength={32}
          placeholder="it-01"
          className="rounded-xl border-2 bg-neutral-50 px-3 py-2 font-bold outline-none focus:border-green-400"
          required
        />
      </div>

      <div className="flex flex-col gap-y-1">
        <label
          htmlFor="group-track"
          className="text-xs font-bold uppercase tracking-wide text-neutral-400"
        >
          Направление
        </label>
        <select
          id="group-track"
          name="track"
          className="rounded-xl border-2 bg-neutral-50 px-3 py-2 font-bold outline-none focus:border-green-400"
          defaultValue="intro"
        >
          {TRACK_ORDER.map((t) => (
            <option key={t} value={t}>
              {TRACK_LABELS[t]}
            </option>
          ))}
        </select>
      </div>

      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Создаём…" : "Создать группу"}
      </Button>

      {state?.error && (
        <p className="w-full text-sm font-bold text-rose-500">{state.error}</p>
      )}
    </form>
  );
}
