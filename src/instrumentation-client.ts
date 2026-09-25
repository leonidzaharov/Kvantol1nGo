// Клиентская инициализация Sentry — отлов ошибок в браузере ученика.
// Включается ТОЛЬКО если задан NEXT_PUBLIC_SENTRY_DSN. Нет ключа → выключено:
// ничего никуда не шлётся, приложение работает как обычно.
// DSN не секрет (его видно в браузере по дизайну) — поэтому NEXT_PUBLIC_*.
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    // Только ошибки, без трейсинга производительности — бережём бесплатный тариф.
    tracesSampleRate: 0,
  });
}

// Хук навигации App Router: даёт Sentry «хлебные крошки» переходов между
// страницами — в отчёте об ошибке видно, откуда ученик пришёл.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
