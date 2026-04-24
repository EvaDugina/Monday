# MONDAY

Канонические документы проекта:

- [`.docs/product.md`](./.docs/product.md) - продуктовый источник истины
- [`.docs/technical.md`](./.docs/technical.md) - технический источник истины

## Quick Start

Локальный запуск:

```bash
npm run dev
```

- UI: `http://localhost:8080`
- API: `http://localhost:3001`

## Production

### Timeweb VPS / nginx / `/monday`

1. Скопируйте `deploy/timeweb.env.example` в `deploy/timeweb.env`.
2. Сгенерируйте хэш пароля в контейнере (без локального `node`):

```bash
docker run --rm -v "$(pwd)":/app -w /app node:20-alpine node scripts/generate-auth-hash.mjs "your-password"
```

3. Вставьте `MONDAY_AUTH_PASSWORD_SALT`, `MONDAY_AUTH_PASSWORD_HASH` и `MONDAY_SESSION_SECRET` в `deploy/timeweb.env`.
4. Поднимите контейнер:

```bash
npm run deploy:timeweb
```

5. Добавьте [deploy/nginx.timeweb.conf](./deploy/nginx.timeweb.conf) в хостовый `nginx` и проксируйте `/monday` на `127.0.0.1:18080`.
6. После настройки `nginx` проверьте:

```bash
./scripts/smoke-timeweb.sh
```

Первый запуск допускается по `http://IP/monday`, но для постоянного публичного доступа следующий обязательный шаг — включить `HTTPS`, перевести `SESSION_COOKIE_SECURE=true`, а затем ротировать `MONDAY_SESSION_SECRET`, чтобы инвалидировать сессии, выданные по HTTP.

Для backup/restore в timeweb-контуре переопределите имя сервиса и volume, т.к. значения по умолчанию заточены под legacy-стек:

```bash
MONDAY_SERVICE=monday \
  COMPOSE_FILE=deploy/compose.timeweb.yml \
  ENV_FILE=deploy/timeweb.env \
  ./scripts/backup-monday-sqlite.sh

MONDAY_SERVICE=monday \
  SQLITE_VOLUME_NAME=monday_timeweb_sqlite_data \
  COMPOSE_FILE=deploy/compose.timeweb.yml \
  ENV_FILE=deploy/timeweb.env \
  ./scripts/restore-monday-sqlite.sh backups/sqlite/<file>.sqlite.gz
```

### Legacy domain stack

1. Скопируйте `.env.example` в `.env`.
2. Заполните домены и секреты.
3. Запустите:

```bash
npm run deploy:prod
```

Если Authentik поднимается на хосте впервые, после старта стека выполните `./scripts/bootstrap-authentik.sh`.

## Operations

- smoke timeweb: `./scripts/smoke-timeweb.sh`
- smoke: `./scripts/smoke-production.sh`
- backup SQLite: `./scripts/backup-monday-sqlite.sh`
- restore SQLite: `./scripts/restore-monday-sqlite.sh backups/sqlite/<file>.sqlite.gz`
- backup Authentik PostgreSQL: `./scripts/backup-authentik-postgres.sh`
- restore Authentik PostgreSQL: `./scripts/restore-authentik-postgres.sh backups/postgres/<file>.sql.gz`
