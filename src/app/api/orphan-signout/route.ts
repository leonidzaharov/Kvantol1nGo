import { NextResponse } from "next/server";

// Стираем session cookie для "осиротевших" токенов — когда сессия валидна,
// но пользователя в БД уже нет (см. src/app/(main)/learn/page.tsx → redirect сюда).
//
// CSRF: роут — GET, чтобы серверный redirect() мог его дёрнуть. Чтобы при этом
// `<img src=".../api/orphan-signout">` с чужого сайта не разлогинивал юзера,
// проверяем Fetch Metadata: Sec-Fetch-Site выставляется браузером и не
// подделывается со страницы атакующего. Разрешаем same-origin/same-site и
// `none` (server-initiated top-level navigation, наш redirect именно такой).
export async function GET(request: Request) {
  const site = request.headers.get("sec-fetch-site");
  const allowed = site === null || ["same-origin", "same-site", "none"].includes(site);
  if (!allowed) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const response = NextResponse.redirect(new URL("/", request.url));
  response.cookies.set("authjs.session-token", "", { path: "/", maxAge: 0 });
  response.cookies.set("__Secure-authjs.session-token", "", {
    path: "/",
    maxAge: 0,
    secure: true,
  });
  return response;
}
