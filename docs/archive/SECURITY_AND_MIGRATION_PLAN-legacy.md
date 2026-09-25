# АРХИВ: план миграции на Vercel + Supabase

> Миграция завершена. Актуальная архитектура: `docs/ARCHITECTURE.md`.

> **Контекст и модель угроз:** платформа — детский кружок, нет денег, нет PII кроме имён, нет приватной переписки. Защищаем только от реальных дешёвых атак (перебор PIN, подделка payload Server Action). Полная RLS, отдельные DB-роли, разделение `pinHash` в отдельную таблицу — отложено как избыточное.
>
> **Статус:** черновик. Шаги выполняются последовательно, каждый завершается smoke-тестом, после которого подтверждаем переход к следующему.

---

## 0. Что есть сейчас

- БД: SQLite (`dev.db`) через `@prisma/adapter-better-sqlite3` — **несовместимо с Vercel** (нет персистентного FS).
- Auth.js v5, JWT-стратегия, Credentials-провайдер, 4-значный PIN, `bcryptjs.compare`.
- Server Actions берут `userId` из `session.user.id` — payload-подделка `userId` уже невозможна.
- Логин не имеет rate-limit — 10000 комбинаций PIN перебираются скриптом за минуты. **Это главная реальная дыра.**

---

## 1. Шаги

### Шаг 1. Postgres вместо SQLite

> Это требование Vercel, не безопасность. Без этого приложение не запустится в проде.

1. Создаём Supabase-проект (регион Frankfurt, ближе всего по latency).
2. В `prisma/schema.prisma`:
   ```prisma
   datasource db {
     provider  = "postgresql"
     url       = env("DATABASE_URL")
     directUrl = env("DIRECT_URL")
   }
   ```
3. Убираем `@prisma/adapter-better-sqlite3` и `better-sqlite3` из `package.json`. `src/lib/db.ts` — стандартный `new PrismaClient()`.
4. `prisma migrate dev --name initial_postgres` локально (Postgres в Docker), проверяем валидность.
5. `prisma migrate deploy` на Supabase.
6. Скрипт `scripts/migrate-data.ts` — переносит существующие записи из `dev.db` в Supabase (один запуск, локально, `.env.local`).

**Smoke-тест:** `npm run dev` поднимается на Postgres, страница `/` рендерит профили, логин старым PIN работает (значит `pinHash` мигрировал корректно).

---

### Шаг 2. Переменные окружения

| Переменная     | Где                       | Кто использует                          |
| -------------- | ------------------------- | --------------------------------------- |
| `DATABASE_URL` | Vercel (Prod + Preview)   | приложение (pgbouncer transaction mode) |
| `DIRECT_URL`   | Vercel (Prod)             | `prisma migrate deploy` в CI            |
| `AUTH_SECRET`  | Vercel (все среды)        | Auth.js подпись JWT                     |

Правила:
- `.env.local` в `.gitignore` (проверить).
- `.env.example` коммитим — только ключи без значений.
- На Vercel — флаг «Sensitive» на секреты.
- Скрипт `scripts/check-env.mjs` падает, если хоть один обязательный ключ пуст. Запускаем перед деплоем.

---

### Шаг 3. Rate-limit на логин

> Это **единственная реальная дыра** в текущей версии. 4-значный PIN без лимита перебирается тривиально.

1. Добавляем модель в `schema.prisma`:
   ```prisma
   model LoginAttempt {
     id          Int      @id @default(autoincrement())
     userId      String
     succeeded   Boolean
     attemptedAt DateTime @default(now())

     @@index([userId, attemptedAt])
   }
   ```
2. В `src/auth.ts` → `authorize()`:
   - Перед `bcrypt.compare` считаем `count` неудачных за последние 15 минут для этого `userId`.
   - Если ≥ 5 — возвращаем `null` независимо от PIN.
   - После compare пишем результат (`succeeded: true/false`) в `LoginAttempt`.
3. Раз в сутки чистим записи старше 24 часов (можно простым cron в Vercel или ленивым `deleteMany` при каждом N-ом логине).

Никаких Upstash/Redis — нам не нужна сверхнизкая latency, ~10ms на `count` нас устраивает.

---

### Шаг 4. Zod на Server Actions

> Это не столько защита, сколько отлов кривых аргументов (например, `itemId = NaN`).

`zod` в зависимости. Хелперы в `src/lib/server-guard.ts`:

```ts
import { z } from "zod";
import { auth } from "@/auth";

export async function requireUser(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHORIZED");
  return session.user.id;
}

export function parse<T extends z.ZodTypeAny>(schema: T, input: unknown): z.infer<T> {
  const r = schema.safeParse(input);
  if (!r.success) throw new Error("BAD_REQUEST");
  return r.data;
}
```

Обновляем 5 Server Actions (`completeLesson`, `recordCorrectAnswer`, `equipItem`, `buyItem`, `unequipItem`):

```ts
const BuyItemSchema = z.object({ itemId: z.number().int().positive().max(1_000_000) });

export async function buyItem(input: unknown): Promise<BuyItemResult> {
  const userId = await requireUser();
  const { itemId } = parse(BuyItemSchema, input);
  // ... остальная логика без изменений
}
```

Подтверждаем инвариант code review: **никакой Server Action не принимает `userId` в аргументах** — он только из `requireUser()`.

---

### Шаг 5. Гигиена logout

`src/app/api/orphan-signout/route.ts` сейчас — GET-роут, удаляющий cookie. CSRF-вектор: `<img src="/api/orphan-signout">` на чужом сайте разлогинит. Чистим:

- Либо удаляем файл и используем штатный `signOut()` из Auth.js (он POST с CSRF-токеном).
- Либо переводим на POST с проверкой `Origin`-заголовка.

---

### Шаг 6. Финальная проверка перед деплоем

- [ ] `npm run build` без ошибок.
- [ ] `prisma migrate status` чист на Production-БД.
- [ ] Логин старым PIN работает.
- [ ] 5 неудачных PIN подряд → блокировка на 15 минут.
- [ ] В DevTools подмена `itemId` на `"DROP TABLE"` → Zod-отказ, не 500.
- [ ] `dev.db` и `better-sqlite3` удалены из проекта (есть локальный бэкап SQLite на случай отката).
- [ ] `.env.local` не в git (`git check-ignore .env.local` → выходит с 0).

Деплой: мерж в `main` → Vercel ставит prod. Откат: `vercel rollback`.

---

## 2. Что НЕ делаем (и почему)

| Отложено                                | Почему                                                                  |
| --------------------------------------- | ----------------------------------------------------------------------- |
| Row Level Security в Supabase           | Server Actions уже фильтруют по `userId` из сессии, других путей в БД нет. Можно добавить позже одной миграцией, если когда-нибудь появятся приватные данные. |
| Отдельная таблица `UserSecret` + `auth_role` | `pinHash` уже только на сервере. Раздваивать архитектуру без выигрыша.  |
| Lazy bcrypt rehash до cost=12           | PIN всего 4 цифры — рост cost ничего не даёт против перебора. Rate-limit важнее. |
| Upstash Redis для rate-limit            | Лишний сервис. Таблицы `LoginAttempt` достаточно.                       |
| Audit log, CSP, captcha, 2FA            | Не блокирует запуск. Возьмём, если появится потребность.                |

---

## 3. Жду от тебя

Подтверждение «начинаем с Шага 1» — после этого создаю Supabase-проект и начинаю миграцию схемы. Каждый шаг останавливается на smoke-тесте.
