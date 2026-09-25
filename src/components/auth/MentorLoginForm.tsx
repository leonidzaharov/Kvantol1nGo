"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

// Минимум длины админского PIN. Клиентская проверка — только UX-подсказка,
// настоящая гарантия длины — в scripts/create-user.mjs и rotate-pin.mjs.
const MIN_PIN = 8;
const MAX_PIN = 10;

export function MentorLoginForm() {
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  const canSubmit =
    name.trim().length > 0 && pin.length >= MIN_PIN && !submitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError("");

    const res = await signIn("credentials", {
      redirect: false,
      loginName: name.trim(),
      pin,
    });

    if (res?.error) {
      setError(
        res.code === "rate_limited"
          ? "Слишком много неудачных попыток. Подожди 5 минут."
          : "Неверное имя или PIN-код",
      );
      setPin("");
      setSubmitting(false);
      return;
    }

    router.push("/learn");
    router.refresh();
  };

  return (
    <div className="flex flex-1 flex-col items-center px-6 py-12">
      <header className="mb-10 text-center">
        <h1 className="text-3xl font-extrabold tracking-wide text-green-600 lg:text-4xl">
          Кванториум
        </h1>
        <p className="mt-3 text-lg font-bold text-neutral-500">
          Вход для наставника
        </p>
      </header>

      <form
        onSubmit={handleSubmit}
        className="w-full max-w-[380px] rounded-xl border-2 border-b-4 p-6"
      >
        {error && (
          <div className="mb-3 rounded-xl border-2 border-rose-200 bg-rose-100 p-2 text-center text-sm font-bold text-rose-500">
            {error}
          </div>
        )}

        <label
          htmlFor="mentor-name"
          className="mb-2 block text-center text-xs font-bold uppercase tracking-wide text-neutral-400"
        >
          Имя
        </label>
        <input
          id="mentor-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mb-4 w-full rounded-xl border-2 bg-neutral-50 py-3 text-center text-lg font-bold outline-none focus:border-green-400"
          placeholder="Как в профиле"
          autoComplete="off"
          required
        />

        <label
          htmlFor="mentor-pin"
          className="mb-2 block text-center text-xs font-bold uppercase tracking-wide text-neutral-400"
        >
          PIN-код
        </label>
        <input
          id="mentor-pin"
          type="password"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={MAX_PIN}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          className="w-full rounded-xl border-2 bg-neutral-50 py-3 text-center text-2xl tracking-[0.4em] outline-none focus:border-green-400"
          placeholder="••••••••"
          autoComplete="off"
          required
        />

        <Button
          type="submit"
          variant="secondary"
          className="mt-5 w-full"
          disabled={!canSubmit}
        >
          {submitting ? "Вход…" : "Войти"}
        </Button>
      </form>
    </div>
  );
}
