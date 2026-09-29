import NextAuth from 'next-auth';
import { NextResponse } from 'next/server';
import { authConfig } from './auth.config';

// ============================================================
// Proxy (middleware) делает две вещи для каждой страницы:
//
// 1. Авторизация — next-auth проверяет сессию; редирект неавторизованных
//    с защищённых маршрутов возвращает callbacks.authorized (auth.config.ts).
//
// 2. Строгий CSP с nonce — на каждый запрос генерируется одноразовый
//    случайный токен. Next сам проставляет его во все свои <script>-теги
//    (он читает заголовок CSP из запроса), а браузер выполняет ТОЛЬКО
//    скрипты с этим токеном. Инлайн-скрипт, подброшенный через XSS,
//    токена не знает — и блокируется. Это «фаза 2» после обкатки
//    политики в Report-Only (коммит b0e87d3).
//
// Почему 'strict-dynamic': скрипты, которые ДОВЕРЕННЫЙ код создаёт сам
// (Pyodide из /pyodide, воркеры раннеров), наследуют доверие без
// перечисления доменов. Внешних скриптов не осталось: Python хостится
// локально, Supabase и телеметрия Vercel убраны — ходим только на свои
// origin и на Sentry для отчётов об ошибках.
//
// ВАЖНО: nonce требует рендера страницы на каждый запрос. Статические
// страницы (пререндер на билде) токена не получат и их скрипты будут
// заблокированы — поэтому /privacy переведена на force-dynamic.
// ============================================================

function buildCsp(nonce: string): string {
  const isDev = process.env.NODE_ENV === 'development';
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'self'",
    "form-action 'self'",
    // 'unsafe-eval' — только в dev: React в разработке использует eval
    // для читаемых стеков ошибок. В проде он не нужен и запрещён.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval'${isDev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self' https://*.ingest.sentry.io https://*.ingest.de.sentry.io",
    "worker-src 'self' blob:",
    "child-src 'self' blob:",
    // Встраиваемые плееры «Интересного» (card.tsx): YouTube-видео и проекты
    // Scratch. Без frame-src браузер берёт child-src и режет оба iframe.
    "frame-src 'self' https://www.youtube-nocookie.com https://scratch.mit.edu",
    "manifest-src 'self'",
    // Дожимаем случайные http-ссылки до https (в dev не мешаем localhost).
    ...(isDev ? [] : ['upgrade-insecure-requests']),
  ].join('; ');
}

export default NextAuth(authConfig).auth((request) => {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const csp = buildCsp(nonce);

  // CSP кладём и в заголовки ЗАПРОСА — именно оттуда Next берёт nonce,
  // когда рендерит страницу и подписывает свои <script>-теги.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
});

export const config = {
  // Middleware работает на страницах. Исключаем: API (своя проверка
  // доступа в хендлерах), сборку Next и ЛЮБОЙ путь с расширением файла —
  // картинки, /media/*, robots.txt, favicon и т.п. отдаются без CSP
  // и без редиректа, как обычная статика.
  matcher: ['/((?!api|_next/static|_next/image|.*\\..*).*)'],
};
