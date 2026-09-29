import { createHash } from "node:crypto";

import NextAuth, { CredentialsSignin } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { authConfig } from "./auth.config";

const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
// После стольких неудач подряд неверный PIN отвечает «подожди 5 минут»
// вместо безличного «неверно» — ребёнку с опечатками так честнее.
const USER_MAX_FAILURES = 5;
// Жёсткий потолок неудач с одного IP за окно — защита от перебора
// чужих PIN через разные профили. Запас относительно класса за NAT:
// 15 учеников с парой опечаток каждый — это ~30, а не 60.
const IP_MAX_FAILURES = 60;
// Журнал попыток держим неделю: для разбора инцидента хватает, а
// таблица не раздувается без внешнего таймера (чистим ниже).
const ATTEMPT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

// Отдельный код ошибки для rate-limit, чтобы фронт мог показать
// «Подожди 5 минут» вместо обобщённого «Неверный PIN». Для детского
// кружка приоритет UX > утечки факта блока: атакующий и так увидит
// блок по count'у на 6-м запросе.
class RateLimitedError extends CredentialsSignin {
  code = "rate_limited";
}

// IP берём из X-Forwarded-For/Real-IP — на проде их выставляет nginx,
// поэтому подмена заголовка возможна только при прямом доступе к
// Node-процессу, который слушает 127.0.0.1 и снаружи недоступен.
function clientIpHash(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip");
  if (!ip) return null;
  // Сырой адрес в журнале не храним (дети): хэш с солью из AUTH_SECRET
  // даёт группировку по IP без PII.
  return createHash("sha256")
    .update(`${ip}:${process.env.AUTH_SECRET ?? "kvantolingo"}`)
    .digest("hex")
    .slice(0, 32);
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
      async authorize(credentials, request) {
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

        // Фоновая уборка журнала: ~2% входов чистят записи старше недели.
        // Best-effort, без await — падение не ломает логин.
        if (Math.random() < 0.02) {
          void prisma.loginAttempt
            .deleteMany({
              where: {
                attemptedAt: {
                  lt: new Date(Date.now() - ATTEMPT_RETENTION_MS),
                },
              },
            })
            .catch(() => {});
        }

        const ipHash = clientIpHash(request);
        const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);

        // Счётчики, сравнение PIN и запись попытки — в одной транзакции
        // под advisory lock на ученика: параллельные попытки не проскочат
        // мимо лимита одновременным count (гонка старого кода).
        const { ok, userFailures, ipBlocked } = await prisma.$transaction(
          async (tx) => {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${user.id}))`;

            const [userFailures, ipFailures] = await Promise.all([
              tx.loginAttempt.count({
                where: {
                  userId: user.id,
                  succeeded: false,
                  attemptedAt: { gte: windowStart },
                },
              }),
              ipHash
                ? tx.loginAttempt.count({
                    where: {
                      ipHash,
                      succeeded: false,
                      attemptedAt: { gte: windowStart },
                    },
                  })
                : Promise.resolve(0),
            ]);

            // Жёсткий блок по IP до bcrypt: ботнету не достаются даже
            // ~100 мс на сравнение хэша. Попытку всё равно записываем —
            // затянувшаяся атака не выйдет из окна раньше времени.
            const ipBlocked = ipFailures >= IP_MAX_FAILURES;

            // Правильный PIN пускаем ВСЕГДА, даже когда у ученика уже
            // куча неудач: иначе один ребёнок на общем компьютере мог бы
            // «заблокировать» одноклассника, накидав ошибок в его профиль.
            // Перебор тормозят лимит по IP и цена bcrypt, а не локаут.
            const ok = ipBlocked ? false : await bcrypt.compare(pin, user.pinHash);

            await tx.loginAttempt.create({
              data: { userId: user.id, succeeded: ok, ipHash },
            });
            return { ok, userFailures, ipBlocked };
          },
        );

        if (ipBlocked) {
          throw new RateLimitedError();
        }
        if (!ok) {
          if (userFailures >= USER_MAX_FAILURES) {
            throw new RateLimitedError();
          }
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
