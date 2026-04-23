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
2. Сгенерируйте хэш пароля:

```bash
node scripts/generate-auth-hash.mjs "your-password"
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

Первый запуск допускается по `http://IP/monday`, но для постоянного публичного доступа следующий обязательный шаг — включить `HTTPS` по IP и перевести `SESSION_COOKIE_SECURE=true`.

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
