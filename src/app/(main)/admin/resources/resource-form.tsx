"use client";

import { useActionState, useState } from "react";
import Link from "next/link";

import type { Resource, ResourceType } from "@/generated/prisma";
import { saveResource, type ResourceFormState } from "@/lib/actions/resources";
import { DEFAULT_COIN_REWARD } from "@/lib/resource-input";
import { Button } from "@/components/ui/button";

import { TYPE_LABELS } from "./type-labels";

// Подсказка под полем «Ссылка» — своя на каждый тип.
const URL_HINTS: Record<ResourceType, string | null> = {
  video: "Вставь ссылку на YouTube-видео (или сам ID) — приведём к нужному виду.",
  scratch: "Вставь ссылку scratch.mit.edu/projects/… (или номер проекта).",
  article: "Полный адрес, начинается с https://",
  note: null, // у совета ссылки нет — вместо неё текст
};

const inputClass =
  "w-full rounded-xl border-2 border-neutral-200 p-3 font-medium text-neutral-700 focus:border-sky-300 focus:outline-none";

type ResourceFormProps = {
  /** Материал для правки; не передан — форма создания. */
  resource?: Resource;
  /** Порядок по умолчанию для нового материала (максимум + 1). */
  defaultSortOrder?: number;
  groups: { id: number; name: string }[];
  selectedGroupIds?: number[];
};

// Одна форма на создание и правку: скрытое поле id пустое → create.
// Ошибки валидации приходят из server action через useActionState.
export const ResourceForm = ({
  resource,
  defaultSortOrder,
  groups,
  selectedGroupIds = [],
}: ResourceFormProps) => {
  const [state, formAction, pending] = useActionState<
    ResourceFormState,
    FormData
  >(saveResource, null);
  // Тип выбран в селекте — от него зависит, показывать «Ссылку» или «Текст».
  const [type, setType] = useState<ResourceType>(resource?.type ?? "video");

  return (
    <form action={formAction} className="flex w-full flex-col gap-y-4">
      <input type="hidden" name="id" value={resource?.id ?? ""} />

      <label className="flex flex-col gap-y-1.5">
        <span className="font-bold text-neutral-700">Тип</span>
        <select
          name="type"
          value={type}
          onChange={(e) => setType(e.target.value as ResourceType)}
          className={inputClass}
        >
          {(Object.keys(TYPE_LABELS) as ResourceType[]).map((value) => (
            <option key={value} value={value}>
              {TYPE_LABELS[value]}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="space-y-2 rounded-2xl border-2 border-neutral-200 p-4">
        <legend className="px-2 font-bold text-neutral-700">
          Группы материала
        </legend>
        <p className="text-sm text-neutral-500">
          После публикации карточку увидят только отмеченные группы.
        </p>
        {groups.length === 0 ? (
          <p className="text-sm text-amber-600">
            Сначала создайте хотя бы одну группу.
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {groups.map((group) => (
              <label
                key={group.id}
                className="flex items-center gap-2 rounded-xl bg-neutral-50 p-3"
              >
                <input
                  type="checkbox"
                  name="groupId"
                  value={group.id}
                  defaultChecked={selectedGroupIds.includes(group.id)}
                  className="h-5 w-5 accent-green-600"
                />
                <span className="font-medium text-neutral-700">
                  {group.name}
                </span>
              </label>
            ))}
          </div>
        )}
      </fieldset>

      <label className="flex flex-col gap-y-1.5">
        <span className="font-bold text-neutral-700">Заголовок</span>
        <input
          type="text"
          name="title"
          required
          maxLength={120}
          defaultValue={resource?.title ?? ""}
          className={inputClass}
        />
      </label>

      <label className="flex flex-col gap-y-1.5">
        <span className="font-bold text-neutral-700">
          Описание <span className="font-normal text-neutral-400">(необязательно)</span>
        </span>
        <input
          type="text"
          name="description"
          maxLength={300}
          defaultValue={resource?.description ?? ""}
          className={inputClass}
        />
      </label>

      {type === "note" ? (
        <label className="flex flex-col gap-y-1.5">
          <span className="font-bold text-neutral-700">Текст совета</span>
          <textarea
            name="body"
            required
            rows={4}
            maxLength={2000}
            defaultValue={resource?.body ?? ""}
            className={inputClass}
          />
        </label>
      ) : (
        <label className="flex flex-col gap-y-1.5">
          <span className="font-bold text-neutral-700">Ссылка</span>
          <input
            type="text"
            name="url"
            required
            defaultValue={resource?.url ?? ""}
            className={inputClass}
          />
          <span className="text-sm text-neutral-400">{URL_HINTS[type]}</span>
        </label>
      )}
      {/* Невыбранное поле всё равно уходит в FormData пустым — сервер его игнорирует */}
      {type === "note" ? (
        <input type="hidden" name="url" value="" />
      ) : (
        <input type="hidden" name="body" value="" />
      )}

      <label className="flex flex-col gap-y-1.5">
        <span className="font-bold text-neutral-700">Монеты за «Изучил»</span>
        <input
          // key=type: при смене типа в форме СОЗДАНИЯ поле пересоздаётся
          // с новым тарифом по умолчанию (1/2/3). При правке — значение из БД.
          key={resource ? "edit" : type}
          type="number"
          name="coinReward"
          required
          min={0}
          max={100}
          defaultValue={resource?.coinReward ?? DEFAULT_COIN_REWARD[type]}
          className={inputClass}
        />
        <span className="text-sm text-neutral-400">
          Начисляются ученику один раз — при нажатии «Изучил» на карточке.
        </span>
      </label>

      <label className="flex flex-col gap-y-1.5">
        <span className="font-bold text-neutral-700">Порядок</span>
        <input
          type="number"
          name="sortOrder"
          required
          min={0}
          defaultValue={resource?.sortOrder ?? defaultSortOrder ?? 0}
          className={inputClass}
        />
        <span className="text-sm text-neutral-400">
          Меньше — выше на странице «Интересное». Если номер занят, материал
          встанет на это место, а остальные сдвинутся вниз.
        </span>
      </label>

      {state?.error && (
        <p className="rounded-xl bg-rose-50 p-3 font-medium text-rose-600">
          {state.error}
        </p>
      )}

      <div className="mt-2 flex items-center gap-x-3">
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Сохраняю…" : "Сохранить"}
        </Button>
        <Button variant="ghost" asChild>
          <Link href="/admin/resources">Отмена</Link>
        </Button>
      </div>
    </form>
  );
};
