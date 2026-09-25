"use client";

import { useActionState } from "react";

import {
  configureStudentProfile,
  type StudentFormState,
} from "@/lib/actions/student-profile";
import { Button } from "@/components/ui/button";

export function ProfileSetupForm({
  nickname,
  mentorLabel,
}: {
  nickname: string;
  mentorLabel: string;
}) {
  const [state, action, pending] = useActionState<StudentFormState, FormData>(
    configureStudentProfile,
    null,
  );

  return (
    <form action={action} className="mt-6 space-y-5">
      <div>
        <label htmlFor="mentor-label" className="mb-1 block font-bold text-neutral-700">
          Пометка для наставника
        </label>
        <input
          id="mentor-label"
          name="mentorLabel"
          defaultValue={mentorLabel}
          maxLength={40}
          autoComplete="off"
          required
          className="w-full rounded-xl border-2 bg-neutral-50 px-4 py-3 font-bold outline-none focus:border-green-400"
        />
        <p className="mt-1 text-xs text-neutral-500">
          Это увидит только наставник. Используй ник или пометку без имени и фамилии, например: Синяя лиса · место 4.
        </p>
      </div>

      <div>
        <label htmlFor="student-nickname" className="mb-1 block font-bold text-neutral-700">
          Выбери ник для приложения
        </label>
        <input
          id="student-nickname"
          name="nickname"
          defaultValue={nickname}
          maxLength={24}
          autoComplete="nickname"
          required
          className="w-full rounded-xl border-2 bg-neutral-50 px-4 py-3 font-bold outline-none focus:border-green-400"
        />
        <p className="mt-1 text-xs text-neutral-500">
          Ник увидят другие ученики в профиле, достижениях и лидерборде.
        </p>
      </div>

      {state?.error ? (
        <p role="alert" className="text-sm font-bold text-rose-500">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" variant="secondary" className="w-full" disabled={pending}>
        {pending ? "Сохраняем…" : "Сохранить профиль"}
      </Button>
    </form>
  );
}
