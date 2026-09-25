// Серверная инициализация Sentry (рантаймы Node и Edge) + отлов серверных
// ошибок. Включается ТОЛЬКО если задан NEXT_PUBLIC_SENTRY_DSN — нет ключа,
// register() ничего не делает, captureRequestError без init = no-op.
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

// register() вызывается один раз при старте сервера (и в Node, и в Edge).
export function register() {
  if (!dsn) return;
  Sentry.init({
    dsn,
    tracesSampleRate: 0,
  });
}

// Нативный хук Next 15+: ловит ошибки серверного рендера, server actions и
// роут-хендлеров и отправляет их в Sentry.
export const onRequestError = Sentry.captureRequestError;
