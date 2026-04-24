# Technical Document

## 1. Паспорт документа

- Статус: approved
- Владелец: команда проекта
- Последнее обновление: 2026-04-24
- Стадия проекта: `POC B`
- Версия проекта: `v0.1.1`
- Предыдущая версия: `не применимо`
- Следующий целевой этап: `MVP A`
- Архив финальной версии предыдущего этапа: `не применимо, каноническая пара документов вводится впервые`
- Правило версии:
  - общая версия синхронизируется с `.docs/product.md`
  - `POC A -> v0.0.N`
  - `POC B -> v0.1.N`
  - `MVP A -> v0.2.N`
  - `MVP B -> v0.3.N`
- Связанные документы:
  - `.docs/product.md`
  - `README.md`
  - `.env.example`
  - `deploy/compose.dev.yml`
  - `deploy/compose.production.yml`
- Назначение:
  - хранить согласованную техническую модель системы
  - фиксировать, как MONDAY реализован и как его безопасно менять
  - держать здесь архитектуру, контракты, quality gates и manual verification

## 1.1. Контроль этапа и технической сложности

- Цель текущего этапа:
  - держать проект в состоянии воспроизводимого server demo с базовой защитой, deploy path и понятным операторским запуском
- Какие технические обязательства уже обязательны на этом этапе:
  - `README.md` как входная страница
  - `.env.example`
  - pinned dependencies
  - deploy path через Docker Compose
  - базовые health/smoke проверки
  - достаточная логируемость для server demo
- Какие более поздние технические возможности пока отложены:
  - formal autotest suite как обязательный gate
  - миграции приложения и более зрелая data-evolution стратегия
  - product analytics, dashboard и monitoring/alerting stack
  - раздельная модель данных по пользователям и ролям
- Какие сигналы будут означать переход на следующий этап:
  - необходимость надежной эксплуатации для 50-100 пользователей
  - появление обязательных test command и явных quality gates main pipeline
  - необходимость усилить data model, validation и operational baseline как обязательную норму

## 1.2. Жизненный цикл документа этапа

- В рамках текущего этапа документ можно свободно переписывать, исправлять и дополнять.
- При переходе на следующий этап финальная версия текущего этапа должна быть заархивирована до создания новой версии документа.
- Документ нового этапа создается заново и описывает техническую модель именно нового этапа, а не является накопленным diff всех предыдущих этапов.

## 2. Сводка системы

### 2.1. Назначение системы

Система предоставляет веб-доску задач с локальным состоянием, серверным снимком состояния, optimistic concurrency, архивом и резервными снимками, а также отдельный hosted-контур с reverse proxy и внешней аутентификацией.

### 2.2. Границы системы

- Репозиторий отвечает за frontend, API, локальное и серверное хранение состояния, а также compose/deploy-артефакты MONDAY.
- Репозиторий не реализует собственный full auth-provider, а опирается на внешний слой Authentik и reverse proxy.
- Репозиторий не включает product analytics, alerting platform и полноценную admin-панель.

### 2.3. Ключевые технические сущности

- `Task`: единица пользовательской работы на доске.
- `Deadline`: дедлайн задачи (`none`, `date`, `range`, `recurring`).
- `ServerTasksState`: серверный снимок массива задач, `updatedAt` и `version`.
- `task_backups`: таблица резервных снимков с привязкой к пользователю-инициатору.
- auth headers от reverse proxy: источник текущего identity context для API.

### 2.4. Критические качественные характеристики

- воспроизводимость локального и production-запуска
- предсказуемое сохранение и восстановление состояния
- явная обработка конфликтов версии
- базовая защищенность hosted-контура
- достаточная наблюдаемость через JSON logs и health endpoints

## 3. Архитектура и состав системы

### 3.1. Контекст и внешние зависимости

- браузер как основной клиент
- React 18 + Vite для frontend
- Express + TypeScript для API
- SQLite через `better-sqlite3` для состояния MONDAY
- Docker Compose для локального и production-подъема
- Caddy как reverse proxy в production
- Authentik + PostgreSQL как внешний auth-layer

### 3.2. Основные модули и их ответственность

- `src/`
  - рендеринг UI доски, архив, модальные окна, клиентские вызовы API, локальное хранение, sync-status
- `server/src/`
  - HTTP API, валидация payload, SQLite-доступ, health endpoints, rate limiting, request logging, auth guard
- `deploy/`
  - Dockerfiles, dev/prod compose, Caddy-конфигурация
- `scripts/`
  - bootstrap Authentik, smoke-checks, backup/restore scripts для SQLite и Authentik PostgreSQL
- `backups/`
  - операционное хранилище для файловых backup-артефактов, создаваемых скриптами

### 3.3. Ключевые потоки данных и управления

- Старт frontend:
  - клиент поднимает UI
  - читает localStorage
  - пытается получить `/api/me` и `/api/tasks`
  - если сервер пустой, но локальные задачи есть, клиент seed-ит сервер локальным состоянием
- Изменение задач:
  - UI меняет локальный snapshot
  - debounce-запись отправляет `PUT /api/tasks` c `expectedVersion`
  - при `409` UI переходит в состояние конфликта
- Backup:
  - UI вызывает `POST /api/backups`
  - API создает или переиспользует последний backup текущей версии
  - retention ограничивает число последних backup-снимков на пользователя
- Hosted auth:
  - reverse proxy передает identity headers
  - API извлекает auth context из заголовков
  - при `AUTH_REQUIRED=true` защищаются `/api/me`, `/api/tasks`, `/api/backups`

### 3.4. Технические границы и горячие точки

- состояние MONDAY хранится как единый versioned snapshot, а не как набор независимых серверных сущностей
- текущий auth trust model зависит от корректного reverse proxy и заголовков `X-Authentik-*`
- часть infra уже выглядит ближе к `MVP`, но общий quality baseline пока не дотягивает до полноценного stage promotion
- архив и локальное состояние нормализуются на клиенте, включая pruning старых закрытых задач

## 4. Карта кодовой базы

### 4.1. Главные директории и файлы

- `src/App.tsx`
  - orchestration UI, sync loop, backup loop, archive flow, conflict flow
- `src/api.ts`
  - typed API client и нормализация ошибок
- `src/storage.ts`
  - localStorage persistence, archive pruning, sanitization
- `src/types.ts`
  - frontend contracts
- `server/src/index.ts`
  - routing, health endpoints, auth gating, rate limiters, error handling
- `server/src/db.ts`
  - SQLite schema и доступ к state/backup данным
- `server/src/schema.ts`
  - строгая валидация payload для записи задач
- `server/src/http.ts`
  - auth context, request id, request logger, in-memory rate limiter

### 4.2. Ответственность по модулям

- frontend отвечает за UX, локальную устойчивость и отображение статусов синхронизации
- API отвечает за валидацию, версионирование состояния и безопасную запись в SQLite
- deploy-слой отвечает за границу публикации, auth-поток и операционный запуск

### 4.3. Точки расширения

- новые поля задачи обычно начинаются с `src/types.ts`, `server/src/schema.ts`, `server/src/db.ts`, `src/App.tsx`
- новые API-потоки проходят через `server/src/index.ts` и `src/api.ts`
- изменения deploy-контура идут через `deploy/` и `scripts/`

## 5. Данные, контракты и артефакты

### 5.1. Входные данные

- HTTP:
  - `GET /api/me`
  - `GET /api/tasks`
  - `PUT /api/tasks`
  - `POST /api/backups`
- env/config:
  - `DEBUG`, `AUTH_REQUIRED`, `PORT`, `SQLITE_PATH`
  - `APP_PORT`, `API_PORT`
  - `MONDAY_DOMAIN`, `AUTH_DOMAIN`, `CADDY_EMAIL`
  - Authentik/PostgreSQL secrets и bootstrap values
- reverse-proxy headers:
  - `X-Authentik-Email`
  - `X-Authentik-Name`
  - `X-Authentik-Groups`
  - `X-Authentik-Uid`
  - `X-Authentik-Username`

### 5.2. Внутренние структуры и промежуточные артефакты

- frontend `Task`:
  - `id`, `title`, `description`, `category`, `deadline`, `urgent`, `status`, `createdAt`, `closedAt?`
- `LocalStateSnapshot`:
  - локальные `tasks`, `version`, `updatedAt`
- SQLite tables:
  - `state(id=1, tasks_json, updated_at, version)`
  - `task_backups(user_key, user_email, user_name, tasks_json, state_version, state_updated_at, source, created_at)`

### 5.3. Выходные данные

- UI:
  - активная доска
  - экран архива
  - статусы `synced`, `syncing`, `offline`, `conflict`
  - backup tooltip/result
- API:
  - `/api/tasks` отдает снимок состояния
  - `PUT /api/tasks` отдает новую версию и timestamp
  - `POST /api/backups` отдает метаданные созданного или переиспользованного backup
- operations:
  - файловые backup-артефакты для SQLite и Authentik PostgreSQL через shell scripts

### 5.4. Контракты и совместимость

- `category` ограничен набором `passion | routine | body | projects`
- `status` ограничен `open | closed`
- `urgent` обязателен как boolean
- `closedAt` обязателен только для `closed` задачи
- `PUT /api/tasks` использует optimistic concurrency и не делает merge при несовпадении версии
- backup снимок не дублируется, если последняя сохраненная версия для пользователя уже совпадает с текущей

## 6. Окружения и конфигурация

### 6.1. Локальная разработка

- основной запуск: `npm run dev`
- используется `deploy/compose.dev.yml`
- порты по умолчанию:
  - app: `http://localhost:8080`
  - api: `http://localhost:3001`
- dev-режим по умолчанию:
  - `DEBUG=true`
  - relaxed auth
  - SQLite в Docker volume

### 6.2. Тестовые и боевые окружения

- production-запуск: `npm run deploy:prod`
- используется `.env` + `deploy/compose.production.yml`
- публикация только через Caddy
- API в production не публикуется напрямую на host-port
- для hosted smoke-проверки используется `./scripts/smoke-production.sh`

### 6.3. Конфигурация и секреты

- секреты и домены хранятся в `.env`, а не в коде
- `.env.example` служит контрактом конфигурации и должен оставаться актуальным
- `DEBUG` является главным переключателем между relaxed/dev и hardened/prod поведением
- auth и TLS поведение production зависит от корректно заполненных env values

## 7. Ограничения реализации и технические требования

### 7.1. Ограничения платформы

- для полного локального и production-сценария требуется Docker Compose
- API зависит от файлового SQLite-хранилища
- client-side логика рассчитана на современный браузер с `localStorage`, `fetch` и `crypto.randomUUID`
- in-memory rate limiting не переживает рестарт сервиса и не распределяется между несколькими инстансами

### 7.2. Нефункциональные требования в реализации

- сервер валидирует payload задач по схеме и длинам полей; `MAX_TASKS=500`, `MAX_DESCRIPTION_LENGTH=2000`, `MAX_TITLE_LENGTH=200`, body limit `2 MB`
- API отключает `x-powered-by`, ограничивает request body и использует request timeout; `graceful shutdown timeout > requestTimeout`
- health endpoints `live`, `ready`, `health` служат основой для compose healthchecks и rate-limited
- production API должен быть закрыт за proxy/auth контуром
- API выставляет security-заголовки (`X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy`, `Permissions-Policy`); `Strict-Transport-Security` включается при `HSTS_ENABLED=true` (авто в production)
- проверка пароля идёт через асинхронный `crypto.scrypt`, сравнение username — через `timingSafeEqual` над SHA-256 хэшами, чтобы не утекала длина
- CSRF не защищён отдельным токеном: модель опирается на `SameSite=Lax`, JSON-only API и принудительный `Content-Type: application/json`; нельзя принимать `application/x-www-form-urlencoded`/`multipart` на write-эндпойнтах без явного CSRF-контура

### 7.3. Наблюдаемость и диагностика

- все HTTP-запросы логируются в JSON со временем, requestId, статусом и auth context
- необработанные ошибки логируются в JSON с message и stack
- smoke-скрипт проверяет:
  - readiness контейнеров
  - redirect на auth
  - security headers
  - недоступность прямой публикации API на host

### 7.4. Ограничения текущего этапа и что не делаем раньше времени

- нет formal unit/integration/e2e suite как обязательной нормы проекта
- нет миграций для app database
- нет user-scoped domain model для задач
- нет мониторинга, alerting и развитой аналитики
- наличие rate limiting, reverse proxy, HTTPS и backup scripts рассматривается как существующая практика репозитория, но не как автоматическое повышение стадии без полного набора обязательств следующего этапа

## 8. Стратегия тестирования и quality gates

### 8.1. Автотесты

- выделенного `test` command сейчас нет
- релевантные автоматические проверки текущего состояния:
  - `npm run build`
  - `npm run build:api`
  - `./scripts/smoke-production.sh`

### 8.2. Ручная проверка

- локальный сценарий доски: создание, редактирование, перемещение, архив, восстановление
- сценарий синхронизации: проверка статусов `syncing`, `offline`, `conflict`
- сценарий backup: ручной запуск и повторный вызов без новой версии
- hosted-сценарий: auth redirect и smoke path

### 8.3. Критерии готовности изменения

- stage и version синхронизированы в `.docs/product.md` и `.docs/technical.md`
- если менялся код, обновлены релевантные product/technical sections
- выполнены релевантные build/smoke/manual checks или явно зафиксирован blocker
- manual verification scenario остается коротким и выполнимым оператором

## 9. Активный план изменений

### PLAN-001. Введение канонической пары документов

- Статус: done
- Основание: `PD-004`
- Цель изменения:
  - заменить рассеянное знание по проекту двумя каноническими документами
- Затронутые модули и файлы:
  - `.docs/product.md`
  - `.docs/technical.md`
  - `README.md`
- Шаги реализации:
  - собрать фактический контур продукта и системы из кода и текущего `README.md`
  - создать канонический product document
  - создать канонический technical document
  - сократить `README.md` до входной страницы со ссылками на канон
- План автопроверок:
  - проверить согласованность stage/version и наличие ссылок
- Риски регрессии:
  - перенос фактов из кода в docs может зафиксировать устаревающие решения, если дальше не поддерживать канон
- Примечания по отладке:
  - дальнейшие изменения должны обновлять docs в том же проходе, что и код

## 10. Отладка, сбои и известные проблемы

### 10.1. Симптомы и типовые причины

- `offline` статус в UI:
  - API недоступен или не поднят compose stack
- `conflict` статус:
  - серверная `version` уже выше ожидаемой
- `401 Authentication required`:
  - отсутствуют корректные auth headers при включенном `AUTH_REQUIRED`
- пустая локальная доска после ошибки parsing:
  - локальный snapshot поврежден и был помещен в quarantine key

### 10.2. Проверки и безопасные обходные пути

- проверить `GET /api/health/ready`
- проверить локальный запуск `npm run dev`
- в hosted-контуре прогнать `./scripts/smoke-production.sh`
- при конфликте версии загрузить серверное состояние, а не пытаться форсировать silent overwrite

### 10.3. Что не удалось стабилизировать

- пока не введен formal automated test suite
- пока не решена долгосрочная эволюция от одного общего snapshot к более гибкой модели multi-user данных

## 11. Сценарии ручной проверки

### MTS-001. Локальный основной сценарий доски

- Цель:
  - убедиться, что базовый UX доски работает end-to-end локально
- Предусловия:
  - доступен Docker
  - проект запущен командой `npm run dev`
- Канал: `Web UI`
- Шаги:
  - открыть `http://localhost:8080`
  - создать по одной задаче минимум в двух разных категориях
  - отредактировать описание, дедлайн и срочность одной задачи
  - перетащить задачу в другую категорию
  - закрыть задачу и убедиться, что она появилась в архиве
  - восстановить задачу из архива
- Ожидаемый результат:
  - все действия отражаются без перезагрузки страницы
  - после обновления страницы состояние сохраняется
- Что считать регрессией:
  - пропажа задачи, сломанный drag-and-drop, неправильный экран архива или потеря данных после reload
- Какие артефакты или скриншоты сохранить:
  - при сбое сохранить скрин экрана и логи контейнеров app/api

### MTS-002. Конфликт синхронизации и офлайн-переход

- Цель:
  - проверить, что продукт явно обрабатывает расхождение локальной и серверной версии
- Предусловия:
  - локальный или hosted stack доступен
  - есть минимум два клиента или один клиент + прямое изменение серверного состояния
- Канал: `Web UI`
- Шаги:
  - открыть доску в двух вкладках
  - в первой вкладке изменить задачу и дождаться `synced`
  - во второй вкладке изменить ту же доску без reload
  - убедиться, что появляется состояние конфликта
  - загрузить серверную версию
  - затем временно остановить API и убедиться, что UI показывает офлайн-режим
- Ожидаемый результат:
  - конфликт не приводит к silent overwrite
  - при недоступности сервера изменения остаются локальными и это явно обозначено
- Что считать регрессией:
  - скрытая потеря изменений или отсутствие понятного сообщения о конфликте/офлайне
- Какие артефакты или скриншоты сохранить:
  - скрин конфликта и JSON-лог API на момент записи

### MTS-003. Hosted auth и production smoke

- Цель:
  - проверить, что production-контур закрыт auth и проходит базовый smoke
- Предусловия:
  - заполнен `.env`
  - production stack поднят через `npm run deploy:prod`
- Канал: `mixed`
- Шаги:
  - выполнить `./scripts/smoke-production.sh`
  - убедиться, что root MONDAY перенаправляет на Authentik
  - пройти авторизацию и открыть доску
  - вызвать ручной backup из UI
- Ожидаемый результат:
  - smoke завершается успешно
  - неавторизованный доступ к рабочей доске blocked
  - после auth доска и backup flow доступны
- Что считать регрессией:
  - отсутствие redirect на auth, провал security headers, прямая публикация API или неработающий backup flow
- Какие артефакты или скриншоты сохранить:
  - вывод smoke script и URL/скрин результата после auth

## 12. Технический долг и открытые вопросы

### 12.1. Технический долг

- нет отдельной тестовой команды и тестового набора main pipeline
- in-memory rate limiter недостаточен для более зрелого distributed-сценария
- snapshot-ориентированная модель состояния может стать узким местом при эволюции к multi-user режиму
- backup story split между API snapshot backups и shell-level database backups требует дальнейшей нормализации

### 12.2. Открытые технические вопросы

- нужно ли переносить MONDAY state с единой записи в более явную модель таблиц и миграций на `MVP A`
- как должен выглядеть user-scoped data model, если hosted-доступ станет использоваться шире
- нужен ли формальный health/readiness check для frontend кроме текущего HTTP 200

## 13. Журнал технических решений

### TD-001. Versioned whole-state sync

- Статус: approved
- Контекст:
  - продукту нужен простой sync flow без сложного server-side merge.
- Решение:
  - сервер хранит один versioned snapshot и принимает запись только при совпадении `expectedVersion`.
- Последствия:
  - конфликт обрабатывается явно через `409`, но масштабирование модели ограничено.
- Связанные планы и требования:
  - `PLAN-001`, `REQ-004`

### TD-002. Local-first resilience

- Статус: approved
- Контекст:
  - UX не должен разваливаться из-за краткой недоступности API.
- Решение:
  - frontend хранит локальный snapshot в `localStorage` и продолжает работу в офлайн-режиме.
- Последствия:
  - локальная устойчивость улучшается, но merge нескольких независимых потоков изменений не появляется автоматически.
- Связанные планы и требования:
  - `REQ-005`

### TD-003. Reverse-proxy auth boundary

- Статус: approved
- Контекст:
  - hosted-версия требует auth без встраивания собственного full auth-provider в MONDAY.
- Решение:
  - API доверяет identity headers от внешнего auth-layer и защищает рабочие endpoints при production-настройке.
- Последствия:
  - безопасность зависит от корректного proxy perimeter.
- Связанные планы и требования:
  - `REQ-008`

### TD-004. Каноническая пара `.docs`

- Статус: approved
- Контекст:
  - техническое знание было размазано между `README.md`, кодом и deploy-артефактами.
- Решение:
  - `.docs/product.md` и `.docs/technical.md` становятся обязательным каноном для продукта и системы.
- Последствия:
  - каждое существенное изменение должно сначала или одновременно обновлять docs pair.
- Связанные планы и требования:
  - `PLAN-001`, `PD-004`

## 14. История изменений документа

- История ниже ведется только в рамках текущего этапа.
- Межэтапная история сохраняется через архив финальной версии этапа.
- `2026-04-23 | v0.1.0 | тип: mixed | важность: важно в документации | впервые создан канонический technical document для MONDAY и зафиксирован фактический POC B контур`
- `2026-04-24 | v0.1.1 | тип: hardening | важность: важно для hosted-контура | security headers, async scrypt + SHA-256 comparison, rate-limit на health, согласование payload-лимитов, параметризация backup/restore для timeweb, CSRF-модель зафиксирована как SameSite+JSON-only`
