# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Канонические документы

Продуктовые и технические решения живут в `.docs/product.md` и `.docs/technical.md`. Это источники истины; при существенных изменениях кода обновляй обе парные спецификации в том же проходе (это записано как требование в `technical.md` §8.3). `README.md` — только входная страница со ссылками.

Текущая стадия проекта зафиксирована там же (сейчас `POC B`, `v0.1.0`). Правило версий: `POC A → v0.0.N`, `POC B → v0.1.N`, `MVP A → v0.2.N`, `MVP B → v0.3.N` — версия в `product.md` и `technical.md` должна совпадать.

## Команды

Запуск и сборка (все выполняются через Docker — см. правило изоляции ниже):

- `npm run dev` — поднимает dev-стек через `deploy/compose.dev.yml` (UI на `http://localhost:8080`, API на `http://localhost:3001`).
- `npm run build` — полная сборка: `build:web` (`tsc --noEmit` + `vite build`) и `build:api` (`tsc -p server/tsconfig.json`). Отдельной `test` команды нет; `build` + smoke выступают главными quality-gates.
- `npm run deploy:prod` — legacy-контур с Caddy + Authentik (`deploy/compose.production.yml`, читает корневой `.env`).
- `npm run deploy:timeweb` — VPS-контур со встроенным login-экраном (`deploy/compose.timeweb.yml`, читает `deploy/timeweb.env`). Публикуется только на loopback, наружу проксируется host-nginx через `deploy/nginx.timeweb.conf`.

Операционные скрипты в `scripts/`:

- `smoke-timeweb.sh`, `smoke-production.sh` — hosted smoke-проверки соответствующих контуров.
- `backup-monday-sqlite.sh` / `restore-monday-sqlite.sh <file>` — бэкап и восстановление SQLite MONDAY.
- `backup-authentik-postgres.sh` / `restore-authentik-postgres.sh <file>` — для Authentik (только legacy-контур).
- `bootstrap-authentik.sh` — первичная настройка Authentik (legacy).
- `generate-auth-hash.mjs "password"` — генерирует `MONDAY_AUTH_PASSWORD_SALT`/`HASH`/`SESSION_SECRET` для timeweb-контура.

## Архитектура

Стек: React 18 + Vite (клиент), Express + TypeScript на Node (API), `better-sqlite3` (хранилище), Docker Compose для запуска, Caddy (legacy) или host-nginx (timeweb) для публикации.

### Модель состояния и sync

Сервер держит **один versioned snapshot** всей доски в таблице `state` (id=1, `tasks_json`, `updated_at`, `version`). Клиент хранит зеркало в `localStorage` и при записи посылает `PUT /api/tasks` с `expectedVersion`. При расхождении — `409 Conflict` с текущим серверным состоянием; никакого серверного merge нет, конфликт должен разрешать UI (загрузить серверное состояние, не форсировать silent overwrite). Это осознанное решение (`TD-001` в `technical.md`), упрощающее sync ценой ограниченной масштабируемости.

Клиент работает **local-first** (`TD-002`): при недоступности API UI не разваливается, продолжает писать в `localStorage`, показывает статус `offline`. При старте читает локальный snapshot, потом `/api/me` и `/api/tasks`; если сервер пуст, а локально есть задачи — клиент seed-ит сервер. Повреждённый локальный snapshot уходит в quarantine-ключ, чтобы не ломать пустым стартом.

Backup-снимки (`task_backups`) привязаны к user key и создаются по `POST /api/backups`. Дедуп: если последняя сохранённая версия для пользователя = текущей, backup не создаётся повторно. Retention — `MAX_BACKUPS_PER_USER = 3` в `server/src/db.ts`.

### Три режима auth

`server/src/auth.ts` резолвит `AuthConfig` в один из трёх режимов:

- `none` — dev без защиты (`DEBUG=true` по умолчанию ⇒ `AUTH_REQUIRED=false`).
- `proxy` — доверяем заголовкам `X-Authentik-*` от reverse proxy (legacy prod, `TD-003`). Безопасность зависит от корректно закрытого периметра Caddy/Authentik.
- `local` — встроенная форма логина (timeweb), сессионная cookie подписана `MONDAY_SESSION_SECRET`. Пароль хешируется через `generate-auth-hash.mjs` (salt + hash в env).

При `authConfig.mode !== 'none'` все `/api/me`, `/api/tasks`, `/api/backups` закрыты `requireAuth()` (`server/src/index.ts:140`).

### Mount path (`APP_BASE_PATH`)

Timeweb-контур монтирует и API, и SPA под префиксом `/monday`. Основные точки, на которые завязан префикс:

- `vite.config.ts` — `base` берётся из `VITE_BASE_PATH` (build arg Dockerfile'а).
- `server/src/index.ts` — `appBasePath`/`mountPath` оборачивают `router`.
- `src/basePath.ts` — `withAppBasePath` / `stripAppBasePath` для клиентских URL и истории.

Если меняешь префикс — синхронизируй VITE build arg, compose env, nginx-конфиг и клиентский helper.

### Карта расширения

Добавление нового поля задачи обычно затрагивает (в этом порядке):

1. `src/types.ts` — фронтенд-контракт.
2. `server/src/schema.ts` — валидация payload в `PUT /api/tasks`.
3. `server/src/db.ts` — сериализация в `tasks_json` (схема таблицы не мигрирует сама).
4. `src/App.tsx` и компоненты в `src/components/` — UI.

Новые API-эндпоинты: `server/src/index.ts` + `src/api.ts`. Изменения deploy-контура: `deploy/` + `scripts/`.

Ключевые файлы оркестрации: `src/App.tsx` (sync/backup/archive/conflict loops), `src/api.ts` (типизированный клиент + нормализация ошибок), `src/storage.ts` (persistence, pruning, sanitization), `server/src/index.ts` (routing, rate limiters, error middleware), `server/src/http.ts` (request id, logger, in-memory rate limiter — не переживает рестарт и не шардируется).

## Правило изоляции (из глобального `~/.claude/CLAUDE.md`)

Любой скрипт/тест/эксперимент — **только в Docker**. Локально допустимы `npm run dev` (он сам поднимает compose), `npm run lint` (если появится), `git`. Не запускать `node script.js`, `python script.py`, `npx <new>` напрямую — вместо этого `docker run --rm -v $(pwd):/app -w /app <image> <command>`. Установка глобальных пакетов запрещена.

## Контракты, которые легко нарушить

- `category` ∈ `passion | routine | body | projects` (жёстко зашито и в UI, и в `schema.ts`).
- `status` ∈ `open | closed`; `closedAt` обязателен только для `closed`.
- `urgent` — обязательный `boolean`, не опциональный.
- `PUT /api/tasks` требует `expectedVersion` — без него будет отказ валидации, а не silent merge.
- Body limit — 1MB (`express.json({ limit: '1mb' })`); request timeout 15s.

## Наблюдаемость

Все HTTP-запросы пишутся JSON-строкой (`timestamp`, `requestId`, `method`, `path`, `status`, auth context). Unhandled errors — тоже JSON со stack. Health endpoints: `/api/health/live`, `/api/health/ready`, `/api/health` (последние два возвращают 503 если SQLite не готова). Они же служат основой compose healthchecks.
