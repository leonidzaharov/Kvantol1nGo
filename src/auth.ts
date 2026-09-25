import NextAuth, { CredentialsSignin } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { authConfig } from "./auth.config";

const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT_MAX_FAILURES = 5;

// Отдельный код ошибки для rate-limit, чтобы фронт мог показать
// «Подожди 5 минут» вместо обобщённого «Неверный PIN». Для детского
// кружка приоритет UX > утечки факта блока: атакующий и так увидит
// блок по count'у на 6-м запросе.
class RateLimitedError extends CredentialsSignin {
  code = "rate_limited";
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    CredentialsProvider({
      name: "PIN Code",
      credentials: {
        userId: { label: "User ID", type: "text" },
        loginName: { label: "Имя", type: "text" },
        pin: { label: "PIN", type: "password" },
      },
      async authorize(credentials) {
        const pin =
          typeof credentials?.pin === "string" ? credentials.pin : "";
        if (!pin) {
          return null;
        }

        // Два пути входа. Ученик выбирает профиль на главной — приходит
        // userId. Наставник вводит имя на скрытой /mentor — приходит
        // loginName. По имени пускаем ТОЛЬКО админов: профили наставников
        // с главной убраны, и /mentor не должна стать чёрным ходом для
        // входа в ученические аккаунты по имени.
        let user = null;
        if (typeof credentials?.userId === "string" && credentials.userId) {
          user = await prisma.user.findUnique({
            where: { id: credentials.userId },
          });
        } else if (
          typeof credentials?.loginName === "string" &&
          credentials.loginName.trim()
        ) {
          // findFirst: имя в схеме не уникально. Дубликаты имён среди
          // админов create-user не допускает без --force.
          user = await prisma.user.findFirst({
            where: { name: credentials.loginName.trim(), isAdmin: true },
          });
        }
        if (!user) {
          // Несуществующий userId/имя намеренно не логируем: иначе атакующий
          // случайными значениями раздует таблицу. Реальный перебор PIN и так
          // упирается в лимит ниже — для уже валидных юзеров.
          return null;
        }

        // Rate-limit: 5 неудачных за 5 минут блокируют дальнейшие попытки
        // до конца окна, даже если PIN внезапно правильный. Защищает
        // 4-значный PIN от полного перебора (10000 комбинаций без лимита —
        // секунды). Считаем ДО bcrypt.compare — иначе тратим ~100мс впустую.
        const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
        const recentFailures = await prisma.loginAttempt.count({
          where: {
            userId: user.id,
            succeeded: false,
            attemptedAt: { gte: windowStart },
          },
        });
        if (recentFailures >= RATE_LIMIT_MAX_FAILURES) {
          throw new RateLimitedError();
        }

        const isPasswordValid = await bcrypt.compare(pin, user.pinHash);

        // Логируем результат на best-effort: если запись упадёт (сетевой
        // сбой Supabase), не валим логин — успешный bcrypt уже подтвердил
        // личность. Без записи в худшем случае пропадёт один rate-limit-tick.
        try {
          await prisma.loginAttempt.create({
            data: { userId: user.id, succeeded: isPasswordValid },
          });
        } catch {
          /* noop */
        }

        if (!isPasswordValid) {
          return null;
        }

        // Отмечаем «последний раз заходил» — пригодится наставнику, чтобы
        // видеть, кто давно не появлялся. (Стрик убран сознательно: при
        // занятиях 2–3 раза в неделю серия дней всегда рвалась и только
        // демотивировала. Опора мотивации — XP/уровни/ачивки/монеты.)
        // Best-effort: если обновление упадёт, логин всё равно пройдёт.
        try {
          await prisma.user.update({
            where: { id: user.id },
            data: { lastActiveDate: new Date() },
          });
        } catch {
          /* noop */
        }

        return {
          id: user.id,
          name: user.name,
        };
      },
    }),
  ],
  session: {
    strategy: "jwt",
    // Одного входа хватает на учебный день, но забытая вкладка не остаётся
    // авторизованной сутками на общем компьютере.
    maxAge: 8 * 60 * 60,
  },
});
