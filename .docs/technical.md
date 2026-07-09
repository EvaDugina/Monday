# Technical Document

## 1. Паспорт документа

- Статус: approved
- Владелец: команда проекта
- Последнее обновление: 2026-07-09
- Стадия проекта: `POC B`
- Версия проекта: `v0.1.37`
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
  - `.docs/demo.md`
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

Система предоставляет веб-доску задач с локальным состоянием, серверным снимком состояния, optimistic concurrency, архивом, резервными снимками, client-side PNG-экспортом активной доски и синхронизируемыми через аккаунт настройками (фон + выбранный город погоды; байты фоновых изображений — в отдельном серверном blob-хранилище), а также отдельный hosted-контур с reverse proxy и внешней аутентификацией.

### 2.2. Границы системы

- Репозиторий отвечает за frontend, API, локальное и серверное хранение состояния, а также compose/deploy-артефакты MONDAY.
- Репозиторий не реализует собственный full auth-provider, а опирается на внешний слой Authentik и reverse proxy.
- Репозиторий не включает product analytics, alerting platform и полноценную admin-панель.

### 2.3. Ключевые технические сущности

- `Task`: единица пользовательской работы на доске.
- `CategoryOption`: пользовательская секция доски с устойчивым ключом, названием и цветом.
- `Deadline`: дедлайн задачи (`none`, `date`, `range`, `recurring`; weekly recurring использует `mode=week` и `weekday`).
- `BackgroundDecoration`: фоновое изображение с позицией на page-sized background layer и горизонтальным anchor от центра; в синхронизируемом snapshot представлено ссылкой `BackgroundDecorationRef` (геометрия + `imageId`), сами байты изображения хранятся отдельно в blob-хранилище сервера.
- `BackgroundDecorationRef`: ссылка на фоновое изображение внутри `AccountSettings` — `imageId` + геометрия (`left`, `top`, `width`, `height?`, `opacity`, `rotation`, `depth`); base64 в ссылке запрещён.
- `AccountSettings`: пользовательские настройки аккаунта внутри board snapshot — `backgroundDecorations: BackgroundDecorationRef[]` и опциональный `weatherCityId`.
- `WeatherRainLayer`: client-only canvas overlay дождя, включаемый погодным виджетом.
- `TaskPngExport`: client-only canvas renderer для скачивания отчёта активной доски без серверного API и новых зависимостей.
- `ServerTasksState`: серверный снимок доски с `tasks`, `categories`, `settings`, `updatedAt` и `version`.
- `background_images`: серверная blob-таблица байтов фоновых изображений с привязкой к user key.
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
- Open-Meteo Forecast API как внешний серверный источник погоды без API-ключа
- локальные Yandex Weather light SVG icons в `public/weather-icons`
- локальные SVG-флаги стран в `public/flags` для weather city picker
- локальный vendor `public/vendor/raindrop-fx/index.js` для canvas-анимации дождя

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
  - после успешного `/api/tasks` серверный snapshot применяется как актуальное состояние доски
  - локальный snapshot остается fallback только при недоступности API
- Изменение задач или категорий:
  - UI меняет локальный snapshot
  - immediate sync queue без debounce отправляет `PUT /api/tasks` c `expectedVersion`
  - при `409` клиент берет серверный snapshot из ответа, делает трехсторонний merge `lastSynced + local + server` и повторяет `PUT` без conflict-баннера
- Category editing:
  - список категорий хранится в состоянии приложения рядом с задачами
  - новая категория получает стабильный строковый ключ и следующий цвет из палитры
  - клик по `category-section__title` открывает inline input для переименования
  - клик по `category-section__dot` открывает native color picker
  - изменение названия или цвета участвует в localStorage persistence и immediate server sync
  - archived-категории остаются в board snapshot, но исключаются из активной доски и create/category-picker
  - архивирование категории проставляет `status='archived'`, `archivedAt` и закрывает открытые задачи этой категории тем же timestamp
  - удаление категории доступно только с экрана архива и удаляет задачи этой категории вместе с category entry
- Task row editing:
  - `TaskItem` открывает модалку редактирования по клику на `task-card__title-cluster`
  - `task-card__pin-button` переключает `Task.pinned` прямо из карточки, останавливает event propagation и не открывает модалку/drag/swipe
  - inline input для заголовка в строке задачи не рендерится
  - `TaskDetailsModal` редактирует title через обычный text input и сохраняет trimmed title вместе с остальными полями
  - `task-card__title-shell` ограничивает отображаемое название максимумом 90% ширины, а переполнение скрывается через ellipsis и full-title hover
  - per-task category chip/button не рендерится; смена категории задачи выполняется через drag&drop между секциями
- PNG export:
  - `src/utils/taskPngExport.ts` рендерит отдельный canvas-отчёт без html-to-canvas зависимостей
  - кнопка `.export-button` в правом верхнем floating-layer скачивает `monday-tasks-YYYY-MM-DD_HH-mm.png`
  - вход экспорта — `activeCategories` и уже отсортированный `tasksByCategory`; архивные задачи и archived-категории исключаются
  - PNG содержит заголовок, timestamp, цвета/названия категорий, счетчики, задачи и метки `закреплено`/`срочно`/дедлайн
- Backup:
  - UI вызывает `POST /api/backups`
  - API создает или переиспользует последний backup текущей версии
  - retention ограничивает число последних backup-снимков на пользователя
- Background decorations:
  - UI принимает image-файлы через page-level drag&drop без header-кнопки загрузки
  - клиент сжимает изображения (кроме GIF), затем сразу загружает байты на сервер (`POST /api/backgrounds`) и получает `imageId`; декорация рендерится через `GET /api/backgrounds/{id}`
  - геометрия фоновых декораций хранится как `BackgroundDecorationRef[]` внутри `settings` синхронизируемого board snapshot; base64 в snapshot не попадает
  - изменения background edit-mode остаются черновиком до save-and-exit; на сохранении черновик коммитится в `settings.backgroundDecorations`, что триггерит обычный `PUT /api/tasks`
  - фон одинаков во всех браузерах одного пользователя; изменения из другого браузера появляются после reload (bootstrap-pull), а не live
  - при первом запуске новой версии одноразовая миграция переносит legacy `monday:background-decorations`/`monday:weather-city` из `localStorage` в аккаунт: base64 загружается в blob-хранилище, refs сидятся в server snapshot, legacy-ключи очищаются
  - оффлайн: геометрия/город берутся из localStorage-зеркала snapshot, изображения — из HTTP-кэша браузера (immutable long max-age); добавление нового фона требует онлайна
  - слой фона рендерится за доской как page-sized слой и прокручивается вместе со страницей без parallax-offset от pointer
  - отдельная floating-панель вне `app__inner` включает background edit-mode
  - в background edit-mode кнопка редактирования заменяется кнопкой сохранения изменений и выхода
  - изменения background edit-mode живут в `backgroundDecorations` state/ref как черновик; `saveBackgroundDecorations` вызывается только при явном save-and-exit
  - отдельный edit-mode поднимает слой над доской, включает pointer-drag изображений и click-selection конкретной картинки
  - выбранная картинка получает синюю selection-рамку, кнопку удаления, четыре corner resize handles и size-label
  - corner resize меняет `width`, `height`, `left` и `top` пропорционально, сохраняя aspect ratio и противоположный угол как якорь
  - горизонтальная координата хранится как pixel offset от центра фонового слоя; старые процентные `left` без `anchor` мигрируются при чтении из `localStorage`
  - секции категорий используют CSS liquid glass-подложку (`backdrop-filter`, прозрачный фон, блики и граница) с минимальной белой заливкой для читаемости поверх фоновых изображений
- Weather:
  - weather badge рендерится вне `app__inner` в левом верхнем углу как `position: absolute` и прокручивается вместе со страницей (не закреплён у верха вьюпорта)
  - выбранный город хранится в `settings.weatherCityId` синхронизируемого board snapshot и одинаков во всех браузерах пользователя; `WeatherBadge` получает `cityId`/`onCityChange` пропсами от `App`
  - `WeatherBadge` из WMO `weather_code` выводит `SkyCondition` (`clear|partly|cloudy|none`) и отдаёт её в `App` через `onSkyConditionChange`
- Погодный фон и дневная палитра:
  - `App` кладёт `SkyCondition` в атрибут `data-sky` на `.app`; фон доски голубеет по ясности (`clear` > `partly` > `cloudy`), при `cloudy`/`partly` рендерится слой `.sky-clouds` с дрейфом `public/images/cloud.png`; `prefers-reduced-motion` отключает анимацию
  - тёмная тема удалена: `ThemeMode`, `data-theme`, `:root[data-theme='dark']`, авто-переключение по времени и `.theme-widget` больше не используются; при старте `App` чистит legacy `localStorage['monday:theme']`
- Управление погодой (`WeatherControls`, `src/weatherControls.ts`, localStorage `monday:weather-controls`, не синхронизируется):
  - `WeatherControls.live` («погода live») задаёт режим: при `live` слои идут по прогнозу, а кнопки слоёв на виджете `disabled` (серые); при выключенном `live` кнопки управляют `rainEnabled/skyEnabled/cloudsEnabled` вручную, а дождь показывается принудительно с ручной интенсивностью
  - виджет несёт тумблер «погода live» + кнопки дождь/небо/облака + gear (открывает `WeatherControlModal`); модалка задаёт ручную интенсивность дождя, насыщенность неба, прозрачность/parallax/скорость облаков и режим редактирования (в `live` тумблеры слоёв и интенсивность заблокированы)
  - глобальные параметры (`--cloud-opacity`, `--cloud-speed`, `--sky-strength`, `--parallax-*`) применяются как CSS-переменные на `<html>`, а per-cloud (`--depth`, `--offset-x/y`, `--cloud-dur`, `--base-opacity`, `animation-delay`, `top`, `width`) — как inline-стили на каждом `.sky-clouds__item` — так React не конфликтует с императивной записью; насыщенность неба = alpha `.app[data-sky]`
  - облака хранятся списком `WeatherControls.clouds: SkyCloud[]` (id/top/x/y/width/depth/duration/opacity/delay); старый формат `cloudOffsets` мигрируется в список в `sanitizeWeatherControls`; лимиты `MIN_CLOUD_WIDTH`/`MAX_CLOUD_WIDTH`/`MAX_CLOUDS` в `src/weatherControls.ts`
  - движение указателя двигает только parallax-сдвиг (`--parallax-*`) и не трогает яркость; подсветка (`data-clouds-active`) включается на скролле страницы и гаснет спустя idle, переход яркости/фильтра — `9000ms cubic-bezier(0.4, 0, 0.2, 1)`
  - режим редактирования включает `pointer-events` у облаков и на время редактирования отключает дрейф и parallax; выбранное облако (`sky-clouds__item--selected`) можно перетаскивать (offset x/y), менять размер за четыре угла (якорь — противоположный угол, ширина по горизонтали, высота по aspect) и удалять крестиком; кнопка «+ Облако» в `weather-edit-bar` добавляет облако с рандомизированными depth/drift
  - пользователь выбирает город через стилизованный listbox, ручной ввод названия не используется
  - локальный список городов включает `tbilisi`
  - каждая city option содержит `countryCode`, который мапится на локальный SVG-флаг `public/flags/{countryCode}.svg`
  - координаты города берутся из клиентского списка, без Open-Meteo Geocoding API
  - клиент вызывает same-origin endpoint `GET /api/weather/current?latitude=...&longitude=...`
  - API валидирует координаты и через `server/src/weather.ts` вызывает Open-Meteo Forecast для `current=temperature_2m,weather_code,precipitation`
  - серверный вызов Open-Meteo подключается к `OPEN_METEO_CONNECT_HOST` с дефолтом `open-meteo.com`, сохраняя SNI/Host `api.open-meteo.com`; это обходит локальный DNS/TLS-перехват, когда `api.open-meteo.com` резолвится в `198.18.0.0/15`
  - запрос погоды прерывается через 8 секунд, чтобы UI не зависал в состоянии загрузки
  - `weather_code` мапится на дневные коды Yandex Weather icon set (`skc_d`, `bkn_ra_d`, `ovc_ts` и т.п.); ночные варианты не используются
  - итоговая иконка загружается как локальный SVG из `public/weather-icons/{iconCode}.svg` через `withAppBasePath`
  - флаги городов загружаются как локальные SVG из `public/flags/{countryCode}.svg` через `withAppBasePath`; emoji-флаги не используются
  - `WeatherBadge` выводит `RainIntensity = none | light | moderate | heavy | max` из `precipitation` и WMO `weather_code`: drizzle/slight rain дают лёгкий профиль, moderate rain — средний, heavy precipitation — heavy, heavy rain/thunderstorm — max
  - App хранит `weatherRainIntensity` от прогноза и `isWeatherLiveEnabled: boolean`, который по умолчанию `true`; выключенное состояние скрывает rain-layer, включённое берёт интенсивность из прогноза
  - rain-layer рендерится компонентом `WeatherRainEffect` как fixed canvas overlay: сначала загружается локальный `/vendor/raindrop-fx/index.js`, при ошибке запускается внутренняя canvas-анимация падающих капель
  - `WeatherRainEffect` принимает intensity и мапит её на профили плотности, размера капель, mist opacity и fallback canvas opacity; прежние параметры сохранены как профиль `max`
  - старый CSS/image-паттерн дождя не используется, чтобы дождливое состояние выглядело как живая анимация
  - ошибки погоды не блокируют доску и отображаются только как fallback в weather badge
- Hosted auth:
  - reverse proxy передает identity headers
  - API извлекает auth context из заголовков
  - при `AUTH_REQUIRED=true` защищаются `/api/me`, `/api/tasks`, `/api/backups`, `/api/backgrounds`

### 3.4. Технические границы и горячие точки

- состояние MONDAY хранится как единый versioned snapshot, а не как набор независимых серверных сущностей
- текущий auth trust model зависит от корректного reverse proxy и заголовков `X-Authentik-*`
- часть infra уже выглядит ближе к `MVP`, но общий quality baseline пока не дотягивает до полноценного stage promotion
- архив и локальное состояние нормализуются на клиенте, включая pruning старых закрытых задач

## 4. Карта кодовой базы

### 4.1. Главные директории и файлы

- `src/App.tsx`
  - orchestration UI, category state, immediate sync queue, backup loop, archive flow, silent 409 merge/retry, local background decoration flow
- `src/api.ts`
  - typed API client и нормализация ошибок
- `src/storage.ts`
  - localStorage persistence, archive pruning, sanitization
- `src/types.ts`
  - frontend contracts
- `src/components/BackgroundDecorations.tsx`
  - статический декоративный фоновый слой, pointer-drag и удаление локальных изображений
- `src/components/WeatherRainEffect.tsx`
  - canvas-анимация дождя поверх доски с локальным `raindrop-fx` vendor и canvas fallback
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
  - `POST /api/backgrounds` (binary image upload, отдельный `express.raw` парсер до 6 MB, возвращает `{ id }`)
  - `GET /api/backgrounds/:id` (отдаёт байты изображения с `Content-Type` и `Cache-Control: immutable`)
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
- frontend `CategoryOption`:
  - `key`, `label`, `color`, `status?`, `archivedAt?`
  - `key` является стабильным строковым идентификатором категории и не меняется при переименовании
  - дефолтные категории: `passion`, `routine`, `body`, `projects`
  - пользовательские категории ограничены серверной валидацией по количеству, длине ключа/названия и формату цвета `#RRGGBB`
  - отсутствие `status` означает активную категорию; archived-категория хранит `status='archived'` и ISO `archivedAt`
- task row badges:
  - вычисляются на клиенте из существующих `urgent`, `pinned` и `deadline`
  - `urgent` badge и интерактивная pin-кнопка рендерятся слева от title; deadline/recurring badges рендерятся справа в той же строке
  - title cluster открывает edit-modal, title редактируется в модалке; отдельная category-chip кнопка в строке отсутствует
  - не добавляют новые поля в snapshot и не требуют миграции SQLite
- frontend `BackgroundDecoration` (render/draft):
  - `anchor`, `id`, `imageId?`, `name`, `src`, `left`, `top`, `width`, `opacity`, `rotation`, `depth`
  - `src` — это `GET /api/backgrounds/{imageId}` URL; `imageId` связывает декорацию с серверным blob
  - `anchor='center'` означает, что `left` является пиксельным смещением центра изображения от середины фонового слоя
  - `top` остается процентной координатой изображения внутри page-sized background layer
  - `width` и опциональный `height` меняются через corner resize handles выбранного фонового изображения в background edit-mode без нарушения пропорций
  - ограничивается шестью изображениями
- frontend `BackgroundDecorationRef` (synced):
  - `id`, `imageId`, `name`, `left`, `top`, `width`, `height?`, `opacity`, `rotation`, `depth` (без `src`/base64)
  - сериализуется внутри `settings.backgroundDecorations` board snapshot с канонической сортировкой ключей для стабильного change-detection
- frontend `AccountSettings`:
  - `backgroundDecorations: BackgroundDecorationRef[]`, опциональный `weatherCityId`
  - едет внутри `state.tasks_json` и синхронизируется тем же `PUT/GET /api/tasks`; локальное зеркало — ключ `monday:settings`
- `LocalStateSnapshot`:
  - локальные `tasks`, `categories`, `settings`, `version`, `updatedAt`
- SQLite tables:
  - `state(id=1, tasks_json, updated_at, version)`
  - `task_backups(user_key, user_email, user_name, tasks_json, state_version, state_updated_at, source, created_at)`
  - `background_images(id, user_key, mime, bytes BLOB, created_at)` — байты фоновых изображений; orphan GC удаляет непривязанные блобы старше grace-окна на успешной записи snapshot
  - `state.tasks_json` обратно совместимо читает старый формат `Task[]`, но новые записи сохраняются как `{ "tasks": Task[], "categories": CategoryOption[], "settings": AccountSettings }`

### 5.3. Выходные данные

- UI:
  - активная доска
  - экран архива
  - статусы `synced`, `syncing`, `offline`, `invalid`
  - backup tooltip/result
- API:
  - `/api/tasks` отдает снимок состояния с задачами и категориями
  - `PUT /api/tasks` отдает новую версию и timestamp
  - `POST /api/backups` отдает метаданные созданного или переиспользованного backup
- operations:
  - файловые backup-артефакты для SQLite и Authentik PostgreSQL через shell scripts

### 5.4. Контракты и совместимость

- `category` является непустым строковым ключом категории длиной до 64 символов
- `categories` в `PUT /api/tasks` содержит от 1 до 16 категорий с уникальными ключами, названием до 40 символов, цветом `#RRGGBB`, опциональным `status='archived'` и опциональным ISO `archivedAt`
- `status` ограничен `open | closed`
- `urgent` обязателен как boolean
- `deadline.kind='recurring'` поддерживает `mode='day' | 'week' | 'month'`; для `week` обязателен `weekday` от `0` до `6`
- `closedAt` обязателен только для `closed` задачи
- `PUT /api/tasks` использует optimistic concurrency и не делает merge при несовпадении версии
- backup снимок не дублируется, если последняя сохраненная версия для пользователя уже совпадает с текущей
- `PUT /api/tasks` принимает опциональный `settings` (`backgroundDecorations` ≤ 6 refs с числовыми границами и `imageId` без data-URL; `weatherCityId` из `[a-z0-9-]`); при 409 клиент разрешает конфликт settings как last-writer-wins (локальные побеждают), задачи/категории — трёхсторонним merge
- `POST /api/backgrounds` принимает только whitelisted image `Content-Type` (`gif|jpeg|png|webp`) до 5 MB; это raw-бинарь, а не form-post, поэтому не нарушает JSON-only write-модель CSRF
- фоновые изображения теперь входят в аккаунт: геометрия — в `settings` snapshot, байты — в `background_images`; base64 в `PUT /api/tasks` запрещён
- погодный виджет не является частью snapshot API MONDAY; браузер ходит только в same-origin `/api/weather/current`, внешний forecast-запрос выполняет API-сервер, а SVG-иконки и SVG-флаги отдаются как локальные static assets приложения; выбранный город синхронизируется через `settings.weatherCityId`
- PNG-экспорт активной доски полностью клиентский, не добавляет endpoint и не попадает в snapshot/backup
- hosted CSP держит `connect-src 'self'`; погодные SVG, SVG-флаги и фоновые изображения (`/api/backgrounds/:id`) остаются в `img-src 'self'`

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
- client-side логика рассчитана на современный браузер с `localStorage`, `fetch`, `crypto.randomUUID` и Blob/`atob`
- фоновые изображения хранятся серверными blob'ами; загрузка нового фона требует доступного API, существующий фон рендерится из HTTP-кэша оффлайн; при ошибке загрузки UI показывает тост и оставляет доску рабочей
- in-memory rate limiting не переживает рестарт сервиса и не распределяется между несколькими инстансами

### 7.2. Нефункциональные требования в реализации

- сервер валидирует payload задач по схеме и длинам полей; `MAX_TASKS=500`, `MAX_DESCRIPTION_LENGTH=2000`, `MAX_TITLE_LENGTH=200`, глобальный JSON body limit `2 MB`
- upload фоновых изображений использует отдельный route-scoped `express.raw` парсер (limit `6 MB`, только image `Content-Type`), не меняя глобальный JSON-лимит; серверный `MAX_BACKGROUND_IMAGE_BYTES=5 MB`, превышение отдаёт чистый `413`
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
- локальная персонализация фона: file drag&drop, page-sized scroll layer, floating-toolbar вне `app__inner`, насыщенный рендер изображений, hover-акцент, черновой edit-mode, selected-image outline, пропорциональный corner resize, удаление, прозрачные glass-подложки категорий
- сценарий синхронизации: проверка server-authoritative reload, immediate save, silent 409 retry и статусов `syncing`/`offline`
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
- повторная отправка после `409`:
  - серверная `version` уже выше ожидаемой; клиент автоматически мержит локальное изменение со свежим snapshot и повторяет запись
- `401 Authentication required`:
  - отсутствуют корректные auth headers при включенном `AUTH_REQUIRED`
- пустая локальная доска после ошибки parsing:
  - локальный snapshot поврежден и был помещен в quarantine key

### 10.2. Проверки и безопасные обходные пути

- проверить `GET /api/health/ready`
- проверить локальный запуск `npm run dev`
- в hosted-контуре прогнать `./scripts/smoke-production.sh`
- при повторяющихся ошибках записи проверить JSON-логи API и актуальность `expectedVersion`; ручного conflict-flow в UI больше нет

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
  - добавить новую категорию через поле под доской
  - кликнуть по заголовку новой категории, переименовать ее и сохранить blur/Enter
  - кликнуть по точке категории, выбрать другой цвет и убедиться, что цвет секции и карточек обновился
  - создать по одной задаче минимум в двух разных категориях
  - отредактировать описание, дедлайн, еженедельный повтор, закрепление и срочность одной задачи
  - открыть модалку редактирования задачи и убедиться, что выбора категории в ней нет
  - изменить название в модалке редактирования задачи, сохранить и убедиться, что новое название отображается в строке задачи
  - нажать булавку на карточке и убедиться, что закрепление переключается без открытия модалки, а задача перемещается в верхнюю группу категории
  - убедиться, что `СРОЧНО` и активная булавка находятся слева от названия, а дедлайн или повтор вроде `Каждый день` отображается badge справа от названия
  - кликнуть по `task-card__title-cluster` и убедиться, что открылась модалка редактирования задачи
  - нажать правую верхнюю кнопку скачивания и убедиться, что скачался PNG со всеми активными категориями и открытыми задачами
  - убедиться, что переключателя темы нет, старый `monday:theme=dark` после reload очищается, а интерфейс остается в дневной светлой палитре
  - убедиться, что inline-редактирование заголовка в строке не появляется, длинное название занимает не больше 90% строки и обрезается с троеточием
  - убедиться, что в header нет кнопок управления фоном и identity-строки пользователя
  - перетащить image-файл на страницу и убедиться, что он появился за доской, выглядит не блекло, а drag&drop задач после этого не сломан
  - включить режим редактирования фона через floating-панель вне центральной колонки, убедиться, что кнопка редактирования стала кнопкой сохранения, кликнуть изображение и увидеть синюю рамку, кнопку удаления, угловые resize-точки и label размера
  - перетащить изображение в другую область и растянуть его за разные углы, убедившись, что пропорции не меняются
  - обновить страницу до сохранения и убедиться, что черновые изменения фона не применились к `localStorage`
  - повторить изменение и нажать кнопку сохранения фона, убедиться, что позиция, ширина и высота изображения сохранились после reload, а hover вне зон категорий слегка повышает яркость/контраст
  - изменить ширину окна и убедиться, что изображение остается примерно в том же месте относительно центра доски
  - удалить одно изображение кнопкой в правом верхнем углу самой картинки
  - прокрутить страницу и убедиться, что фоновые изображения прокручиваются вместе с ней и не получают parallax-смещения от движения указателя
  - убедиться, что все видимые категории имеют прозрачную liquid glass-подложку и текст читается поверх загруженных изображений
  - перетащить задачу в другую категорию
  - убедиться, что цветовые акценты задачи сменились на цвет новой категории без box-shadow у самой task-card
  - нажать кнопку архива у категории и подтвердить перенос категории с задачами в архив
  - открыть архив, восстановить archived-категорию и убедиться, что она вернулась на активную доску
  - снова отправить категорию в архив и удалить ее из архива
  - закрыть задачу и убедиться, что она появилась в архиве
  - восстановить задачу из архива
- Ожидаемый результат:
  - все действия отражаются без перезагрузки страницы
  - после обновления страницы состояние сохраняется
- Что считать регрессией:
  - пропажа задачи, сломанный drag-and-drop, неправильный экран архива или потеря данных после reload
- Какие артефакты или скриншоты сохранить:
  - при сбое сохранить скрин экрана и логи контейнеров app/api

### MTS-002. Server-authoritative sync и офлайн-переход

- Цель:
  - проверить, что при открытии берется серверная версия, а устаревший клиент сохраняет изменения без conflict-баннера
- Предусловия:
  - локальный или hosted stack доступен
  - есть минимум два клиента или один клиент + прямое изменение серверного состояния
- Канал: `Web UI`
- Шаги:
  - открыть доску в двух вкладках
  - в первой вкладке изменить задачу и дождаться `synced`
  - во второй вкладке изменить ту же доску без reload
  - убедиться, что conflict-баннер не появляется, статус проходит через `syncing` и возвращается в `synced`
  - обновить вторую вкладку и убедиться, что доска загружается с серверным состоянием
  - затем временно остановить API и убедиться, что UI показывает офлайн-режим
- Ожидаемый результат:
  - серверный `409` обрабатывается автоматическим merge/retry без действия пользователя
  - при недоступности сервера изменения остаются локальными и это явно обозначено
- Что считать регрессией:
  - появление conflict-баннера, потеря изменений после reload или отсутствие понятного сообщения об офлайне
- Какие артефакты или скриншоты сохранить:
  - скрин статуса синхронизации и JSON-лог API на момент повторной записи

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
  - сервер хранит один versioned snapshot и принимает запись только при совпадении `expectedVersion`; клиент на `409` автоматически берет свежий snapshot, накладывает локальные изменения через трехсторонний merge и повторяет запись.
- Последствия:
  - пользователь не видит ручной conflict-flow, но модель остается snapshot-based и не заменяет полноценные per-entity операции для будущего multi-user режима.
- Связанные планы и требования:
  - `PLAN-001`, `REQ-004`

### TD-002. Local-first resilience

- Статус: approved
- Контекст:
  - UX не должен разваливаться из-за краткой недоступности API.
- Решение:
  - frontend хранит локальный snapshot в `localStorage` и продолжает работу в офлайн-режиме; при успешном открытии серверный snapshot всегда становится источником актуального состояния.
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

### TD-005. Local-only background decorations

- Статус: superseded by `TD-008`
- Контекст:
  - фоновая декорация нужна как персональная настройка интерфейса, а не как часть данных доски.
- Решение:
  - изображения хранились в браузерном `localStorage` по отдельному ключу и рендерились отдельным статическим компонентом за доской; перемещение, удаление и пропорциональное масштабирование доступны только в background edit-mode и сохранялись в storage только после save-and-exit, а читаемость доски обеспечивается glass-подложками категорий.
- Последствия:
  - фон не синхронизировался между устройствами; это ограничение снято в `TD-008` (фон переведён в аккаунт), draft-until-save UX и glass-подложки сохранены.
- Связанные планы и требования:
  - `REQ-009`, `PD-005`, `TD-008`

### TD-006. Board snapshot включает категории

- Статус: approved
- Контекст:
  - пользовательские категории должны синхронизироваться между браузером и сервером вместе с задачами, иначе добавление, переименование и цвет секций будут расходиться между устройствами.
- Решение:
  - `state.tasks_json` сохраняет единый board snapshot `{ tasks, categories }`; legacy-строки в формате `Task[]` читаются как задачи с дефолтными категориями.
- Последствия:
  - физическая схема SQLite не меняется, backup-снимки продолжают копировать `tasks_json`, а optimistic concurrency теперь сравнивает весь board snapshot, включая категории.
- Связанные планы и требования:
  - `REQ-001`, `REQ-004`, `TD-001`

### TD-007. Погода через same-origin connector

- Статус: approved
- Контекст:
  - пользователю нужна температура дня в отдельном floating badge, но проект не должен добавлять серверные секреты или усложнять API ради вспомогательного UI-виджета.
- Решение:
  - использовать Open-Meteo Forecast через same-origin endpoint MONDAY: координаты брать из локального списка городов, forecast `current=temperature_2m,weather_code,precipitation` использовать для температуры, дневной локальной Yandex light-иконки и canvas rain-overlay; выбранный город синхронизировать через `settings.weatherCityId` (см. `TD-008`), а флаги городов показывать через локальные SVG assets.
- Последствия:
  - доступность погодных данных зависит от внешнего Open-Meteo и сетевого доступа API-сервера, а weather icons, флаги и `raindrop-fx` остаются локальными static assets; выбор города теперь одинаков во всех браузерах пользователя.
- Связанные планы и требования:
  - `REQ-010`, `TD-008`

### TD-008. Account-synced settings + blob storage для фона

- Статус: approved
- Контекст:
  - фон и выбранный город хранились только в `localStorage`, поэтому в разных браузерах одного пользователя была разная информация; base64-изображения слишком тяжелы, чтобы класть их в JSON-snapshot.
- Решение:
  - геометрия фона и `weatherCityId` вынесены в `AccountSettings` внутри `state.tasks_json` и синхронизируются тем же versioned snapshot и конфликт-механизмом, что и задачи (`TD-001`); settings не мержатся пофайлово — last-writer-wins (локальные побеждают). Байты изображений хранятся в отдельной таблице `background_images` и загружаются/отдаются через `POST /api/backgrounds` и `GET /api/backgrounds/:id` (route-scoped raw parser, глобальный JSON-лимит не тронут). Orphan GC чистит непривязанные блобы на успешной записи snapshot с grace-окном. Одноразовая миграция переносит legacy localStorage-фон/город в аккаунт.
- Последствия:
  - фон и город одинаковы во всех браузерах пользователя (обновляются на reload, не live); backup-снимки автоматически включают refs (не байты); восстановление очень старого backup может ссылаться на GC'нутый `imageId` — такие декорации скрываются на 404. Модель остаётся single-shared-snapshot и рассчитана на одного пользователя.
- Связанные планы и требования:
  - `REQ-009`, `REQ-010`, `TD-001`, `TD-002`, `TD-005`

## 14. История изменений документа

- История ниже ведется только в рамках текущего этапа.
- Межэтапная история сохраняется через архив финальной версии этапа.
- `2026-04-23 | v0.1.0 | тип: mixed | важность: важно в документации | впервые создан канонический technical document для MONDAY и зафиксирован фактический POC B контур`
- `2026-04-24 | v0.1.1 | тип: hardening | важность: важно для hosted-контура | security headers, async scrypt + SHA-256 comparison, rate-limit на health, согласование payload-лимитов, параметризация backup/restore для timeweb, CSRF-модель зафиксирована как SameSite+JSON-only`
- `2026-07-06 | v0.1.2 | тип: UX | важность: важно в документации | weekly recurring badge построен поверх существующего Deadline-контракта, inline title input ограничен как flex-item и не ломает grid карточки, category picker убран из edit-modal`
- `2026-07-06 | v0.1.3 | тип: UX | важность: важно в документации | background decorations вынесены в localStorage-only UI слой с upload/drag&drop, очисткой и parallax без изменений API/SQLite`
- `2026-07-06 | v0.1.4 | тип: UX | важность: важно в документации | background edit-mode поддерживает pointer-drag координат, hover-акцент и удаление отдельных изображений без изменений API/SQLite`
- `2026-07-06 | v0.1.5 | тип: UX | важность: важно в документации | header upload button удалён, parallax отключён, фоновые изображения рендерятся насыщеннее, категории получили liquid glass CSS-подложку`
- `2026-07-06 | v0.1.6 | тип: UX | важность: важно в документации | background decorations переведены на page-sized scroll layer, drag-координаты считаются от слоя страницы, glass-подложки категорий сделаны прозрачнее`
- `2026-07-06 | v0.1.7 | тип: UX | важность: важно в документации | background controls вынесены из Header в floating-toolbar, добавлен resize фоновых изображений, header identity скрыта`
- `2026-07-06 | v0.1.8 | тип: UX | важность: важно в документации | background edit action заменяется на save-and-exit, left-координата фоновых изображений хранится как offset от центра с миграцией legacy процентов`
- `2026-07-06 | v0.1.9 | тип: UX | важность: важно в документации | task row badges унифицированы для срочности, закрепления, дедлайнов и повторов без изменения snapshot/API`
- `2026-07-06 | v0.1.10 | тип: UX+data | важность: важно в документации | категории перенесены в board snapshot: добавление секций, inline-переименование и смена цвета синхронизируются через existing optimistic concurrency`
- `2026-07-06 | v0.1.11 | тип: UX+integration | важность: важно в документации | header получил client-only weather badge с Open-Meteo, локальным выбором города и fallback при ошибке внешнего API`
- `2026-07-06 | v0.1.12 | тип: UX | важность: важно в документации | WeatherBadge стал отдавать rain state в App и включает лёгкий CSS rain-layer при дождливых current conditions`
- `2026-07-06 | v0.1.13 | тип: UX+data | важность: важно в документации | CategoryOption расширен optional status/archivedAt, активный экран фильтрует archived-категории, архив стал местом восстановления и удаления категорий`
- `2026-07-06 | v0.1.14 | тип: UX+integration | важность: важно в документации | WeatherBadge вынесен в root floating-layer вне app__inner, geocoding заменён выбором города из локального списка координат, WMO weather_code управляет цветной иконкой`
- `2026-07-06 | v0.1.15 | тип: UX+integration | важность: важно в документации | WeatherBadge использует Yandex Weather light SVG icons: WMO weather_code и Open-Meteo is_day мапятся на Yandex iconCode`
- `2026-07-06 | v0.1.16 | тип: UX+integration | важность: важно в документации | production CSP разрешает Open-Meteo и Yandex SVG, city select стилизован, добавлен Тбилиси, background resize хранит width/height`
- `2026-07-06 | v0.1.17 | тип: UX | важность: важно в документации | TaskItem больше не рендерит inline title input и category-chip button; title cluster открывает edit-modal, title в edit-modal read-only, title shell расширен до 90% строки`
- `2026-07-06 | v0.1.18 | тип: UX | важность: важно в документации | background clear action удалён из floating toolbar`
- `2026-07-06 | v0.1.19 | тип: UX+assets | важность: важно в документации | WeatherBadge загружает SVG-иконки из public/weather-icons через app base path, production CSP больше не разрешает внешний image-host Yandex`
- `2026-07-06 | v0.1.20 | тип: UX+assets | важность: важно в документации | добавлен AppleEmojiText и локальный public/emoji/apple/1f30a.png для одинакового отображения 🌊 без системного Apple Color Emoji`
- `2026-07-06 | v0.1.21 | тип: UX+assets | важность: важно в документации | AppleEmojiText, public/emoji/apple, emoji font stack и countryEmoji в WeatherBadge удалены`
- `2026-07-06 | v0.1.22 | тип: UX+integration | важность: важно в документации | WeatherBadge использует Open-Meteo current forecast без rain/showers, abort-timeout и локальные SVG-флаги стран вместо emoji`
- `2026-07-06 | v0.1.23 | тип: UX+integration | важность: важно в документации | добавлен /api/weather/current и серверный Open-Meteo connector с OPEN_METEO_CONNECT_HOST для обхода локального DNS/TLS-перехвата`
- `2026-07-06 | v0.1.24 | тип: UX | важность: важно в документации | background edit-mode хранит черновик до save-and-exit, selected-image controls показывают синюю рамку и corner handles с пропорциональным resize`
- `2026-07-06 | v0.1.25 | тип: UX+assets | важность: важно в документации | WeatherRainEffect заменил CSS/image rain-layer на canvas-анимацию с локальным public/vendor/raindrop-fx и fallback canvas rain`
- `2026-07-06 | v0.1.26 | тип: UX | важность: важно в документации | App получил rainOverride и glass switch для ручного включения/выключения WeatherRainEffect поверх автоматического прогноза`
- `2026-07-07 | v0.1.27 | тип: UX | важность: важно в документации | weather rain switch получил короткий borderless-вид и label "погода live"; TaskDetailsModal снова сохраняет title`
- `2026-07-07 | v0.1.28 | тип: UX | важность: важно в документации | WeatherBadge вычисляет RainIntensity из прогноза, WeatherRainEffect применяет light/moderate/heavy/max профили, ручной режим включает max`
- `2026-07-07 | v0.1.29 | тип: sync | важность: важно в документации | frontend применяет серверный snapshot при старте, отправляет изменения сразу и автоматически обрабатывает 409 через merge/retry без conflict UI`
- `2026-07-07 | v0.1.30 | тип: UX | важность: важно в документации | weather live-switch стартует включённым и управляет только видимостью forecast-driven rain-layer`
- `2026-07-08 | v0.1.31 | тип: UX+data+sync | важность: важно в документации | фон и выбранный город вынесены в account-synced settings внутри board snapshot, байты фоновых изображений — в blob-таблицу background_images с upload/serve эндпоинтами и orphan GC, добавлена одноразовая миграция из localStorage; weather badge больше не закреплён при скролле (TD-008)`
- `2026-07-08 | v0.1.32 | тип: UX | важность: важно в документации | SkyCondition из weather_code управляет голубизной фона и слоем облаков .sky-clouds; добавлены light/dark темы через data-theme на <html> и переменные :root[data-theme='dark'], авто-тёмная ночью + ручной .theme-widget`
- `2026-07-08 | v0.1.33 | тип: UX | важность: важно в документации | добавлены WeatherControls (localStorage) + WeatherControlModal: тумблеры слоёв на виджете, слайдеры дождя/неба/облаков и режим перетаскивания облаков; параметры облаков/неба/parallax применяются CSS-переменными на <html>; облака вынесены поверх доски (z-index 2) с pointer-parallax`
- `2026-07-08 | v0.1.34 | тип: UX | важность: важно в документации | WeatherControls.live заменил rainAuto: режим «погода live» (по прогнозу, кнопки слоёв disabled) vs ручной (принудительный дождь); подсветка облаков при parallax замедлена до 2250ms`
- `2026-07-08 | v0.1.35 | тип: UX | важность: важно в документации | cloudOffsets заменён списком WeatherControls.clouds: SkyCloud[] (per-cloud top/x/y/width/depth/duration/opacity/delay через inline-стили, миграция старого формата); в weather edit-mode добавлены corner-resize (якорь на противоположном углу), add (кнопка «+ Облако», лимит MAX_CLOUDS) и delete отдельного облака`
- `2026-07-08 | v0.1.36 | тип: UX | важность: важно в документации | подсветка облаков отвязана от parallax (pointermove больше не мигает яркостью, только двигает --parallax-*) и переведена на скролл страницы (data-clouds-active по scroll, capture-phase); переход яркости/фильтра растянут до 9000ms cubic-bezier(0.4, 0, 0.2, 1)`
- `2026-07-09 | v0.1.37 | тип: UX | важность: важно в документации | добавлен task-card pin toggle и client-side Canvas PNG export, удалены ThemeMode/data-theme/dark CSS и Open-Meteo is_day из weather flow`
