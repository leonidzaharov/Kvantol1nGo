# АРХИВ: гид по старой архитектуре «Кванториума»

> Документ описывает удалённые подсистемы. Начните с корневого `README.md`.

Это технический разбор всего, что лежит в репозитории, в порядке от
«общая картина» к «конкретный файл и зачем он именно такой». Цель —
чтобы прочитав до конца, ты понимал каждый файл и мог уверенно его
менять.

---

## 1. Что это и зачем

«Кванториум» — образовательная платформа для детей с уроками
программирования (Scratch → HTML → JS). Геймифицированная: за уроки
дают XP и монеты, есть уровни, стрики (дни подряд), достижения,
магазин с одеждой для маскота-снегиря.

Главные сущности предметной области:

- **Ученик** (`User`) — авторизуется по 4-значному PIN.
- **Урок** (`Lesson`) — список вопросов с вариантами ответов, лежит в
  категории.
- **Прогресс по уроку** (`UserLessonProgress`) — сколько вопросов закрыл,
  завершён ли урок.
- **Достижение** (`Achievement` + `UserAchievement`) — ачивка с
  прогрессом до целевого значения.
- **Инвентарь снегиря** — `Slot` (голова/глаза/...), `InventoryItem`
  (предмет), `UserInventory` (что куплено), `UserEquipped` (что надето).

---

## 2. Стек технологий

| Слой | Что | Почему именно это |
|---|---|---|
| Фреймворк | **Next.js 16** (App Router) | Серверные компоненты + клиентские в одном проекте, файловый роутинг, Server Actions из коробки. |
| Язык | **TypeScript** strict | Контракт между сервером и клиентом не теряется. |
| База | **SQLite** + `better-sqlite3` | Локальный файл `dev.db`, не нужен сервер БД. На проде заменим Postgres-ом одной строкой Prisma datasource. |
| ORM | **Prisma 7** | Декларативная схема + типизированный клиент + миграции. |
| Авторизация | **NextAuth 5 (beta)** | Сессии по JWT, провайдер Credentials с самописной PIN-логикой. |
| UI | **React 19** + Tailwind v4 | Tailwind для утилит, ручной CSS для пиксель-арт стилей в `*.css`. |
| Анимации | **GSAP** | Прогресс-бары и прыжок снегиря — там, где CSS-анимации недостаточно. |
| Графика | **SVG `<rect>`** + ASCII-карты | Маскот и иконки — настоящий пиксель-арт без растровых файлов: каждый пиксель = `<rect width=1 height=1>`. |

---

## 3. Карта проекта

```
quantorium/
├── prisma/
│   ├── schema.prisma          ← модель данных
│   ├── migrations/            ← история изменений схемы
│   ├── seed.ts                ← скрипт наполнения БД
│   └── seed-lessons/          ← JSON-контент уроков
│       ├── scratch/
│       ├── html/
│       └── javascript/
├── prisma.config.ts           ← конфиг Prisma (где schema, как запускать seed)
│
├── src/
│   ├── app/                   ← App Router: каждая папка = маршрут
│   │   ├── layout.tsx         ← корневой HTML + шрифты
│   │   ├── page.tsx           ← / — экран выбора профиля
│   │   ├── globals.css
│   │   ├── api/auth/...       ← NextAuth handlers
│   │   ├── dashboard/         ← /dashboard
│   │   ├── lesson/[id]/       ← /lesson/:id
│   │   ├── shop/              ← /shop
│   │   └── achievements/      ← /achievements
│   │
│   ├── auth.ts                ← NextAuth provider
│   ├── auth.config.ts         ← общая конфигурация (callbacks, pages)
│   │
│   ├── lib/
│   │   ├── db.ts              ← синглтон Prisma client
│   │   ├── achievements.ts    ← движок ачивок (реестр + bump/set)
│   │   └── actions/
│   │       ├── gamification.ts  ← completeLesson, recordCorrectAnswer
│   │       └── inventory.ts     ← buyItem, equipItem, unequipItem
│   │
│   ├── components/
│   │   ├── PixelSprite.tsx    ← рендер ASCII-карты в сетку div'ов
│   │   ├── Mascot.tsx         ← снегирь через SVG-rect
│   │   ├── ProgressBar.tsx    ← бар с GSAP-анимацией
│   │   ├── AchievementToast.tsx + .css  ← всплывающее уведомление
│   │   ├── auth/ProfileSelector.tsx
│   │   └── dashboard/         ← AvatarPanel, Header, NavRail, MascotPanel, QuestGrid, QuestCard, sprites
│   │
│   └── generated/prisma/      ← автогенерированный клиент (не править руками)
│
├── package.json
├── tsconfig.json
└── ГИД.md  ← ты здесь
```

---

## 4. Архитектурные решения и почему они такие

Перед тем как нырять в файлы, важно понять несколько повторяющихся
паттернов. Без них код будет казаться хаотичным.

### 4.1 Server Components по умолчанию

Next.js App Router рендерит компоненты на сервере, если у файла нет
`"use client"` сверху. Это значит: страница вроде
`src/app/dashboard/page.tsx` **выполняется на сервере**, может прямо
обратиться к Prisma и отдать готовый HTML.

```tsx
// src/app/dashboard/page.tsx
export default async function DashboardPage() {
  const session = await auth();              // выполняется на сервере
  const user = await prisma.user.findUnique({ ... }); // выполняется на сервере
  return <div>...</div>;                     // HTML улетает в браузер
}
```

Преимущество: не нужно строить REST-API под каждую страницу. Минус:
никаких хуков (`useState`, `useEffect`) — для интерактивности
выделяй отдельный клиентский компонент с `"use client"`.

### 4.2 Server Actions для мутаций

Когда из браузера нужно что-то записать — мы не пишем `fetch('/api/...')`,
а создаём **server action**: TS-функция с `"use server"` сверху,
которую можно вызвать прямо из клиентского компонента, как обычную
функцию. Next.js подложит RPC-канал.

```ts
// src/lib/actions/gamification.ts
"use server";
export async function completeLesson(lessonId: number) { ... }
```

```tsx
// src/app/lesson/[id]/QuestRunner.tsx
"use client";
const res = await completeLesson(lessonId);   // RPC под капотом
```

Это и есть «магия» App Router: типы Сохраняются, авторизация
проверяется внутри action, ревалидация кеша — `revalidatePath()`.

### 4.3 Оптимистичный UI

Для хороших ощущений мы не ждём круг до сервера и обратно — обновляем
интерфейс **сразу**, а потом синхронизируемся с серверным ответом
(или откатываем при ошибке). Видно в `ShopClient.tsx`:

```tsx
setOptimistic((prev) =>
  prev.map((it) => (it.id === item.id ? { ...it, owned: true } : it)),
);
setOptimisticCurrency(prev - item.price);
try {
  const res = await buyItem(item.id);  // подождём правду от сервера
  setOptimisticCurrency(res.currency); // и зафиксируем её
} catch {
  setOptimistic(items);                // откат, если что
  setOptimisticCurrency(prevCurrency);
}
```

### 4.4 Идемпотентность бизнес-логики

Все важные операции идемпотентны — повтор того же вызова не
портит состояние:

- `completeLesson` повторно — XP начислит только в первый раз
  (`firstCompletion = !existingProgress?.isCompleted`).
- `bumpAchievement` — после разблокировки возвращает `null`,
  ничего не меняя.
- `unequipItem` — `deleteMany`, а не `delete`: пустой результат не падает.
- `buyItem` — если предмет уже в инвентаре, монеты не списываются.

Это защищает от двойных кликов, гонок и бэкендных ретраев.

### 4.5 Транзакции для согласованности

Когда нужно изменить несколько таблиц вместе — оборачиваем в
`prisma.$transaction`, чтобы либо обе записи прошли, либо ни одной.
Самый яркий пример — `buyItem`:

```ts
await prisma.$transaction(async (tx) => {
  // 1. проверить владение
  // 2. проверить хватает ли монет
  // 3. создать UserInventory
  // 4. списать currency
  // — либо всё, либо ничего, иначе можно списать монеты без получения предмета
});
```

### 4.6 Ленивая регистрация ачивок

Запись в таблице `Achievement` создаётся не сидером, а первым
вызовом `bumpAchievement`/`setAchievementProgress` (через `upsert`).
Это значит: новые ачивки добавляются только в коде (`REGISTRY` в
`lib/achievements.ts`), миграция не нужна, БД сама подтягивается.

---

## 5. Жизненный путь типичной операции

Лучший способ понять всю архитектуру — проследить, что происходит,
когда ученик завершает урок.

```
┌────────────────────────────────────────────────────────────────┐
│ 1. Браузер: ученик нажал последний правильный ответ            │
│    QuestRunner.tsx (client) → handleAnswer → completeLesson()  │
└──────────────────────────┬─────────────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────────────┐
│ 2. Сервер: completeLesson из gamification.ts                   │
│    auth() → проверка сессии                                    │
│    transaction:                                                │
│      - upsert UserLessonProgress (isCompleted=true)            │
│      - update User (totalXp, level, streakDays)                │
│    после tx:                                                   │
│      - count completed lessons                                 │
│      - bump/set 7 ачивок                                       │
│    revalidatePath('/dashboard')                                │
│    return { gainedXp, level, leveledUp, unlockedAchievements } │
└──────────────────────────┬─────────────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────────────┐
│ 3. Браузер получает результат                                  │
│    setResult(res) → перерисовка экрана победы                  │
│    setToasts → AchievementToastStack показывает ачивки         │
│    fireConfetti() при leveledUp                                │
└────────────────────────────────────────────────────────────────┘
```

Один RPC-вызов, две таблицы изменены атомарно, кеш дашборда сброшен,
тост показан — без ручного API-роута.

---

## 6. Файл за файлом

### 6.1 `prisma/schema.prisma`

Декларация всей модели данных. Prisma по этому файлу:
- генерирует TypeScript-клиент (`src/generated/prisma/`),
- создаёт миграции,
- знает структуру для `findMany`/`upsert` и т.д.

Ключевые моменты:

- `User.pinHash` — bcrypt-хеш PIN, не сам PIN.
- `UserLessonProgress` — composite primary key `[userId, lessonId]`:
  один ученик может пройти один урок одной строкой.
- `Achievement.code @unique` — стабильный строковый идентификатор,
  на который ссылаются `ACHIEVEMENT_CODES` из кода. **Никогда не
  переименовываем существующий код**, иначе разорвём прогресс уже
  выданных ачивок.
- `UserEquipped @@unique([userId, slotId])` — один предмет на слот.
  Используется для атомарной замены: `upsert` вместо `delete + create`.

### 6.2 `prisma/migrations/`

История изменений схемы. Каждая папка `<timestamp>_<name>` — одна
миграция (SQL-файл). Создаётся командой `npx prisma migrate dev`.
Применяется на чистую БД, накатывается поверх существующей.

### 6.3 `prisma.config.ts`

Конфиг Prisma 7 (заменяет старые поля `prisma` в `package.json`).
Главное здесь:

```ts
migrations: {
  seed: "node prisma/seed.ts",
}
```

— по этой строке `npx prisma db seed` запускает наш сидер. Node 22+
сам понимает TypeScript через `import` синтаксис.

### 6.4 `prisma/seed.ts` — сидер

Читает JSON-файлы из `prisma/seed-lessons/`, валидирует, и заливает
в БД. Сначала читаем и валидируем **все** файлы — упасть на битом
JSON важно **до** того, как мы что-то снесли. Только потом
`resetCatalog()` (чистит каталог + прогресс уроков) и заполнение
заново.

Ключевой кусок — извлечение `sortOrder` из имени файла:

```ts
// "03-tsikly.json" → sortOrder = 3
const prefixMatch = /^(\d+)/.exec(filename);
const fromName = prefixMatch ? parseInt(prefixMatch[1]!, 10) : NaN;
const sortOrder = data.sortOrder ?? (Number.isFinite(fromName) ? fromName : idx + 1);
```

Приоритет: явное поле в JSON → префикс имени файла → позиция в списке.

### 6.5 `prisma/seed-lessons/<категория>/`

```
scratch/
  category.json     {"name": "Scratch", "icon": "block"}
  01-vvedenie.json  ← урок
  02-dvizhenie.json
  03-tsikly.json
```

**Имя папки = слаг категории**. Внутри — `category.json` с метой и
любые `*.json` файлы, каждый — один урок:

```json
{
  "title": "Циклы и повторения",
  "xpReward": 35,
  "questions": [
    {
      "prompt": "Какой блок повторяет действие 10 раз?",
      "options": ["..."],
      "correctIndex": 1
    }
  ]
}
```

Чтобы добавить урок — создай файл и запусти `npx prisma db seed`.
Новая категория — папка + `category.json`.

### 6.6 `src/lib/db.ts` — Prisma client

Синглтон Prisma-клиента. В dev-режиме хранится на `globalThis`,
чтобы Next.js HMR не плодил по 10 коннектов:

```ts
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };
export const prisma = globalForPrisma.prisma ?? createPrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

В prod каждый процесс создаёт свой клиент один раз.

### 6.7 `src/lib/achievements.ts` — движок ачивок

Сердце геймификации. Три уровня абстракции:

**Уровень 1: реестр (`REGISTRY`)** — статический объект, ключ = код,
значение = метаданные ачивки (название, цель, награда).

```ts
const REGISTRY: Record<AchievementCode, AchievementDefinition> = {
  [ACHIEVEMENT_CODES.LESSONS_5]: {
    code: "lessons_5",
    title: "Подмастерье",
    description: "Пять уроков пройдено — рука уже не дрожит.",
    targetValue: 5,
    rewardCurrency: 50,
    icon: null,
  },
  // ...
};
```

**Уровень 2: общий движок (`applyAchievementProgress`)** — приватная
функция, делает upsert записи `Achievement`, потом в транзакции
обновляет `UserAchievement` и (если разблокировка) выдаёт ревард-валюту:

```ts
async function applyAchievementProgress(userId, code, compute) {
  const def = REGISTRY[code];
  const achievement = await prisma.achievement.upsert({ ... }); // лениво регистрируем

  return prisma.$transaction(async (tx) => {
    const existing = await tx.userAchievement.findUnique({ ... });
    if (existing?.isUnlocked) return null;  // идемпотентность

    const newProgress = Math.min(target, compute(existing?.progress ?? 0));
    const willUnlock = newProgress >= target;

    await tx.userAchievement.upsert({ ... });
    if (willUnlock && reward > 0) {
      await tx.user.update({ data: { currency: { increment: reward } } });
    }
    return willUnlock ? card : null;
  });
}
```

**Уровень 3: публичные хелперы**:

- `bumpAchievement(userId, code, delta=1)` — прибавляет `delta`,
  идеально для счётчиков событий («купил предмет», «прошёл урок»).
- `setAchievementProgress(userId, code, value)` — `Math.max(existing, value)`,
  идеально для метрик с откатами (стрик, уровень — могут падать
  и расти, но прогресс ачивки не должен уменьшаться).

Возврат: карточка `UnlockedAchievement` **только** если ИМЕННО ЭТОТ
вызов разблокировал ачивку. Иначе `null`. Удобно проксировать в тост.

### 6.8 `src/lib/actions/gamification.ts`

Server actions, связанные с уроками:

- **`completeLesson(lessonId)`** — атомарный апдейт прогресса +
  начисление XP/уровня/стрика, потом — серия `bumpAchievement` и
  `setAchievementProgress`. Возвращает `CompleteLessonResult` со
  всем, что клиент рисует на экране победы.
- **`recordCorrectAnswer(lessonId)`** — инкремент `answeredCount`
  на каждом правильном ответе. Не блокирует UI: `void recordCorrectAnswer(...)`,
  оптимистичная отрисовка идёт сразу.

Тонкость в расчёте стрика: считаем не «сколько часов прошло», а
**целые календарные дни в UTC**, чтобы сервер в другом часовом поясе
не обнулял стрик ученика:

```ts
const fromDay = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
const toDay = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
return Math.floor((toDay - fromDay) / 86_400_000);
```

### 6.9 `src/lib/actions/inventory.ts`

Server actions для лавки и наряда:

- **`equipItem(itemId, slotId)`** — `upsert` по композитному ключу
  `[userId, slotId]`. Если в слоте уже что-то надето, `update` его
  заменит автоматически (старый предмет «снимается»). После проверяем
  `slot.count() vs userEquipped.count()` — все слоты заняты? bump
  `FULL_OUTFIT`.
- **`unequipItem(slotId)`** — `deleteMany` (а не `delete`), чтобы
  двойной клик/уже-пусто не падал.
- **`buyItem(itemId)`** — самая хитрая. Транзакция: проверка владения
  (если уже куплено → silently no-op), проверка баланса, создание
  `UserInventory`, списание монет. После транзакции — `bumpAchievement(FIRST_PURCHASE)`
  с прибавкой ревард-валюты к итогу, который вернётся клиенту.

### 6.10 `src/auth.ts` + `src/auth.config.ts`

NextAuth разделён надвое **специально**: `auth.config.ts` — лёгкий
конфиг без bcrypt (его хочет Edge runtime для middleware), `auth.ts`
— полный с провайдером и зависимостью от bcrypt.

`Credentials`-провайдер кастомный: вместо email/password у нас
`{ userId, pin }`. В `authorize()` достаём `User` из БД и сравниваем
`bcrypt.compare(pin, user.pinHash)`.

Сессия — JWT, время жизни 60 минут. В `callbacks.session` в
`session.user.id` пробрасываем `token.id` — чтобы потом в server actions
вытащить через `auth()`.

### 6.11 `src/app/api/auth/[...nextauth]/route.ts`

```ts
import { handlers } from "@/auth";
export const { GET, POST } = handlers;
```

Ровно три строки. NextAuth сам строит callback-эндпоинты —
`/api/auth/signin`, `/api/auth/callback/...` и т.п.

### 6.12 `src/app/layout.tsx`

Корневой layout — оборачивает все страницы. Подключает шрифты:

```ts
const pixel = Press_Start_2P({ variable: "--font-pixel", weight: "400", subsets: ["latin"] });
const mono = VT323({ variable: "--font-mono-pixel", weight: "400", subsets: ["latin", "latin-ext"] });
```

`next/font/google` сам скачивает их в build time, кладёт локально,
в CSS подставляет CSS-переменные. В CSS-файлах потом ссылаемся на
`var(--font-pixel)`, шрифт уже на странице.

### 6.13 `src/app/page.tsx` + `ProfileSelector.tsx`

Главная (`/`) — экран выбора профиля. Серверная часть (`page.tsx`)
читает всех `User` из БД, отдаёт клиентскому `ProfileSelector`.

`ProfileSelector` (client) — выбор плитки, ввод PIN, `signIn('credentials', ...)`.
При успехе — `router.push('/dashboard')` и `router.refresh()`
(второе нужно, чтобы серверные компоненты увидели свежую сессию).

Если уже залогинен (`session.user.id` есть) — `redirect('/dashboard')`.

### 6.14 `src/app/dashboard/page.tsx`

Главный экран — большой server component. Параллельные запросы:

```ts
const [user, lessons, progressRows, equipped] = await Promise.all([
  prisma.user.findUnique({ ... }),
  prisma.lesson.findMany({ ... }),
  prisma.userLessonProgress.findMany({ ... }),
  prisma.userEquipped.findMany({ ... }),
]);
```

Затем «обогащаем» сырые уроки декорациями (глифы, описания,
сложность) — тех, что в БД нет:

```ts
const DECORATIONS = [
  { glyph: "function() {}\n  return ✦;", desc: "...", seeds: 200, diff: 2 },
  // ...
];
function pickDecoration(index: number) {
  return DECORATIONS[index] ?? FALLBACK_DECORATION;
}
```

И отдаём в три панели: `AvatarPanel` (профиль слева), `QuestGrid`
(сетка квестов в центре), `MascotPanel` (снегирь справа).

### 6.15 `src/app/lesson/[id]/page.tsx` + `QuestRunner.tsx`

Динамический маршрут — `[id]` парсится из URL. Серверная страница:
авторизация, парсит `lesson.content` (JSON-строка с вопросами),
upsert-ит `UserLessonProgress` (чтобы дашборд показал статус ACTIVE
сразу, как ученик зашёл в урок).

Дальше — клиентский `QuestRunner`. Логика:

1. Хранит индекс текущего вопроса `step`, выбранный вариант `picked`.
2. На неправильный ответ — `setShake(n => n+1)` (через `key=`shake-${shake}`
   реагт пересоздаёт DOM-узел и встряхивает).
3. На правильный — оптимистично двигаемся вперёд, в фоне `recordCorrectAnswer`.
4. Последний правильный ответ → `completeLesson` → экран Victory + конфетти при ап-уровня
   + тосты ачивок.

### 6.16 `src/app/shop/page.tsx` + `ShopClient.tsx`

Серверная часть собирает данные о предметах (включая то, кому какой
слот подходит), о владении (`UserInventory`) и о надетом (`UserEquipped`).
Клиентская — рисует «примерочную» (живой снегирь с надетыми вещами)
и сетку карточек.

Состояния карточки:
- **Не куплен и не хватает монет** → серая «НЕ ХВАТАЕТ» (`is-locked` CSS).
- **Не куплен и можно купить** → яркая золотая «КУПИТЬ N ⭐».
- **Куплен, но не надет** → красная «НАДЕТЬ».
- **Надет** → золотая «СНЯТЬ».

Все три действия (`buyItem`, `equipItem`, `unequipItem`) — server actions
с оптимистичным UI и общим `<AchievementToastStack>` снизу.

### 6.17 `src/app/achievements/page.tsx` + `achievements.css`

Трофейная комната. Берёт **полный реестр** из `ACHIEVEMENT_LIST` и
подмешивает прогресс пользователя:

```ts
const dbAchievements = await prisma.achievement.findMany({
  where: { code: { in: codes } },
  select: {
    code: true,
    users: { where: { userId }, select: { progress: true, isUnlocked: true, unlockedAt: true } },
  },
});
```

Открытые карточки — золотые с печатью «ОТКРЫТО», закрытые — серые
с замочком. Если у ачивки `targetValue > 1` — рисуем прогресс-бар.

Важно: реестр — единственный источник истины полного списка. Записи
в `Achievement` могут отсутствовать, пока их не «потрогали»
`bump/set` — поэтому лево-присоединяем не от БД, а от реестра.

### 6.18 Компоненты UI

- **`PixelSprite.tsx`** — берёт ASCII-карту (`["..K..", ".KKK.", "K.G.K"]`)
  и палитру (`{ K: "#1a0f06", G: "#ecb84a", ".": null }`),
  рендерит сетку CSS-grid из квадратиков. Используется для иконок
  навигации, монет, флага.

- **`Mascot.tsx`** — снегирь. Те же ASCII + палитра, но через SVG `<rect>`,
  потому что нужны накладывающиеся слои (шапка-ушанка, шарф). При
  `jumping` — GSAP-таймлайн с прыжком и качанием.

- **`ProgressBar.tsx`** — клиентский компонент над `.bar`/`.bar-fill`
  из CSS. Анимирует ширину через GSAP с `elastic.out(1, 0.3)` —
  заполнение «выстреливает» и упруго оседает. На первом mount без
  анимации (`mountedRef`).

- **`AchievementToast.tsx` + `.css`** — стек тостов в правом нижнем
  углу. Каждый тост сам себя удаляет через 6 секунд (или по крестику).
  CSS живёт **рядом с компонентом**, импортируется самим `.tsx` —
  поэтому работает на любой странице.

- **`dashboard/Header.tsx`** — деревянная полоса вверху с монетами и
  стриком (через `PixelSprite`).

- **`dashboard/NavRail.tsx`** — левая панель. Пункты с `href` —
  `<Link>` (Карта/Уроки → `/dashboard`, Лавка → `/shop`, Трофеи →
  `/achievements`), без `href` — disabled-кнопки. Активный пункт
  определяется через `usePathname()`.

- **`dashboard/AvatarPanel.tsx`** — слева: имя, ранг, EXP-бар,
  мини-стат-блоки.

- **`dashboard/MascotPanel.tsx`** — справа: снегирь на «пьедестале»,
  бар affinity, кнопки «КОРМИТЬ» (заглушка) и «НАРЯДИТЬ» → `/shop`.

- **`dashboard/QuestGrid.tsx`** + **`QuestCard.tsx`** — сетка
  карточек уроков. У `QuestCard` четыре статуса (`active`,
  `completed`, `new`, `locked`) — каждый с своим цветом тега, фолл-цветом
  бара и текстом кнопки. Клик ведёт на `/lesson/[id]`. На hover —
  GSAP-увеличение и золотая обводка.

- **`auth/ProfileSelector.tsx`** — плитки профилей + форма PIN.

### 6.19 CSS-файлы

Тут много пиксельной стилистики. Главные приёмы:

- **CSS-переменные** в `.cc-root` (`--gold`, `--ink`, `--parchment` ...)
  — общая палитра.
- **Многослойные `box-shadow`** через `inset 0 0 0 N color`,
  чтобы из обычной рамки сделать «гравированную» с двойной обводкой.
- **`image-rendering: pixelated`** — глобально на корне, чтобы скейл
  не размывал.
- **`font-family: var(--font-pixel)`** vs `var(--font-mono-pixel)` —
  Press Start 2P для лейблов, VT323 для текста и цифр.

---

## 7. Как добавить контент (урок)

1. Открой нужную папку в `prisma/seed-lessons/`. Если категории нет —
   создай папку и `category.json`:
   ```json
   { "name": "CSS", "icon": "palette" }
   ```

2. Создай `NN-name.json`, где `NN` — номер по порядку:
   ```json
   {
     "title": "Селекторы",
     "xpReward": 35,
     "questions": [
       {
         "prompt": "Какой селектор выбирает все <p>?",
         "options": ["#p", ".p", "p", "*p"],
         "correctIndex": 2
       }
     ]
   }
   ```

3. `npx prisma db seed`. Сидер:
   - Прочитает все JSON, провалидирует.
   - Если хоть один файл битый — упадёт ДО очистки.
   - Сбросит каталог и пересоздаст.

4. Обнови страницу дашборда — урок появится.

Бюджет ошибок: валидатор покажет файл и индекс вопроса с проблемой.
Это спасает от опечаток в массовом редактировании.

---

## 8. Как добавить новую ачивку

Например, «купил 3 предмета».

1. **`src/lib/achievements.ts`** — добавь код и запись в реестр:
   ```ts
   export const ACHIEVEMENT_CODES = {
     // ...
     ITEMS_3: "items_3",
   } as const;

   const REGISTRY = {
     // ...
     [ACHIEVEMENT_CODES.ITEMS_3]: {
       code: ACHIEVEMENT_CODES.ITEMS_3,
       title: "Коллекционер",
       description: "Купил три предмета.",
       icon: null,
       targetValue: 3,
       rewardCurrency: 75,
     },
   };
   ```

2. **Подключи к событию** — в `buyItem` после успешной покупки:
   ```ts
   if (result.purchased) {
     unlockedAchievements.push(
       await bumpAchievement(userId, ACHIEVEMENT_CODES.FIRST_PURCHASE),
     );
     unlockedAchievements.push(
       await bumpAchievement(userId, ACHIEVEMENT_CODES.ITEMS_3),
     );
   }
   ```

   Готово. Никаких миграций — Prisma создаст запись `Achievement` при
   первом срабатывании. В `/achievements` появится новая карточка
   автоматически (она читает реестр, а не БД).

**Когда `bump`, когда `set`?**
- **bump** — событие («купил», «прошёл урок»). Каждый вызов = +1
  к собственному счётчику ачивки.
- **set** — снапшот метрики, которая может откатываться («стрик 5»,
  «уровень 4»). Берёт `Math.max(existing, value)`, не уронит уже
  накопленное.

---

## 9. Как запустить и отладить

```sh
# Установка
npm install

# Применить миграции к dev.db
npx prisma migrate deploy

# Заполнить контентом
npx prisma db seed

# Дев-сервер
npm run dev          # http://localhost:3000
```

Тестовый ученик из `seed.ts`:
- ID: `user-123`
- Имя: «Иван Иванов»
- PIN: **1234**

Полезное:

- **Поменял `prisma/schema.prisma`** → `npx prisma migrate dev --name <change>` + перезапусти dev-сервер (Prisma-клиент кешируется HMR-ом).
- **Поменял JSON урока** → `npx prisma db seed` + обнови страницу.
- **Странное поведение в dev** → смотри в `.next/`: Turbopack-кеш иногда живёт своей жизнью; удали папку и перезапусти.
- **Тосты не появляются на новой странице** → импортируй `AchievementToast.tsx`, его CSS подтянется автоматически.

---

## 10. Что дальше

Прямо сейчас на проекте есть три направления:

1. **Реальный контент** — заполнить пайплайн `seed-lessons/` 56-ю
   уроками курса (Scratch 32 + HTML 8 + JS 16). Это работа с
   контентом, не с кодом.

2. **Категорийные ачивки** (`SCRATCH_DONE`, `HTML_DONE`, `JS_DONE`) —
   когда контент будет в БД, добавим: в `completeLesson` смотрим
   `lesson.categoryId`, бампаем нужный код. Реестр уже знает, как
   принять новые записи.

3. **Sandbox / Live-редактор кода** — для HTML/JS-блока курса:
   monaco-editor + iframe-санбокс, валидаторы под каждое задание.
   Это большой проект, имеет смысл когда ученики дойдут до HTML.

4. **Teacher Dashboard** — когда появятся реальные группы. Требует
   модели «учитель/класс/ученик» в схеме (сейчас её нет).

Метод работы прежний: одна тема → план → код → коммит → следующая.
