# Деплой MONDAY на Timeweb Cloud — ручная инструкция

Документ рассчитан на старт с нуля: есть только аккаунт на `timeweb.cloud`, нет сервера, нет домена. Все команды — copy-paste. На каждом шаге есть короткая проверка «что должно получиться».

Итог: MONDAY доступен на `https://<ваш-домен>/monday/` (или на `http://<IP>/monday/` если без домена), защищён встроенной формой логина, данные лежат в SQLite внутри docker volume, бэкапы — в `backups/sqlite/` на хостовой ФС.

---

## 0. Что понадобится до начала

- Аккаунт `timeweb.cloud` с привязанной картой.
- Любой SSH-клиент на вашей локальной машине (Windows: встроенный `ssh` в Terminal/Git Bash/PowerShell; macOS/Linux — уже есть).
- Ваш публичный SSH-ключ (`~/.ssh/id_ed25519.pub` или `~/.ssh/id_rsa.pub`). Если его нет — сгенерируйте:

  ```bash
  ssh-keygen -t ed25519 -C "your-email@example.com"
  ```

  Нажимайте Enter на все вопросы, получите пару `id_ed25519` / `id_ed25519.pub`.
- (Опционально, но сильно рекомендуется) домен. Без домена MONDAY поднимется только по HTTP на голый IP; браузеры будут шуметь, а cookie не будет `Secure`.

---

## 1. Создать VPS на Timeweb Cloud

1. Зайдите в панель `https://timeweb.cloud/my` → **«Облачные серверы»** → **«Создать»**.
2. Параметры:
   - **Регион:** любой ближайший к вашим пользователям (например, `Москва`).
   - **ОС:** `Ubuntu 24.04 LTS` (инструкция рассчитана на неё; для 22.04 команды те же).
   - **Тариф:** минимум `1 vCPU / 1 GB RAM / 25 GB SSD` хватает. Для комфортной сборки образа берите `2 GB RAM` — SQLite и Node крутятся в районе 150 MB, но `npm ci` и `vite build` едят больше.
   - **Публичный IP:** включён (по умолчанию).
   - **SSH-ключ:** загрузите содержимое вашего `~/.ssh/id_ed25519.pub`. Если пароль оставите — Timeweb пришлёт рут-пароль, но работать мы будем по ключу.
3. Создайте сервер. Дождитесь статуса **«Активен»**, запишите публичный IP.

**Проверка.** С локальной машины:

```bash
ssh root@<IP>
```

Должен появиться рут-промпт. Если ругается на fingerprint — подтвердите `yes`.

---

## 2. Первичная настройка сервера

Все команды ниже выполняются **на сервере** (по ssh). Каждый блок безопасно копировать целиком.

### 2.1. Обновить систему и создать не-root пользователя

```bash
apt update && apt upgrade -y
adduser --disabled-password --gecos "" monday
usermod -aG sudo monday
mkdir -p /home/monday/.ssh
cp ~/.ssh/authorized_keys /home/monday/.ssh/authorized_keys
chown -R monday:monday /home/monday/.ssh
chmod 700 /home/monday/.ssh
chmod 600 /home/monday/.ssh/authorized_keys
```

С этого момента заходите под `monday`:

```bash
exit
ssh monday@<IP>
```

**Проверка.** `whoami` печатает `monday`, `sudo -l` показывает, что sudo доступен.

### 2.2. Настроить firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
sudo ufw status
```

В `ufw status` должны быть открыты 22, 80, 443. Порт **18080 наружу не открываем** — MONDAY слушает его только на loopback, nginx сам проксирует с 80/443.

### 2.3. Установить Docker + Compose plugin

Официальный способ через Docker apt repo:

```bash
sudo apt install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker monday
```

Перелогиньтесь (`exit` → `ssh monday@<IP>`), чтобы docker-группа применилась.

**Проверка.**

```bash
docker version
docker compose version
```

Обе команды должны печатать версии без ошибок.

### 2.4. Установить nginx

```bash
sudo apt install -y nginx
sudo systemctl enable --now nginx
```

**Проверка.** Откройте `http://<IP>/` в браузере — должна быть стандартная страница «Welcome to nginx».

---

## 3. Загрузить MONDAY на сервер

Есть два пути. Выберите один.

### Вариант A: через git (рекомендуется)

Если у вас проект уже на GitHub/GitLab:

```bash
cd ~
git clone https://github.com/<you>/MONDAY.git monday
cd monday
```

Если репозиторий приватный — либо сгенерируйте ключ на сервере и добавьте его в GitHub (`ssh-keygen -t ed25519` → `cat ~/.ssh/id_ed25519.pub` → в GitHub Settings / SSH keys), либо используйте Personal Access Token.

### Вариант B: через `scp` с локальной машины

С **локальной** машины (из директории, где лежит проект):

```bash
rsync -avz --exclude node_modules --exclude dist --exclude .git --exclude backups \
  ./ monday@<IP>:~/monday/
```

На сервере:

```bash
cd ~/monday
```

**Проверка.** `ls` на сервере должен показать `package.json`, `deploy/`, `scripts/`, `src/`, `server/`.

---

## 4. Сгенерировать секреты и заполнить env

На сервере, из `~/monday`:

```bash
cp deploy/timeweb.env.example deploy/timeweb.env
docker run --rm -v "$(pwd)":/app -w /app node:20-alpine node scripts/generate-auth-hash.mjs "ВАШ-ПАРОЛЬ-СЮДА"
```

Вывод будет вида:

```
MONDAY_AUTH_PASSWORD_SALT=4f9a...
MONDAY_AUTH_PASSWORD_HASH=9c1e...
MONDAY_SESSION_SECRET=Q7tL...
```

Откройте `deploy/timeweb.env` (например, `nano deploy/timeweb.env`) и:

1. Вставьте три строки с хэшем вместо placeholder'ов `__GENERATE_ME_WITH_*__`.
2. Поменяйте `MONDAY_AUTH_USERNAME=admin` на желаемый логин (или оставьте).
3. `MONDAY_AUTH_NAME=MONDAY` — отображаемое имя в UI.
4. `APP_BASE_PATH=/monday` — путь, под которым MONDAY будет жить. Оставьте `/monday` если не знаете точно, что хотите иначе.
5. `MONDAY_APP_PORT=18080` — loopback-порт для nginx. Менять не нужно.
6. `SESSION_COOKIE_SECURE=false` — пока **оставьте false**. Поменяем после включения HTTPS (шаг 7).

Сохраните (Ctrl+O, Enter, Ctrl+X в nano).

**Проверка.**

```bash
grep -v '^#' deploy/timeweb.env | grep -v '^$'
```

Ни одной строки с `__GENERATE_ME_*__` быть не должно.

---

## 5. Поднять контейнер

Из `~/monday`:

```bash
docker compose --env-file deploy/timeweb.env -f deploy/compose.timeweb.yml up -d --build
```

Сборка образа идёт 1–3 минуты (ставит `better-sqlite3` из исходников, собирает Vite-бандл).

**Проверка.**

```bash
docker compose --env-file deploy/timeweb.env -f deploy/compose.timeweb.yml ps
docker compose --env-file deploy/timeweb.env -f deploy/compose.timeweb.yml logs --tail 30 monday
```

В `ps` сервис `monday` должен быть `Up` со статусом `healthy` (подождите ~20 с после первого запуска). В логах — строка вида:

```
{"level":"info","event":"server_started","authMode":"local","mountedAt":"/monday","port":8080,...}
```

Локальная проверка с сервера:

```bash
curl -sS http://127.0.0.1:18080/monday/api/health/ready
```

Должно вернуть `{"ok":true}`.

---

## 6. Подключить nginx к контейнеру

В проекте уже есть готовый nginx-фрагмент — `deploy/nginx.timeweb.conf`. Его надо врезать в конфиг сайта.

### 6.1. Убрать дефолтный сайт nginx

```bash
sudo rm -f /etc/nginx/sites-enabled/default
```

### 6.2. Создать свой серверный блок

Если у вас **пока нет домена**, создайте `/etc/nginx/sites-available/monday`:

```bash
sudo tee /etc/nginx/sites-available/monday > /dev/null <<'NGINX'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    # --- MONDAY ---
    location = /monday {
        return 301 /monday/;
    }

    location /monday/ {
        proxy_pass http://127.0.0.1:18080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Prefix /monday;
    }
    # --- /MONDAY ---
}
NGINX

sudo ln -sf /etc/nginx/sites-available/monday /etc/nginx/sites-enabled/monday
sudo nginx -t && sudo systemctl reload nginx
```

Если у вас **есть домен** (например, `board.example.com`), замените `server_name _;` на `server_name board.example.com;` — и заранее направьте A-запись DNS на IP сервера (через панель регистратора домена). Дальше всё одинаково; HTTPS подключим в шаге 7.

**Проверка.** С локальной машины:

```bash
curl -sI http://<IP>/monday
```

Должен вернуть `HTTP/1.1 301 Moved Permanently` с `Location: /monday/`.

```bash
curl -sI http://<IP>/monday/
```

Должен вернуть `HTTP/1.1 200 OK` и заголовок `content-type: text/html`.

Откройте в браузере `http://<IP>/monday/` — увидите форму логина MONDAY. Войдите с теми кредами, что задали на шаге 4.

Если UI открылся и логин прошёл — базовый деплой завершён. Дальше включим HTTPS.

---

## 7. Подключить HTTPS (Let's Encrypt)

**Этот шаг требует домен.** Если домена нет — пропустите, но помните, что без HTTPS cookie сессии ходит по HTTP и может быть перехвачена.

### 7.1. Направить домен на сервер

В панели вашего регистратора домена (Reg.ru, NameCheap, Timeweb Domain и т.д.) создайте A-запись:

- Имя: `board` (или `@` если хотите `example.com` на корень)
- Значение: публичный IP вашего сервера
- TTL: 300 или минимум, что предлагает панель

Подождите 5–30 минут, проверьте с локальной машины:

```bash
dig +short board.example.com
```

Должен вернуть ваш IP.

### 7.2. Получить TLS-сертификат

На сервере:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d board.example.com --non-interactive --agree-tos -m you@example.com --redirect
```

Опции:
- `--nginx` — certbot сам правит ваш nginx-конфиг, добавляет HTTPS-блок и редирект с HTTP.
- `-m you@example.com` — ваш email для уведомлений об истечении сертификата.
- `--redirect` — добавляет 301 с HTTP → HTTPS.

Certbot сам перезагрузит nginx.

**Проверка.**

```bash
curl -sI https://board.example.com/monday/
```

Должен вернуть `HTTP/2 200` с security-заголовками.

Certbot настроит автоматическое обновление сертификата (systemd timer). Проверить:

```bash
sudo systemctl status certbot.timer
```

### 7.3. Переключить cookie на Secure и ротировать сессию

Теперь, когда HTTPS работает, заставим сессию уходить только по HTTPS:

```bash
cd ~/monday
nano deploy/timeweb.env
```

Поменяйте `SESSION_COOKIE_SECURE=false` на `true`.

Сгенерируйте **новый** `MONDAY_SESSION_SECRET` (обязательно — это инвалидирует сессии, которые вы могли выдать по HTTP):

```bash
docker run --rm node:20-alpine node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Замените в `deploy/timeweb.env` старое `MONDAY_SESSION_SECRET=` на новое.

Перезапустите контейнер, чтобы новые env применились:

```bash
docker compose --env-file deploy/timeweb.env -f deploy/compose.timeweb.yml up -d --force-recreate
```

**Проверка.** Зайдите заново в браузере по `https://board.example.com/monday/` — вас попросит заново залогиниться. После логина в DevTools → Application → Cookies у `monday_session` должен стоять флаг `Secure`.

---

## 8. Smoke-проверка всего контура

Проект привозит готовый smoke-скрипт. Запустите из `~/monday`:

```bash
cd ~/monday
PUBLIC_BASE_URL=https://board.example.com \
SMOKE_USERNAME=admin \
SMOKE_PASSWORD=ВАШ-ПАРОЛЬ \
./scripts/smoke-timeweb.sh
```

Если домена нет — `PUBLIC_BASE_URL=http://<IP>`.

Скрипт проверит: health, 301-редирект, 401 без сессии, полный login → `/api/me` → `/api/tasks` → logout. На выходе должна быть строка `Timeweb smoke checks passed.`

---

## 9. Операции на живой системе

### 9.1. Посмотреть логи

```bash
cd ~/monday
docker compose --env-file deploy/timeweb.env -f deploy/compose.timeweb.yml logs -f --tail 100 monday
```

Выйти: Ctrl+C. Логи — структурированный JSON, удобно грепать:

```bash
docker compose --env-file deploy/timeweb.env -f deploy/compose.timeweb.yml logs monday | grep '"level":"error"'
```

### 9.2. Перезапустить контейнер

```bash
docker compose --env-file deploy/timeweb.env -f deploy/compose.timeweb.yml restart monday
```

### 9.3. Обновить MONDAY из git

```bash
cd ~/monday
git pull
docker compose --env-file deploy/timeweb.env -f deploy/compose.timeweb.yml up -d --build
```

Первая сборка после обновления — 1–3 минуты, дальше пересобираются только изменённые слои.

### 9.4. Сделать backup SQLite

```bash
cd ~/monday
MONDAY_SERVICE=monday \
  COMPOSE_FILE=deploy/compose.timeweb.yml \
  ENV_FILE=deploy/timeweb.env \
  ./scripts/backup-monday-sqlite.sh
```

Бэкапы попадают в `~/monday/backups/sqlite/monday-YYYYMMDDTHHMMSSZ.sqlite.gz`. По умолчанию хранятся 7 дней; переопределите `RETENTION_DAYS=30` в env, если надо дольше.

Разумно повесить backup на cron:

```bash
crontab -e
```

Добавьте строку (каждый день в 03:00 UTC):

```
0 3 * * * cd /home/monday/monday && MONDAY_SERVICE=monday COMPOSE_FILE=deploy/compose.timeweb.yml ENV_FILE=deploy/timeweb.env /home/monday/monday/scripts/backup-monday-sqlite.sh >> /home/monday/monday/backups/backup.log 2>&1
```

### 9.5. Восстановить SQLite из бэкапа

```bash
cd ~/monday
MONDAY_SERVICE=monday \
  SQLITE_VOLUME_NAME=monday_timeweb_sqlite_data \
  COMPOSE_FILE=deploy/compose.timeweb.yml \
  ENV_FILE=deploy/timeweb.env \
  ./scripts/restore-monday-sqlite.sh backups/sqlite/monday-20260424T030000Z.sqlite.gz
```

Скрипт остановит контейнер, подменит SQLite-файл, поднимет контейнер обратно.

### 9.6. Скачать бэкапы на локальную машину

С локальной машины:

```bash
rsync -avz monday@<IP>:~/monday/backups/sqlite/ ./local-backups/
```

---

## 10. Откат и частые проблемы

### Контейнер не стартует / crash-loop

```bash
docker compose --env-file deploy/timeweb.env -f deploy/compose.timeweb.yml logs --tail 50 monday
```

Частые причины:
- Оставлены `__GENERATE_ME_*__` placeholder'ы в `timeweb.env` → приложение сразу падает с «Replace placeholder values...». Исправьте env, `up -d --force-recreate`.
- `MONDAY_SESSION_SECRET` пустой — то же поведение.

### `502 Bad Gateway` через nginx

- `docker compose ... ps` показывает контейнер `Up (healthy)`?
- `curl -sS http://127.0.0.1:18080/monday/api/health/ready` с сервера возвращает `{"ok":true}`?
- Если да, но через nginx 502 — проверьте `sudo nginx -t` и `sudo journalctl -u nginx --since "5 minutes ago"`.

### Залогинился, но сразу выкидывает

Обычно: включили `SESSION_COOKIE_SECURE=true`, а ходите по HTTP. Cookie с `Secure` по HTTP просто не отправляется. Либо включите HTTPS (шаг 7), либо временно переверните обратно на `false`.

### Забыл пароль

Нет «восстановления пароля» — пароль лежит только как scrypt-хэш. Сгенерируйте новый:

```bash
docker run --rm -v "$(pwd)":/app -w /app node:20-alpine node scripts/generate-auth-hash.mjs "новый-пароль"
```

Замените три строки в `deploy/timeweb.env`, `docker compose ... up -d --force-recreate`. Все существующие сессии инвалидируются.

### Хочу остановить всё

```bash
cd ~/monday
docker compose --env-file deploy/timeweb.env -f deploy/compose.timeweb.yml down
```

Volume `monday_timeweb_sqlite_data` с задачами **не удаляется** — при `up -d --build` данные вернутся. Чтобы удалить совсем (внимание, потеряете задачи):

```bash
docker compose --env-file deploy/timeweb.env -f deploy/compose.timeweb.yml down -v
```

---

## 11. Чек-лист готового прод-деплоя

- [ ] VPS создан, не-root пользователь с ssh-ключом
- [ ] UFW: открыты только 22, 80, 443
- [ ] Docker + compose plugin установлены, `monday` в группе `docker`
- [ ] nginx установлен и проходит `nginx -t`
- [ ] `deploy/timeweb.env` заполнен (нет placeholder'ов)
- [ ] `docker compose ps` — `monday` `Up (healthy)`
- [ ] `/etc/nginx/sites-enabled/monday` проксирует `/monday/` → `127.0.0.1:18080`
- [ ] HTTPS-сертификат выпущен, certbot timer активен
- [ ] `SESSION_COOKIE_SECURE=true`, `MONDAY_SESSION_SECRET` ротирован после перехода на HTTPS
- [ ] `./scripts/smoke-timeweb.sh` проходит
- [ ] cron для backup настроен, бэкапы реально пишутся в `backups/sqlite/`

Когда все галочки стоят — можно пользоваться.
