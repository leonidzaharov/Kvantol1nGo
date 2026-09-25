# Инструкция установки

Обзор исходников и порядок работы с GitHub находятся в корневом README.md.
Первичная установка и перенос данных описаны в docs/MIGRATION_SYSADMIN.md.

Файлы этого каталога:
- environment.example — шаблон новых настроек Debian без рабочих секретов;
- quantorium.service — служба systemd;
- nginx-location.conf — фрагмент для отдельного HTTPS virtual host.
- AUTO-DEPLOY.md — настройка GitHub main/production и обновления Debian;
- quantorium-deploy.mjs, `.service` и `.timer` — проверяемый установщик релизов.

Копия database-local.json и экспортированные uploads находятся в отдельном
архиве переноса. Они не включены в репозиторий. Локальное хранилище изображений
реализовано; рабочая папка uploads должна сохраняться между обновлениями.
