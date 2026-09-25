# АРХИВ: прогресс «Кванториум» — точка возврата

> Исторический документ. Актуальная дорожная карта: `docs/ROADMAP.md`.

> Образовательная геймифицированная платформа (стиль **Duolingo**) для детей.
> Обновлено: 2026-06-23.

---

## 🧭 Что это за проект (контекст)

- **Функциональная основа** — старый проект пользователя `Site4ekRealm`
  (codeberg.org/LeonidZaharov/Site4ekRealm). Это та же «quantorium», почти готовая.
  Перенесён в эту папку; прежний пустой проект лежит в `_archive_old_project/`.
- **Стек:** Next.js 16.2 + Prisma 7 (adapter-pg) + next-auth v5 (вход ник+ПИН) +
  Tailwind 4 + Supabase.
- **Дизайн-образец** — `duolingo-clone` (sanidhyy/duolingo-clone). Лежит локально в
  `duo/duolingo-clone-main/` (и копия в `G:\_ref_duo`). Берём ТОЛЬКО визуал/UX,
  **бэкенд не меняем** (остаёмся на Prisma/next-auth/Supabase, НЕ Drizzle/Clerk).
- **Решение по объёму:** чистый Duolingo — **убрать** маскот-снегиря, магазин,
  инвентарь, экипировку, пиксель-спрайты (Ranger). Оставить: уроки, XP, уровни,
  сердца, streak, лидерборд. Поле `currency` и `Achievement.rewardCurrency — оставляем.
- **UX главного экрана:** как у Duolingo — отдельный `/courses` (выбор курса из 3
  категорий: Робототехника / IT / Промдизайн), затем `/learn` показывает уроки
  активного курса вертикальной змейкой круглых кнопок. **Активный курс храним в
  cookie** (без миграции схемы); нет cookie → redirect на `/courses`.

---

## ✅ Что уже сделано

1. **База поднята на Supabase и работает вживую.**
   - `.env` заполнен. Внимание: прямой хост `db.<ref>.supabase.co` доступен только
     по IPv6 (которого в сети нет) → используем **пулер по IPv4**
     `aws-1-eu-central-1.pooler.supabase.com` (DATABASE_URL=6543 `?pgbouncer=true`,
     DIRECT_URL=5432). Пароль БД в `.env`.
   - Миграции применены, БД засеяна: 3 user, 3 category, 5 lesson, 13 achievement.
   - `npm install`, `prisma generate`, `npm run check-env`, `tsc --noEmit` — всё ОК.
   - `npm run dev` → `GET / 200`, ошибок нет.
2. **Фаза «Фундамент Duolingo-дизайна» — готова и проверена (tsc=0):**
   - `src/lib/utils.ts` — `cn()` (clsx + tailwind-merge).
   - `src/components/ui/button.tsx` — фирменная объёмная Duolingo-кнопка (варианты
     primary/secondary/danger/super/ghost/sidebar, `border-b-4 active:border-b-0`).
   - `src/app/globals.css` — Tailwind 4 тема: шрифт Nunito, зелёная палитра,
     токены `--color-ring/--color-primary-foreground/--color-brand`.
   - `src/app/layout.tsx` — шрифт **Nunito** (latin+cyrillic) вместо пиксельного.
   - Установлены: class-variance-authority, clsx, tailwind-merge, lucide-react,
     @radix-ui/react-slot.
3. **Гигиена:** `duo/` и `_archive_old_project/` добавлены в `.gitignore`,
   `tsconfig.json` (exclude) и eslint ignores — чтобы не ломали tsc/lint/build.

---

## ⏳ Что доделать (по порядку — чтобы сборка не падала)

### Шаг A — Layout + первые экраны ✅ ГОТОВО (2026-06-23, tsc=0, lint=0, роуты 307→login)
Созданы **новые роуты рядом со старыми** (ничего не сломано):
- `src/app/(main)/layout.tsx` — MobileHeader + Sidebar + main-обёртка (`lg:pl-[256px]`).
- `src/components/sidebar.tsx` (async server, тянет имя из `auth()`, форма signOut),
  `sidebar-item.tsx` (client, активный пункт по `usePathname`, иконки lucide по ключу),
  `mobile-header.tsx` + `mobile-sidebar.tsx` (лёгкий drawer на useState, БЕЗ Radix/Sheet),
  `feed-wrapper.tsx`, `sticky-wrapper.tsx`, `user-progress.tsx` (курс/streak/XP/сердца).
- `src/lib/active-course.ts` — константа имени cookie `activeCourseId` (отдельный модуль,
  т.к. "use server"-файл экспортирует только async-функции).
- `src/lib/actions/course.ts` — server action `setActiveCourse(id)`: `requireUser` +
  валидация id + проверка существования категории → `cookies().set` → `redirect('/learn')`.
- `src/app/(main)/courses/{page,list,card}.tsx` — карточки категорий (Prisma), клик → экшен.
- `src/app/(main)/learn/{page,header,unit-banner,lesson-button}.tsx` — змейка уроков
  активного курса. Данные из Prisma (Category + lessons + `progress where userId`).
  Текущий урок = первый незавершённый; до него completed, после — locked. Кольцо прогресса
  на SVG (без react-circular-progressbar). Уроки ведут на существующий `/lesson/[id]`.
- `auth.config.ts` — в protected добавлены `/learn`, `/courses`.
- ⚠️ **Сердца** в `user-progress`/`learn` — заглушка `5` (в схеме поля нет). Решить на Шаге C.

### Шаг B — Удалить пиксель-слой ⏳ ЧАСТИЧНО ГОТОВО (2026-06-23, tsc=0)
**Важно (порядок!):** пиксель-слой переплетён с экраном урока. `QuestRunner.tsx`
(`/lesson/[id]`) ВСЁ ЕЩЁ использует `Ranger`/`ranger-frames`/`ranger.ts` и ассеты
`public/ranger/*` (грузятся как `/ranger/<variant>/<anim>.png`). Поэтому их удаление
**перенесено в Шаг D** (вместе с переписыванием урока) — иначе падает сборка.

✅ Удалено сейчас (безопасно, ничего не ссылается): `src/app/dashboard/`,
`src/app/shop/` (page+ShopClient+css), `src/components/dashboard/` целиком
(AvatarPanel, MascotPanel, Header, NavRail, QuestCard, QuestGrid, sprites.ts),
`src/components/PixelSprite.tsx`, `src/lib/actions/inventory.ts`,
корневые `UI/` и `img/` (старый макет Cyber Citadel + маскот).
✅ Правки: `auth.config.ts` protected → `['/lesson','/achievements','/learn','/courses']`
(убраны `/dashboard`,`/shop`,мёртвый `/lessons`). Все `/dashboard` → `/learn`
в `page.tsx` (+ убран импорт dashboard.css), `ProfileSelector`, `gamification.ts`
(2× revalidatePath), `QuestRunner` (2× back-link), `achievements/page.tsx`.

✅ Ranger-слой удалён на Шаге D (см. ниже). Lint по всему `src` теперь = 0.

### Шаг D — Экран урока в стиле Duolingo ✅ ГОТОВО (2026-06-23, tsc=0/lint=0, live-прогон)
Переписан экран урока `/lesson/[id]` под Duolingo + удалён последний пиксель-слой.
- `src/app/lesson/layout.tsx` — полноэкранный layout урока (без сайдбара).
- `QuestRunner.tsx` переписан: флоу «выбор варианта → **Проверить** → подсветка
  верно/неверно + footer → **Далее/Повторить**», прогресс-бар + сердца в шапке,
  экран результата (ResultCard XP/сердца, конфетти `canvas-confetti`, бейдж
  «Новый уровень»), бейдж «Тренировка» для пройденных. Серверные экшены
  `recordCorrectAnswer`/`completeLesson` и тосты ачивок сохранены.
  Сердца — **клиентская заглушка `MAX_HEARTS=5`** (проигрыш не блокируем).
- Новые компоненты: `lesson/[id]/{header,card,challenge,footer,result-card}.tsx`,
  `src/components/ui/progress.tsx` (лёгкий бар без Radix).
- `page.tsx` упрощён (убраны ranger/xp-level/categoryName).
- 🗑 Удалено окончательно: `Ranger.tsx|.css`, `ranger-frames.ts`, `lib/ranger.ts`,
  `public/ranger/*`, сломанный `components/ProgressBar.tsx`, `lesson/[id]/lesson.css`.
- 🎨 **Бонус:** экран входа `ProfileSelector.tsx` перерисован в Duolingo-стиле
  (Tailwind+Button) — его старый pixel-CSS (`dashboard.css`) был удалён на Шаге B,
  логин остался бы без стилей. Заодно починен баг `set-state-in-effect`.
- ✅ Live-прогон (PIN тест-юзера `user-123` сброшен на 1234): login → /courses
  (3 категории) → /learn (cookie-gating, змейка) → /lesson (Duolingo-квиз). Без ошибок.

✅ **`/achievements` перерисована в Duolingo (2026-06-23, tsc=0/lint=0):** перенесена
под route-group → `src/app/(main)/achievements/page.tsx` (получила сайдбар), старая
`src/app/achievements/` (+`achievements.css`) удалена. Карточки на наших компонентах
(`Progress`, Tailwind): иконка Trophy, статус Выполнено/В процессе/Закрыто, прогресс
N/target, награда ⭐, дата. Серверная выборка ачивок не менялась. **Пиксельных
экранов в авторизованной части больше НЕТ.**

✅ **Мёртвый спрайт-пайплайн убран (2026-06-30):** удалён `scripts/build-sprites.mjs`,
строка `"build-sprites"` из `package.json`, лишняя прямая зависимость `sharp` из
devDependencies (Next тянет её сам как optional) и мёртвый блок про `/assets` в
`.gitignore`. tsc=0/lint=0. 🔻 Остаётся: категории в БД пока HTML/JavaScript/Scratch
(сид), не Робототехника/IT/Промдизайн — это решение, не баг.

### Шаг C — Схема + миграция ✅ ГОТОВО (2026-06-23, db push, tsc=0, данные целы)
- Из `schema.prisma` удалены модели **Slot/InventoryItem/ItemSlot/UserInventory/
  UserEquipped** + связи **User.inventory/equipped**. `currency` и
  `Achievement.rewardCurrency` оставлены. `prisma/seed.ts` очищен от слотов/предметов.
- ⚠️ **Дрейф миграций:** на боевой Supabase-БД оказалась применена 3-я миграция
  `20260605204204_add_wrong_attempts` (колонка `UserLessonProgress.wrongAttempts`
  int NOT NULL DEFAULT 0), которой НЕТ ни в локальной `prisma/migrations` (там 2),
  ни в схеме. `migrate dev` из-за этого требовал **reset** — отказались.
  Решение (выбор юзера): добавил `wrongAttempts Int @default(0)` в схему +
  **`prisma db push --accept-data-loss`** → 5 таблиц инвентаря дропнуты, остальные
  данные целы (users=3, categories=3, lessons=5, progress=10, achievements=13),
  `prisma generate` ок. **Долг:** инвентарь-дроп НЕ записан в историю миграций;
  `prisma/migrations` всё ещё без `add_wrong_attempts` → следующий `migrate dev`
  снова увидит дрейф. Перед возвратом к migrate-флоу историю надо ре-baseline'нуть
  (или `migrate diff`-ом собрать недостающее). `wrongAttempts` кодом не используется.
- ✅ **Долг закрыт ре-baseline'ом (2026-06-30):** живая БД совпадала со схемой
  (`migrate diff` пуст), врала только история. Свернул 2 старых файла + 3 записи в
  `_prisma_migrations` в одну стартовую `0_init` (сгенерирована из схемы:
  без инвентаря, с `wrongAttempts`). Очистил `_prisma_migrations` (бэкап снят,
  реальные таблицы не тронуты) и пометил `0_init` применённой через
  `migrate resolve --applied`. Проверка: `migrate status` = up to date (1 миграция),
  `diff` пуст. `migrate dev` для будущих таблиц (Resource, ачивки) теперь не требует reset.
- 🪤 `prisma/seed.ts` запускать только с `SEED_FORCE=1` — он чистит каталог. Guard
  (existingProgress>0 → exit) проверен в бою, данные защищает.

### Шаг D — Экран урока в стиле Duolingo ✅ (см. выше, готово до Шага C)

### Шаг E — Прочее (в работе)
- ✅ **«Интересное» → в БД (2026-06-30, tsc=0/lint=0):** материалы блока перенесены
  из статичного `resources.ts` в новую модель Prisma **`Resource`** (+ enum `ResourceType`:
  scratch/video/article/note, поле `sortOrder`). Это первое чистое изменение схемы
  после ре-baseline: миграция `20260630221629_add_resources` сгенерирована
  `migrate diff --from-config-datasource --to-schema` (т.к. `migrate dev` на Supabase-пулере
  упирается в shadow-БД) и применена `migrate deploy` (только CREATE, без потери данных).
  Стартовые 4 материала залиты идемпотентным `scripts/seed-resources.mjs`
  (`npm run seed-resources`; НЕ трогает уроки, в отличие от `prisma/seed.ts`).
  `interesting/page.tsx` читает из БД (`findMany orderBy sortOrder`) + пустое состояние;
  `resources.ts` удалён, типы берутся из Prisma-клиента. 🔻 Следующий шаг — админка для
  добавления/правки материалов (и уроков) через UI.
- ✅ **Админка «Интересного» (2026-07-06, tsc=0/lint=0/26 тестов, live-прогон доступов):**
  - Схема: поле **`User.isAdmin`** (миграция `20260706190139_add_user_is_admin`,
    сгенерирована `migrate diff --from-config-datasource --to-schema` + `migrate deploy` —
    тот же обход shadow-БД, что и для Resource).
  - Аккаунт наставника: `create-user.mjs` научен флагу `--admin`; создан юзер
    **«Наставник»** (id `5c68d188-2ef9-48b9-bf28-849aee0410af`), PIN сообщён владельцу.
  - Guard'ы в `server-guard.ts`: `requireAdmin()` (для actions, флаг из БД на каждый
    вызов — не из JWT) и `requireAdminOr404()` (для страниц: ученикам 404).
  - UI: `src/app/(main)/admin/resources/` — список (`page.tsx` + `delete-button.tsx`
    с confirm), создание `new/`, правка `[id]/`; общая форма `resource-form.tsx`
    (useActionState, поля зависят от типа). `/admin` добавлен в protected
    (auth.config), пункт «Админка» (Wrench) в сайдбаре виден только админу.
  - Actions `src/lib/actions/resources.ts`: `saveResource` (create/update одной формой)
    + `deleteResource`, оба под `requireAdmin`, `revalidatePath('/interesting')`.
  - Нормализация ссылок в чистом `src/lib/resource-input.ts` (+13 vitest-тестов):
    YouTube (watch/youtu.be/shorts/embed → 11-символьный ID), Scratch (URL → номер
    проекта), article — только https, note — обязателен текст. Ошибки — русские фразы.
  - Live-прогон: аноним → 307 на логин; ученик → 404 и без пункта в сайдбаре;
    наставник → 200, список/формы рендерятся, несуществующий id → 404.
  - 🔻 Дальше по админке: управление уроками (create/edit через UI).
- ✅ **Стрик убран полностью (2026-07-06, tsc=0/lint=0/19 тестов, live-прогон):**
  решение пользователя — при занятиях 2–3 раза в неделю серия дней всегда рвалась
  и демотивировала. Мотивация теперь: XP/уровни/ачивки + **монеты** (см. план ниже).
  - Удалено: расчёт стрика в `auth.ts` (логин) и `completeLesson`; `nextStreak`/
    `fullDaysBetween` из `gamification-logic.ts` (+7 их тестов); ачивки STREAK_3/7
    из реестра И из БД (6 записей прогресса + 2 ачивки; выданные монеты не отбирали);
    огонёк из `user-progress` (/learn), профиля, экрана выбора профиля; вкладка
    «По стрику» из лидерборда (остался топ по XP, `searchParams` больше не нужен).
  - Схема: колонка `User.streakDays` дропнута (миграция `20260706201504_drop_streak`).
    **`lastActiveDate` оставлен** и обновляется при логине и завершении урока —
    пригодится наставнику («кто давно не заходил»).
  - 🔻 В реестре остались мёртвые ачивки FIRST_PURCHASE/FULL_OUTFIT (лавка/снегирь
    удалены) — кандидаты на чистку при следующем заходе в ачивки.
- 📋 **План «экономика монет» (решения 2026-07-06, обсуждено):** стрик заменяем
  монетами; магазин — ОФЛАЙН у наставника (наклейки/привилегии, без кода; идеи
  «аватарка за 300, статус за 100» — потом). Тарифы: урок = 5 монет (только за
  ПОЛНОЕ первое прохождение, без пропорциональных начислений — осознанно),
  «Интересное»: совет 1 / Scratch 2 / видео 3 (разово за материал → нужна кнопка
  «Изучил» + таблица UserResource + поле coinReward у Resource в админке).
  Очередь: монеты за урок → «Изучил» в Интересном → админка уроков.
- ✅ **Монеты за урок (2026-07-06, tsc=0/lint=0/19 тестов, live /learn 200):**
  поле **`Lesson.coinReward`** (default 5, миграция `add_lesson_coin_reward`;
  все 5 уроков в БД получили 5). Начисление в `completeLesson` рядом с XP —
  только за первое полное прохождение, повтор = 0; в user.update монеты идут
  `increment` (не абсолютным значением), чтобы не затирать начисления ачивок.
  `CompleteLessonResult.gainedCoins` → на экране результата урока третья
  карточка «Монеты» (`result-card.tsx` переписан на мапу VARIANT_META:
  points/coins/hearts). Счётчик монет (Coins, amber) добавлен в `user-progress`
  на /learn (select currency). Категории в живой БД: id 8=HTML, 9=JS, 10=Scratch.
  🔻 Проставить осмысленные coinReward per-урок можно будет в админке уроков.
- ✅ **Кнопка «Изучил» в «Интересном» (2026-07-06, tsc=0/lint=0/20 тестов, live):**
  поле **`Resource.coinReward`** (default 1) + таблица **`UserResource`**
  (PK userId+resourceId, onDelete Cascade от Resource) — миграция
  `add_resource_study` со встроенным UPDATE: существующим материалам тарифы
  по типу (видео 3 / Scratch 2 / совет и ссылка 1; `DEFAULT_COIN_REWARD` в
  `resource-input.ts`). Экшен `studyResource` (`src/lib/actions/study.ts`):
  разовое начисление в транзакции, повтор/гонка гасятся P2002 по PK
  (проверено вживую на временном юзере: 1-й клик +1, 2-й — не начислил).
  UI: `study-button.tsx` (client) на карточке — «Изучил +N» → бейдж
  «Изучено ✓» после revalidate; в форме админки поле «Монеты за Изучил»
  (key=type: при смене типа в создании подставляется тариф). Сид
  seed-resources.mjs обновлён. live: /interesting 200 с 7 кнопками,
  форма админки с полем — 200.
- ✅ **Хвостики (2026-07-06, tsc=0/lint=0/20 тестов, live):**
  - **Страница «Активность» в админке** (`/admin/activity`): ученики с XP/
    монетами/последним входом (`lastActiveDate`, сортировка nulls last) +
    последние 30 отметок «Изучил» с временем (`studiedAt`) — фарм «7 отметок
    за минуту» виден глазами; контроль социальный, не программный (решение
    после обсуждения «как проверить, что реально изучил»: уровень 1 из
    лесенки; уровень 2 — вопрос-проверка к материалу — в кармане на случай
    массового фарма). Перекрёстные ссылки: ресурсы ↔ активность.
  - **Чистка мёртвых ачивок в БД до полного совпадения с реестром (8=8):**
    удалены first_purchase «Первый артефакт» (full_outfit в БД не было) и
    два «призрака» старого проекта perfect_lesson «Безупречно» /
    perfectionist_10 «Перфекционист» (механика «без ошибок» удалена давно;
    у user-123 был unlocked — монеты не отбирали). Реестр: FIRST_PURCHASE/
    FULL_OUTFIT удалены из кода.
  - Лекция `lectures/07-админка-монеты-изучил.md` (в .gitignore).
- ✅ **Лидерборд (2026-06-23, tsc=0/lint=0, live 200):** `src/app/(main)/leaderboard/page.tsx`
  — топ-10, аватар-инициалы, ранг (top-3 цветной), подсветка текущего юзера «(ты)».
  **Вкладки XP / стрик** через URL-параметр `?sort=xp|streak` (остаётся серверным
  компонентом, без клиентского state; вкладки = `<Link>`, RSC-навигация). Пункт
  «Лидерборд» (Medal) в `sidebar.tsx`/`sidebar-item.tsx`, `/leaderboard` — в protected.
  (RankerHub как образец отвергли: Firebase/Firestore/Vite — чужой стек; берём только
  идею разрезов.)
- ✅ **Профиль (2026-06-23, tsc=0/lint=0, live 200):** `src/app/(main)/profile/page.tsx`
  — аватар-инициалы, имя, «В Кванториуме с {дата}», сетка статов (стрик/XP/уровень/
  уроков пройдено/достижения X/Y/монеты), кнопка «Выйти» (server action signOut).
  Пункт «Профиль» (иконка User) в сайдбаре, `/profile` — в protected.
- ✅ **`npm run build` зелёный (2026-06-23):** компиляция + TypeScript + генерация
  страниц без ошибок/ворнингов. Все роуты `/`,`/achievements`,`/courses`,`/leaderboard`,
  `/learn`,`/lesson/[id]`,`/profile` — динамические (ƒ), `/_not-found` — статика.
- ✅ **ЗАДЕПЛОЕНО В ПРОД (2026-06-23): https://quantorium.vercel.app** — READY, новый
  Duolingo-UI вживую, та же Supabase-БД. Проект `quantorium` (аккаунт leonidzaharov),
  папка слинкована (`vercel link`). `migrate deploy` отработал (2 локальные миграции
  уже применены → no-op; инвентарь-дроп через db push в истории нет, deploy не ломает).
  ⚠️ **Был затык:** прод-env на Vercel (18 дней) имел УСТАРЕВШИЕ креды БД → `migrate
  deploy` падал `P1000 auth failed`. Лечение: перезаписал прод `DATABASE_URL`+`DIRECT_URL`
  рабочими значениями из локального `.env` (`vercel env rm/add`), AUTH_SECRET не трогал.
  Env заданы ТОЛЬКО для Production (Preview/Dev пустые → превью-деплой упадёт на check-env).
  ➕ Добавил `.vercelignore` (.env/duo/_archive) — Vercel ругался, что подхватил `.env`
  в бандл (применится со следующим деплоем). 🔻 На Vercel висит старый проект `cyber-citadel`.
- ✅ Мелочь закрыта (2026-06-30): мёртвый `scripts/build-sprites.mjs` +
  `package.json"build-sprites"` + лишняя зависимость `sharp` удалены.

---

## 🔧 Полезное
- Запуск: `npm run dev` (http://localhost:3000). Логи dev — в `_devlog.txt`.
- Проверка окружения: `npm run check-env`. Типы: `npx tsc --noEmit`.
- Засветился `sb_secret_…` ключ Supabase в чате — **сделать Rotate** в дашборде
  (нашему стеку Supabase API-ключи не нужны, Prisma ходит в Postgres напрямую).
- Задачи трекаются в тул-листе: #1 done, #2–#5 — по шагам B/C/A/D выше.
