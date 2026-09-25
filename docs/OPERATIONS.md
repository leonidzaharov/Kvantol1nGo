# Эксплуатация

В инструкциях сначала приведены команды для Git Bash — это основной терминал
проекта. Ниже дан эквивалент для PowerShell. В Git Bash используются `npm` и
`npx`, в PowerShell — `npm.cmd` и `npx.cmd`.

## Пользователи и PIN

Создать ученика:

```bash
npm run create-user -- --name="Имя ученика" --pin=1234
```

PowerShell:

```powershell
npm.cmd run create-user -- --name="Имя ученика" --pin=1234
```

Создать наставника:

```bash
npm run create-user -- --name="Наставник" --pin=12345678 --admin
```

PowerShell:

```powershell
npm.cmd run create-user -- --name="Наставник" --pin=12345678 --admin
```

Сменить PIN:

```bash
npm run rotate-pin -- --name="Имя ученика" --pin=4321
```

PowerShell:

```powershell
npm.cmd run rotate-pin -- --name="Имя ученика" --pin=4321
```

При совпадающих именах используйте `--user-id=<uuid>`. PIN ученика содержит
ровно 4 цифры, PIN наставника — 8–10 цифр. Команды не выводят хеш PIN.

## Миграции

После изменения `prisma/schema.prisma` создайте отдельную миграцию и проверьте её
на тестовой среде. В production применяется только:

```bash
npx prisma migrate deploy
```

PowerShell:

```powershell
npx.cmd prisma migrate deploy
```

`prisma db push` не является production-процессом. Перед потенциально
разрушительной миграцией обязательно снимите резервную копию.

## Staging

Staging работает как ручной Vercel Preview и использует отдельный
Supabase-проект без данных настоящих учеников. Пока GitHub-репозиторий не
подключён к Vercel, переменные относятся ко всем Preview-деплоям проекта;
Production они не затрагивают:

- `DATABASE_URL`, `DIRECT_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` —
  только от staging-проекта;
- `AUTH_SECRET` — отдельный случайный секрет;
- `KVANTO_DEPLOYMENT_ENV=staging`;
- `STAGING_DATABASE_CONFIRM=isolated-test-data`;
- `STAGING_ADMIN_PIN` и `STAGING_STUDENT_PIN` — только для тестовых профилей.

`npm run vercel-build` выполняет `check-env` до `prisma migrate deploy`. Поэтому
Preview без двух явных staging-подтверждений остановится до изменения БД.
Проверка также сверяет, что три Supabase URL принадлежат одному проекту.

Первый Preview создаётся вручную и не заменяет production:

```bash
npx vercel --yes
```

PowerShell:

```powershell
npx.cmd vercel --yes
```

Чувствительные Preview-переменные Vercel нельзя выгрузить обратно через
`vercel env run`. Поэтому `seed:staging` запускается техническим исполнителем с
одноразовой передачей переменных через stdin, без `.env` и без вывода значений в
терминал. Seed не очищает таблицы и повторяем. Он прекращает работу до любых
изменений, если обнаруживает хотя бы один профиль, не созданный staging seed.
Создаются два вымышленных ученика, тестовый наставник, курс, материал
«Интересного» и ручная работа. PIN в журнал не выводятся.

Vercel Authentication для проекта намеренно отключена, чтобы дети могли открыть
Preview без аккаунта Vercel. Поэтому все текущие и будущие технические URL этого
Vercel-проекта доступны публично, но само приложение по-прежнему требует PIN
KvantoLingo. Не используйте в Preview настоящие профили и данные учеников.

## Резервные копии

Создать локальный JSON-бэкап:

```bash
npm run backup
```

PowerShell:

```powershell
npm.cmd run backup
```

Файлы попадают в `backups/`, не коммитятся и содержат персональные данные.
Скрипт хранит последние 60 копий.

Сначала выполнить сухой прогон восстановления:

```bash
npm run restore
```

PowerShell:

```powershell
npm.cmd run restore
```

Реальная запись требует явного `--yes` и перезаписывает данные:

```bash
npm run restore -- --file backups/backup-YYYY-MM-DD.json --yes
```

PowerShell:

```powershell
npm.cmd run restore -- --file backups/backup-YYYY-MM-DD.json --yes
```

Предпочтительно сначала восстановить копию в отдельную схему через `--to`, затем
проверить число пользователей, уроков и записей прогресса.

Автоматическая безопасная проверка механизма восстановления использует только
синтетические данные, создаёт временные схемы и удаляет их после сверки:

```bash
npm run verify:restore:synthetic
```

PowerShell:

```powershell
npm.cmd run verify:restore:synthetic
```

Эта команда запускается в CI. Рабочая схема `public` не изменяется.

Чтобы проверить именно последний реальный файл из `backups/`, нужно явно
подтвердить передачу данных учеников в базу из текущего `.env`:

```bash
npm run verify:restore -- --allow-personal-data
```

PowerShell:

```powershell
npm.cmd run verify:restore -- --allow-personal-data
```

Реальная копия всё равно восстанавливается только во временную схему. Запускайте
команду, только если `DATABASE_URL`/`DIRECT_URL` указывает на разрешённый для
этих данных проект PostgreSQL. Для конкретного файла добавьте
`--file backups/backup-....json`.

## Мониторинг

- `/api/health` проверяет приложение и соединение с БД;
- Sentry получает серверные и клиентские ошибки при заданном DSN;
- Vercel Analytics и Speed Insights дают агрегированные показатели;
- Prisma помечает запросы дольше 500 мс префиксом `[db:slow]` в серверных
  логах Vercel; порог можно изменить серверной переменной `DB_SLOW_QUERY_MS`;
- GitHub Actions и Gitea Actions проверяют каждый push в `main` и pull request:
  окружение, lint, unit- и integration-тесты, TypeScript, production-сборку,
  восстановление синтетического бэкапа, accessibility-аудит и Playwright E2E
  на временных схемах PostgreSQL.

Запись `[db:slow]` содержит длительность, тип операции и названия таблиц. Она
намеренно не содержит текст SQL, параметры, PIN или содержимое ученических
работ. Одиночное предупреждение после холодного старта ещё не означает аварию.
Если одна и та же комбинация операции и таблиц повторяется во время обычного
занятия, запишите маршрут и время, затем проверяйте план запроса и индексы.

При инциденте запишите время, маршрут, затронутые профили и последнее изменение.
Не помещайте PIN, `.env` или содержимое production-бэкапа в issue и сообщения.

## Регулярные работы

Еженедельно:

- проверить ошибки Sentry;
- проверить успешность последнего CI;
- убедиться, что резервная копия создаётся;
- просмотреть неактивных учеников.

Ежемесячно:

- выполнить тестовое восстановление в отдельную схему;
- очистить старые попытки входа:

```bash
npm run cleanup-attempts
```

PowerShell:

```powershell
npm.cmd run cleanup-attempts
```

- проверить обновления зависимостей и `npm audit`;
- проверить список наставников и актуальность их доступа.

## Выпуск

Перед production-деплоем:

```bash
npm run check-env
npm run lint
npm test
npx tsc --noEmit
npm run build
```

PowerShell:

```powershell
npm.cmd run check-env
npm.cmd run lint
npm.cmd test
npx.cmd tsc --noEmit
npm.cmd run build
```

Изменение схемы требует проверенной миграции и свежего бэкапа. После выпуска
проверьте `/api/health`, вход ученика, открытие урока и административный guard.
