"use client"; // границы ошибок обязаны быть клиентскими компонентами

import { useEffect } from "react";
import Link from "next/link";
import * as Sentry from "@sentry/nextjs";

import { Button } from "@/components/ui/button";

// Ловит ошибки рендера любой страницы (кроме корневого layout — для него
// global-error.tsx). Ошибки из клиента боундари не шлёт в Sentry сама, поэтому
// делаем это руками (captureException — no-op, если DSN не задан).
export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="mx-auto flex flex-1 max-w-lg flex-col items-center justify-center gap-y-6 px-6 text-center">
      <div className="text-7xl">🛠️</div>

      <h1 className="text-2xl font-bold text-neutral-700 lg:text-3xl">
        Что-то сломалось
      </h1>
      <p className="font-medium text-neutral-500">
        Мы уже знаем о проблеме. Попробуй ещё раз — обычно помогает.
      </p>

      <div className="flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
        <Button variant="secondary" size="lg" onClick={() => unstable_retry()}>
          Попробовать снова
        </Button>
        <Button variant="default" size="lg" asChild>
          <Link href="/">На главную</Link>
        </Button>
      </div>
    </div>
  );
}
