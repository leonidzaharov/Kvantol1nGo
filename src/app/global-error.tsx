"use client"; // границы ошибок обязаны быть клиентскими компонентами

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

import "./globals.css";

// Последняя сетка безопасности: срабатывает, только если упал сам корневой
// layout (тогда обычный error.tsx уже не поможет). Заменяет всю страницу,
// поэтому обязан объявить свои <html>/<body>. metadata тут недоступна —
// заголовок задаём через <title>. Восстановление — полной перезагрузкой,
// потому что роутер в этот момент считать ненадёжным.
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="ru" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <title>Ошибка — Кванториум</title>
        <div className="mx-auto flex flex-1 max-w-lg flex-col items-center justify-center gap-y-6 px-6 text-center">
          <div className="text-7xl">🛠️</div>

          <h1 className="text-2xl font-bold text-neutral-700 lg:text-3xl">
            Что-то сломалось
          </h1>
          <p className="font-medium text-neutral-500">
            Мы уже знаем о проблеме. Обнови страницу — обычно помогает.
          </p>

          <button
            onClick={() => window.location.reload()}
            className="inline-flex h-12 items-center justify-center rounded-xl border-2 border-b-4 border-green-600 bg-green-500 px-8 text-sm font-bold uppercase tracking-wide text-white transition-colors hover:bg-green-500/90 active:border-b-2"
          >
            Обновить
          </button>
        </div>
      </body>
    </html>
  );
}
