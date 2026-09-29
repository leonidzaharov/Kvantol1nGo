import { NextResponse } from "next/server";
import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  providers: [], // Мы добавим провайдеры в auth.ts, чтобы избежать импорта bcrypt на Edge-runtime
  pages: {
    signIn: "/",
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      // Закрыто по умолчанию: публичны только перечисленные страницы.
      // Новый маршрут автоматически требует входа — забыть добавить его
      // в «защищённые» больше нельзя. Файлы с расширением (картинки,
      // robots.txt, /media/*) matcher в proxy.ts вообще не пропускает
      // сюда — они отдаются как статика.
      const isPublic = ['/', '/mentor', '/privacy', '/creator'].includes(
        nextUrl.pathname,
      );

      if (!isPublic && !isLoggedIn) {
        // Возвращаем редирект НА ВХОД сами, а не `false`: наш proxy.ts теперь
        // оборачивает свою функцию в auth(...), а в этом режиме next-auth
        // дефолтный редирект НЕ делает (уважает только Response из authorized).
        const signInUrl = nextUrl.clone();
        signInUrl.pathname = "/";
        signInUrl.search = "";
        signInUrl.searchParams.set("callbackUrl", nextUrl.href);
        return NextResponse.redirect(signInUrl);
      }
      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
