"use client";

import Link from "next/link";
import { useActionState } from "react";

import {
  configureStudentProfile,
  type StudentFormState,
} from "@/lib/actions/student-profile";
import { Button } from "@/components/ui/button";

export function ProfileSetupForm({
  nickname,
  mentorLabel,
  requiresConsent,
}: {
  nickname: string;
  mentorLabel: string;
  requiresConsent: boolean;
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

      {requiresConsent && (
        <label className="flex items-start gap-3 rounded-xl border-2 border-green-200 bg-green-50 p-4 text-sm text-neutral-700">
          <input type="checkbox" name="privacyAccepted" value="yes" required className="mt-1 size-4 shrink-0 accent-green-600" />
          <span>
            Я ознакомился(-ась) и согласен(-на) с{" "}
            <Link href="/privacy" target="_blank" rel="noopener noreferrer" className="font-bold text-green-700 underline">
              политикой конфиденциальности
            </Link>.
          </span>
        </label>
      )}

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
