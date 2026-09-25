"use client";

import { useActionState, useState } from "react";
import Link from "next/link";

import {
  saveAchievement,
  type AchievementFormState,
} from "@/lib/actions/achievements";
import type {
  AchievementMetric,
  AchievementRarity,
} from "@/generated/prisma";
import {
  ACHIEVEMENT_RARITY_LABELS,
  ACHIEVEMENT_RARITY_ORDER,
} from "@/lib/achievement-rarity";
import { Button } from "@/components/ui/button";

import { METRIC_LABELS, METRIC_ORDER } from "./metric-labels";

const inputClass =
  "w-full rounded-xl border-2 border-neutral-200 p-3 font-medium text-neutral-700 focus:border-sky-300 focus:outline-none";

type AchievementFormProps = {
  /** Ачивка для правки; не передана — форма создания. */
  achievement?: {
    id: number;
    title: string;
    description: string;
    icon: string | null;
    metric: AchievementMetric;
    rarity: AchievementRarity;
    categoryId: number | null;
    targetValue: number;
    rewardCurrency: number;
    isHidden: boolean;
    hiddenHint: string | null;
    isActive: boolean;
    sortOrder: number;
  };
  /** Курсы для селекта категорийной ачивки. */
  categories: { id: number; name: string }[];
};

// Одна форма на создание и правку (паттерн курсов): пустой id → create.
// Поля «курс»/«цель» переключаются по выбранному типу условия.
export const AchievementForm = ({
  achievement,
  categories,
}: AchievementFormProps) => {
  const [state, formAction, pending] = useActionState<
    AchievementFormState,
    FormData
  >(saveAchievement, null);

  const [metric, setMetric] = useState<AchievementMetric>(
    achievement?.metric ?? "lessons_completed",
  );
  const [isHidden, setIsHidden] = useState(achievement?.isHidden ?? false);
  const isCategoryMetric = metric === "category_completed";
  const isManualMetric = metric === "manual_award";

  return (
    <form action={formAction} className="flex w-full flex-col gap-y-4">
      <p id="reward-guide" className="text-sm text-neutral-500">20 монет = 1 пиксель. Награды: обычное 2, необычное 4, редкое 6, эпическое 8, легендарное 12, мифическое 20. Максимум обмена за курс — 60 пикселей.</p>
      <input type="hidden" name="id" value={achievement?.id ?? ""} />

      <label className="flex flex-col gap-y-1.5">
        <span className="font-bold text-neutral-700">Название</span>
        <input
          type="text"
          name="title"
          required
          maxLength={100}
          defaultValue={achievement?.title ?? ""}
          placeholder="Например: Мастер Python"
          className={inputClass}
        />
      </label>

      <label className="flex flex-col gap-y-1.5">
        <span className="font-bold text-neutral-700">Описание</span>
        <textarea
          name="description"
          required
          maxLength={300}
          rows={2}
          defaultValue={achievement?.description ?? ""}
          placeholder="Что нужно сделать, чтобы её открыть"
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
          defaultValue={achievement?.icon ?? ""}
          placeholder="🏆"
          className={inputClass}
        />
      </label>

      <label className="flex flex-col gap-y-1.5">
        <span className="font-bold text-neutral-700">Условие</span>
        <select
          name="metric"
          value={metric}
          onChange={(e) => setMetric(e.target.value as AchievementMetric)}
          className={inputClass}
        >
          {METRIC_ORDER.map((m) => (
            <option key={m} value={m}>
              {METRIC_LABELS[m]}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-y-1.5">
        <span className="font-bold text-neutral-700">Редкость</span>
        <select
          name="rarity"
          defaultValue={achievement?.rarity ?? "common"}
          className={inputClass}
        >
          {ACHIEVEMENT_RARITY_ORDER.map((rarity) => (
            <option key={rarity} value={rarity}>
              {ACHIEVEMENT_RARITY_LABELS[rarity]}
            </option>
          ))}
        </select>
      </label>

      {isCategoryMetric ? (
        <label className="flex flex-col gap-y-1.5">
          <span className="font-bold text-neutral-700">Курс</span>
          <select
            name="categoryId"
            required
            defaultValue={achievement?.categoryId ?? ""}
            className={inputClass}
          >
            <option value="" disabled>
              Выбери курс…
            </option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <span className="text-sm text-neutral-400">
            Откроется, когда ученик пройдёт все уроки курса. Цель считается по
            текущему числу уроков — добавишь урок, планка подрастёт сама.
          </span>
        </label>
      ) : isManualMetric ? (
        <p className="rounded-xl bg-violet-50 p-3 text-sm font-medium text-violet-700">
          Это достижение не выдаётся автоматически. После сохранения его можно
          назначить ученику внизу страницы.
        </p>
      ) : (
        <label className="flex flex-col gap-y-1.5">
          <span className="font-bold text-neutral-700">Цель</span>
          <input
            type="number"
            name="targetValue"
            required
            min={1}
            max={10000}
            defaultValue={achievement?.targetValue ?? 1}
            className={inputClass}
          />
          <span className="text-sm text-neutral-400">
            {metric === "level_reached"
              ? "Номер уровня, который нужно достичь."
              : metric === "perfect_lessons"
                ? "Сколько уроков нужно пройти без единой ошибки."
                : "Сколько всего уроков нужно пройти."}
          </span>
        </label>
      )}

      <label className="flex flex-col gap-y-1.5">
        <span className="font-bold text-neutral-700">
          Награда{" "}
          <span className="font-normal text-neutral-400">(монеты)</span>
        </span>
        <input
          type="number"
          name="rewardCurrency" aria-describedby="reward-guide"
          min={0}
          max={20}
          defaultValue={achievement?.rewardCurrency ?? 0}
          className={inputClass}
        />
      </label>

      <label className="flex flex-col gap-y-1.5">
        <span className="font-bold text-neutral-700">
          Порядок{" "}
          <span className="font-normal text-neutral-400">
            (меньше — выше в списке)
          </span>
        </span>
        <input
          type="number"
          name="sortOrder"
          defaultValue={achievement?.sortOrder ?? 0}
          className={inputClass}
        />
      </label>

      <label className="flex items-center gap-x-3">
        <input
          type="checkbox"
          name="isHidden"
          checked={isHidden}
          onChange={(event) => setIsHidden(event.target.checked)}
          className="h-5 w-5 accent-sky-500"
        />
        <span className="font-bold text-neutral-700">
          Секретная{" "}
          <span className="font-normal text-neutral-400">
            (до открытия видна как «???»)
          </span>
        </span>
      </label>

      {isHidden && (
        <label className="flex flex-col gap-y-1.5">
          <span className="font-bold text-neutral-700">
            Подсказка до открытия
          </span>
          <textarea
            name="hiddenHint"
            maxLength={200}
            rows={2}
            defaultValue={achievement?.hiddenHint ?? ""}
            placeholder="Нейтральная подсказка без точного условия"
            className={inputClass}
          />
          <span className="text-sm text-neutral-400">
            Настоящее название и описание останутся скрытыми.
          </span>
        </label>
      )}

      <label className="flex items-center gap-x-3">
        <input
          type="checkbox"
          name="isActive"
          defaultChecked={achievement?.isActive ?? true}
          className="h-5 w-5 accent-sky-500"
        />
        <span className="font-bold text-neutral-700">
          Активна{" "}
          <span className="font-normal text-neutral-400">
            (выключенная не выдаётся и не показывается ученикам)
          </span>
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
          <Link href="/admin/achievements">Отмена</Link>
        </Button>
      </div>
    </form>
  );
};
