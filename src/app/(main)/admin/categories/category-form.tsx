"use client";

import { useActionState } from "react";
import Link from "next/link";

import { saveCategory, type CategoryFormState } from "@/lib/actions/categories";
import { TRACK_LABELS, TRACK_ORDER } from "@/lib/groups";
import type { GroupTrack } from "@/generated/prisma";
import { Button } from "@/components/ui/button";

const inputClass =
  "w-full rounded-xl border-2 border-neutral-200 p-3 font-medium text-neutral-700 focus:border-sky-300 focus:outline-none";

type CategoryFormProps = {
  /** Курс для правки; не передан — форма создания. */
  category?: {
    id: number;
    name: string;
    icon: string | null;
    track: GroupTrack;
  };
};

// Одна форма на создание и правку (паттерн уроков): пустой id → create.
export const CategoryForm = ({ category }: CategoryFormProps) => {
  const [state, formAction, pending] = useActionState<
    CategoryFormState,
    FormData
  >(saveCategory, null);

  return (
    <form action={formAction} className="flex w-full flex-col gap-y-4">
      <input type="hidden" name="id" value={category?.id ?? ""} />

      <label className="flex flex-col gap-y-1.5">
        <span className="font-bold text-neutral-700">Название модуля</span>
        <input
          type="text"
          name="name"
          required
          maxLength={100}
          defaultValue={category?.name ?? ""}
          placeholder="Например: Python"
          className={inputClass}
        />
      </label>

      <label className="flex flex-col gap-y-1.5">
        <span className="font-bold text-neutral-700">
          Иконка{" "}
          <span className="font-normal text-neutral-400">
            (эмодзи, необязательно)
          </span>
        </span>
        <input
          type="text"
          name="icon"
          maxLength={16}
          defaultValue={category?.icon ?? ""}
          placeholder="🐍"
          className={inputClass}
        />
      </label>

      <label className="flex flex-col gap-y-1.5">
        <span className="font-bold text-neutral-700">Направление</span>
        <select
          name="track"
          defaultValue={category?.track ?? "intro"}
          className={inputClass}
        >
          {TRACK_ORDER.map((track) => (
            <option key={track} value={track}>
              {TRACK_LABELS[track]}
            </option>
          ))}
        </select>
        <span className="text-sm text-neutral-400">
          Модуль видят только группы этого направления (наставник — все).
        </span>
      </label>

      {state?.error && (
        <p className="rounded-xl bg-rose-50 p-3 font-medium text-rose-600">
          {state.error}
        </p>
      )}

      <div className="mb-10 mt-2 flex items-center gap-x-3">
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Сохраняю…" : "Сохранить"}
        </Button>
        <Button variant="ghost" asChild>
          <Link href="/admin/categories">Отмена</Link>
        </Button>
      </div>
    </form>
  );
};
