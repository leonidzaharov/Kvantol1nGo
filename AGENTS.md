<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Рабочий сервер (Debian)

- Хост в локалке: `192.168.0.28`, SSH-пользователь `leonid`; снаружи — `https://it-quan.kpcollege.ru`. С машины разработки SSH недоступен — команды на сервере выполняет пользователь.
- Next.js слушает `192.168.0.28:3100` (не 127.0.0.1): так прописано в `deploy/linux/quantorium.service` и `healthUrl` в `deploy/linux/quantorium-deploy.mjs`.
- Пути: env `/etc/quantorium.env`, uploads `/var/lib/quantorium/uploads`, бэкапы `/var/backups/quantorium`, клон `/opt/quantorium/repository` (ветка `production`), релизы `/opt/quantorium/releases`, симлинк `/opt/quantorium/current` (исходно → `/opt/quantorium/app`, ZIP-версия от 9 сентября — точка отката). Старый unit сохранён как `/etc/systemd/system/quantorium.service.backup`.
- Автодеплой: `/usr/local/lib/quantorium-deploy.mjs` + `quantorium-deploy.service`/`.timer`. Deploy key (read-only) в `/etc/quantorium-deploy/`; в клоне задан `core.sshCommand` с этим ключом и `known_hosts`. Таймер включается вручную: `sudo systemctl enable --now quantorium-deploy.timer`.
- Поток: push в `main` → CI → при успехе `production` = `main` → сервер забирает `production`.
- Диагностика: `sudo systemctl status quantorium-deploy.service --no-pager -l`, `sudo journalctl -u quantorium-deploy.service -n 100 --no-pager`, `sudo journalctl -u quantorium.service -n 100 --no-pager`.
- Полная перерегистрация учеников: `scripts/import-students.mjs` (без `--apply` только показывает план; с `--apply` делает pg_dump, удаляет всех не-админов и создаёт новых с пустыми `profileConfiguredAt`/`privacyAcceptedAt`). Запуск на сервере: `cd /opt/quantorium/current && sudo node /tmp/import-students.mjs /tmp/students.json --env=/etc/quantorium.env [--apply]`. ФИО в базу не пишем (политика `/privacy`): ник «Имя Ф», полные имена и PIN живут только на бумаге.
- В рабочей базе есть наследные `User.id` не в формате UUID (например, `user-123`) — id пользователя проверять через `UserIdSchema` из `src/lib/server-guard.ts`, не через `z.uuid()`.
