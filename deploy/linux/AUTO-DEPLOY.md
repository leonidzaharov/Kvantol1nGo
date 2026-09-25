# Автоматическое обновление с GitHub

Схема: изменения отправляются в `main`, GitHub Actions проверяет проект и после
успешной проверки передвигает `production` на тот же коммит. Debian раз в
минуту проверяет `production` и устанавливает новую версию.

Gitea используется для отдельной проверки ветки `test` и на рабочий Debian
не влияет. Первичную установку приложения, базу и `/etc/quantorium.env`
администратор готовит по [инструкции установки](../../docs/DEBIAN_SETUP.md).
Данные и загруженные картинки не входят в GitHub-репозиторий.

Рабочая база и загруженные изображения не находятся в Git. Перед миграцией
скрипт создаёт отдельные копии PostgreSQL и каталога uploads в
`/var/backups/quantorium`.

## Один раз: подготовить GitHub

Убедитесь, что GitHub Actions разрешены в репозитории
`leonidzaharov/Kvantol1nGo`. Workflow `CI` проверяет `main` и использует
встроенный `GITHUB_TOKEN` с правом `contents: write` для обновления
`production`. Если на `production` включена защита от записи, настройте
разрешение для workflow либо согласуйте другой способ выпуска. До успешного
завершения `CI` сервер не должен забирать новый код.

## Один раз: подготовить Debian

Команды выполняются из локальной сети под пользователем с sudo/root. Не
вставляйте пароль Linux или PostgreSQL в команды и в Git.

Установите системные программы:

```sh
sudo apt update
sudo apt install -y git curl tar postgresql-client openssh-client
```

Создайте отдельный ключ, которым сервер будет только читать репозиторий:

```sh
sudo install -d -m 700 /etc/quantorium-deploy
sudo ssh-keygen -t ed25519 -N '' -f /etc/quantorium-deploy/id_ed25519
sudo ssh-keyscan -t ed25519 -H github.com | sudo tee /etc/quantorium-deploy/known_hosts >/dev/null
sudo chmod 600 /etc/quantorium-deploy/id_ed25519 /etc/quantorium-deploy/known_hosts
sudo ssh-keygen -lf /etc/quantorium-deploy/known_hosts
sudo cat /etc/quantorium-deploy/id_ed25519.pub
```

Отпечаток ключа GitHub должен быть
`SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU`; сверяйте его с
[официальной страницей GitHub](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/githubs-ssh-key-fingerprints).
Если он отличается, остановитесь и проверьте сеть.

Скопируйте показанный публичный ключ. В GitHub откройте репозиторий,
`Settings → Deploy keys → Add deploy key`, вставьте ключ и оставьте право
записи выключенным. Закрытый файл `id_ed25519` никуда не отправляйте.

Клонируйте проверенную ветку из основного репозитория:

```sh
sudo install -d -o root -g root /opt/quantorium/releases /var/backups/quantorium
sudo git -c core.sshCommand='ssh -i /etc/quantorium-deploy/id_ed25519 -o IdentitiesOnly=yes -o UserKnownHostsFile=/etc/quantorium-deploy/known_hosts' clone --branch production --single-branch git@github.com:leonidzaharov/Kvantol1nGo.git /opt/quantorium/repository
sudo git -C /opt/quantorium/repository config core.sshCommand 'ssh -i /etc/quantorium-deploy/id_ed25519 -o IdentitiesOnly=yes -o UserKnownHostsFile=/etc/quantorium-deploy/known_hosts'
```

Если серверу запрещён исходящий SSH на порт 22, администратор может настроить
SSH GitHub через порт 443 по [официальной инструкции](https://docs.github.com/en/authentication/troubleshooting-ssh/using-ssh-over-the-https-port).
Если `/opt/quantorium/repository` уже существует, сначала проверьте его
`git remote -v` и текущую установку, не клонируйте поверх каталога.

Сохраните текущую установленную копию как исходную точку отката, затем
установите скрипт и службы:

```sh
test -d /opt/quantorium/app
sudo ln -sfn /opt/quantorium/app /opt/quantorium/current
sudo install -m 0644 /opt/quantorium/repository/deploy/linux/quantorium-deploy.mjs /usr/local/lib/quantorium-deploy.mjs
sudo install -m 0644 /opt/quantorium/repository/deploy/linux/quantorium.service /etc/systemd/system/quantorium.service
sudo install -m 0644 /opt/quantorium/repository/deploy/linux/quantorium-deploy.service /etc/systemd/system/quantorium-deploy.service
sudo install -m 0644 /opt/quantorium/repository/deploy/linux/quantorium-deploy.timer /etc/systemd/system/quantorium-deploy.timer
sudo systemctl daemon-reload
```

Проверьте, что Node находится в `/usr/bin/node`:

```sh
command -v node
```

Если команда показывает другой путь, замените `/usr/bin/node` в двух файлах
служб. Затем выполните первое обновление вручную:

```sh
sudo systemctl start quantorium-deploy.service
sudo systemctl status quantorium-deploy.service --no-pager
sudo systemctl status quantorium.service --no-pager
curl -fsS https://it-quan.kpcollege.ru/api/health
```

После успешной проверки включите автоматическую проверку GitHub:

```sh
sudo systemctl enable --now quantorium-deploy.timer
systemctl list-timers quantorium-deploy.timer --no-pager
```

## Обычная работа

После успешной проверки в GitHub ветка `production` обновится автоматически.
Debian увидит её не позднее чем примерно через минуту. Статус:

```sh
systemctl status quantorium-deploy.timer --no-pager
sudo journalctl -u quantorium-deploy.service -n 100 --no-pager
sudo journalctl -u quantorium.service -n 100 --no-pager
```

Запустить проверку немедленно:

```sh
sudo systemctl start quantorium-deploy.service
```

Остановить автоматические обновления:

```sh
sudo systemctl disable --now quantorium-deploy.timer
```

Приложение можно вернуть на предыдущую файловую версию при неудачной
проверке здоровья. Миграции базы автоматически назад не откатываются, поэтому
изменения схемы должны сохранять совместимость с предыдущей версией.

При изменении файлов самого `deploy/linux` администратор должен заново
установить соответствующие файлы в `/usr/local/lib` и `/etc/systemd/system`,
затем выполнить `sudo systemctl daemon-reload`. Таймер обновляет приложение,
но не собственные файлы службы.
