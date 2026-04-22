# MONDAY — MVP Implementation Plan

## Context

Пользователь строит персональное web-приложение для контроля своих задач по четырём категориям:

- страсти
- бытец
- тело
- projects

Репозиторий создаётся с нуля. Изначально обсуждался Telegram Web App, но после уточнения выбран обычный Web UI с локальным развёртыванием на ноутбуке. Функциональные рамки MVP зафиксированы в `project_monday_overview.md`.

## Goal

Цель MVP: браузерное приложение, в котором можно быстро:

- создавать активные задачи в 4 категориях
- закрывать задачи в архив
- возвращать задачи обратно из архива

В MVP входят только два экрана:

- главный экран
- экран архива

Осознанно не входят:

- подзадачи
- экран «Сегодня»
- синхронизация между устройствами

## Tech Stack

- `React 18 + TypeScript + Vite`
  - `Vite` используется только как сборщик
  - результат `vite build` попадает в `dist/`
  - dev-сервера нет
- `Vanilla CSS` с CSS-переменными
  - тема light/dark через `prefers-color-scheme`
  - без UI-библиотек
- `localStorage`
  - синхронный API
  - лимит около 5 МБ
  - этого достаточно для тысяч задач
- Без бэкенда, ботов и авторизации
  - пользователь единственный
  - все данные локальны
- Полная Docker-контейнеризация приложения
  - только production-сборка
  - multi-stage: `deps -> builder -> nginx`
  - dev-сервера и HMR нет
  - каждое изменение применяется через пересборку образа
  - запуск одной командой: `docker compose up`
  - подход соответствует `docker-best-practices` для `React + Vite + Nginx`

## File Structure

```text
MONDAY/
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
├── index.html
├── .gitignore
├── .dockerignore                  # node_modules, .git, .obsidian, dist
├── Dockerfile                     # multi-stage: deps -> builder -> nginx (prod)
├── docker-compose.yml             # один сервис `app`
├── nginx.conf                     # SPA-fallback на index.html, gzip, cache headers
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── types.ts                   # Task, Category, Deadline
    ├── storage.ts                 # load/save tasks, автоочистка архива >90d
    ├── theme.css                  # CSS-vars, light/dark, цвета категорий
    ├── App.css
    ├── utils/
    │   ├── urgency.ts             # вычисление метки срочности по дедлайну
    │   └── dates.ts               # форматирование, сравнение
    └── components/
        ├── Header.tsx             # название + переключатель «Активные/Архив»
        ├── CategoryChips.tsx      # 4 chip-radio с одиночным выбором категории
        ├── CategorySection.tsx    # заголовок + список задач + inline-поле
        ├── TaskItem.tsx           # карточка задачи (цвет, пометки, клик)
        ├── InlineCreator.tsx      # поле «Название задачи...»
        ├── TaskDetailsModal.tsx   # просмотр/редактирование/закрытие/удаление
        ├── CreateTaskModal.tsx    # глобальная «+» с полным набором полей
        ├── DeadlineEditor.tsx     # radio-выбор типа срока + поля
        └── ArchiveList.tsx        # плоский список, отсортированный по closedAt desc
```

## Data Model

```ts
// src/types.ts
export type Category = 'passion' | 'routine' | 'body' | 'projects';
// Ключи в коде — английские; русские надписи хранятся в UI-константах/локализации.

export type Deadline =
  | { kind: 'none' }
  | { kind: 'date'; date: string }                      // ISO YYYY-MM-DD
  | { kind: 'range'; from: string; to: string }
  | { kind: 'recurring'; mode: 'day' | 'week' | 'month'; weekday?: number };

export interface Task {
  id: string;                    // crypto.randomUUID()
  title: string;
  description: string;
  category: Category;
  deadline: Deadline;
  status: 'open' | 'closed';
  createdAt: string;             // ISO datetime
  closedAt?: string;             // ISO datetime, только у closed
}
```

### Storage Contract

- Ключ задач в `localStorage`: `monday:tasks`
- Формат: `Task[]`
- На старте данные:
  - читаются из `localStorage`
  - проходят через `pruneArchive`
  - `pruneArchive` удаляет закрытые задачи с `closedAt < now - 90d`
  - очищенный результат записывается обратно
  - затем кладётся в React-состояние

Дополнительный ключ:

- `localStorage:monday:chips` — состояние фильтра категорий на главном экране
  - `null` означает режим «показать все категории»
  - строка с ключом категории означает одиночный выбранный radio-фильтр

## Color Palette

```css
:root {
  --cat-passion:  #e03131; /* красный */
  --cat-routine:  #868e96; /* серый */
  --cat-body:     #002FA7; /* IKB */
  --cat-projects: #7048e8; /* фиолетовый */
  --urgent: #e03131;
  --soon:   #f59f00;
}

@media (prefers-color-scheme: dark) {
  /* переопределяются фон, текст, карточки */
}

@media (prefers-color-scheme: light) {
  /* светлая тема */
}
```

Правило темы:

- палитра категорий не меняется между светлой и тёмной темой
- меняются только фоновые и текстовые токены интерфейса

## UX Contracts

### 1. Main Screen

- Шапка: `MONDAY` + кнопка `Архив`
- Ниже: ряд из 4 chip-radio
  - фильтр работает в режиме `single-select`
  - по умолчанию выбран режим «показать все категории»
  - состояние хранится в `localStorage:monday:chips`
  - нажатие на chip-radio категории показывает только эту категорию
  - повторное нажатие на уже выбранный chip-radio сбрасывает фильтр в режим «показать все категории»
- Под чипами: 4 секции в фиксированном порядке
  - страсти
  - бытец
  - тело
  - projects
- В режиме одиночного выбора отображается только одна соответствующая секция
- В режиме «показать все категории» отображаются все 4 секции
- Каждая секция содержит:
  - заголовок в цвете категории
  - список задач
  - inline-поле `Название задачи...`
- Нажатие `Enter` в inline-поле:
  - создаёт задачу в текущей категории
  - без описания
  - без срока
- Внизу справа плавающая кнопка `+`
  - открывает `CreateTaskModal`
  - модалка содержит выбор категории и полный набор полей

### 2. Task Details

Клик по задаче открывает `TaskDetailsModal`, где доступны:

- редактирование названия
- редактирование описания (`multiline`)
- редактор срока
- кнопка `Закрыть в архив`
- кнопка `Удалить навсегда`

### 3. Archive Screen

- Та же шапка, но кнопка переключается на `Активные`
- Чипов на этом экране нет
- Список плоский
- Сортировка: `closedAt desc`
- Цветовая полоса слева показывает категорию
- Для каждой записи доступны:
  - `Вернуть`
  - `Удалить`

### 4. Urgency Markers

Метки вычисляются в `urgency.ts` по `deadline + today`:

- красная точка слева от названия
  - дедлайн `<= сегодня`
  - или задача просрочена
- жёлтая точка
  - дедлайн в пределах 2 дней
- иконка циклической стрелки
  - повторяющаяся задача
- серая дата
  - все остальные случаи с датой

### 5. Theme

- тема определяется автоматически через `@media (prefers-color-scheme)`
- 4 цвета категорий являются константами

## Docker Layer

### Dockerfile

```dockerfile
# ---- deps: кэшируемый слой с node_modules
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# ---- builder: статическая сборка Vite
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---- runtime: nginx, раздающий собранный dist
FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
```

### docker-compose.yml

```yaml
services:
  app:
    build: .
    ports:
      - "8080:80"
    restart: unless-stopped
```

### nginx.conf

```nginx
server {
  listen 80;
  server_name _;
  root /usr/share/nginx/html;
  index index.html;

  gzip on;
  gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript image/svg+xml;

  location / {
    try_files $uri /index.html;
  }

  location ~* \.(?:js|css|woff2?|svg|png|jpg|jpeg|gif)$ {
    expires 7d;
    add_header Cache-Control "public, immutable";
  }
}
```

### Runtime

- Первый запуск: `docker compose up`
- После изменений в коде: `docker compose up --build`
- Приложение доступно на `http://localhost:8080`

## Implementation Steps

Каждый шаг должен завершаться отдельным осмысленным коммитом.

### 1. Init + Scaffold + Docker

Создать:

- `package.json`
- `vite.config.ts`
- `tsconfig.json`
- `tsconfig.node.json`
- `index.html`
- `.gitignore`
- `.dockerignore`
- `Dockerfile`
- `docker-compose.yml`
- `nginx.conf`
- `src/main.tsx`
- `src/App.tsx`

Минимальный результат:

- страница с заголовком
- сборка через Docker
- SPA-fallback работает

Проверка:

- `docker compose up` собирает образ и поднимает контейнер
- `http://localhost:8080` отдаёт страницу
- любой путь, например `/archive`, возвращает `index.html`

### 2. Types + Storage Layer

Создать:

- `src/types.ts`
- `src/storage.ts`

Реализовать:

- `loadTasks`
- `saveTasks`
- `pruneArchive`

Проверка:

- ручная проверка функций через консоль

### 3. Main Screen Skeleton

Создать:

- `Header`
- `CategoryChips`
- `CategorySection`
- `TaskItem`
- `InlineCreator`

Реализовать:

- отображение главного экрана
- создание задач через inline-поле
- отображение задач по категориям
- закрытие задачи одним кликом по `✓`

### 4. TaskDetailsModal

Создать и подключить `TaskDetailsModal`.

Реализовать:

- открытие по клику на задачу
- редактирование `title`
- редактирование `description`
- закрытие задачи
- удаление задачи

### 5. CreateTaskModal + DeadlineEditor

Создать:

- `CreateTaskModal`
- `DeadlineEditor`

Реализовать:

- глобальную кнопку `+`
- создание задачи с полным набором полей
- переиспользование `DeadlineEditor` в `TaskDetailsModal`

### 6. Archive Screen

Создать:

- `ArchiveList`

Реализовать:

- переключение `Главный <-> Архив` через шапку
- отображение архива
- возврат задачи в активные
- удаление задачи из архива

### 7. Urgency + Theme Polish

Создать:

- `src/utils/urgency.ts`

Доделать:

- визуальные метки срочности в `TaskItem`
- финальную тему light/dark
- финальную проверку `prefers-color-scheme`

## Verification

### После каждого шага

- `docker compose up --build` завершается без ошибок TypeScript/ESLint
- `http://localhost:8080` отвечает
- SPA-fallback работает: любой клиентский роут отдаёт `index.html`

### После шага 3

- можно создать задачу в каждой из 4 категорий через inline-поле
- перезагрузка страницы сохраняет данные в `localStorage`
- выбор chip-radio показывает только одну категорию
- повторное нажатие на активный chip-radio возвращает отображение всех категорий

## Updated Filter Requirements

Изменение к исходному UX-контракту:

- Фильтр категорий на главном экране должен быть реализован как `radio-group` из 4 chip-кнопок
- В каждый момент времени допустимы только два режима:
  - `all categories`
  - `single category`
- В режиме `single category` отображается ровно одна секция, соответствующая выбранной категории
- Повторное нажатие на уже выбранную chip-radio-кнопку переводит фильтр из `single category` в `all categories`
- На первом запуске и после сброса фильтр находится в режиме `all categories`
- Состояние фильтра должно восстанавливаться из `localStorage:monday:chips`

### После шага 4

- открываются детали задачи
- редактирование описания сохраняется
- закрытие уводит задачу из активного списка

### После шага 5

- кнопка `+` создаёт задачу с выбранной категорией и сроком
- сохраняются и корректно читаются:
  - повторяющийся срок
  - дедлайн-дата
  - дедлайн-диапазон

### После шага 6

- закрытая задача появляется в архиве
- у задачи корректные цвет и время закрытия
- `Вернуть` возвращает задачу в главный экран

### После шага 7

- в светлой системной теме фон белый
- в тёмной системной теме фон тёмный
- цвета категорий одинаковы в обеих темах
- просроченные задачи получают красную точку

### Дополнительные ручные проверки

- задача с `closedAt = today - 91d` удаляется при следующем запуске
- финальная проверка:
  - `docker compose up --build -d`
  - `http://localhost:8080` отдаёт SPA
  - любой роут возвращает `index.html`
  - статика приходит сжатой

## Operating Rules

Правила взяты из `CLAUDE.md` и считаются обязательными для проекта:

- Приложение полностью работает в Docker
  - запуск через `docker compose up`
  - после изменений в коде: `docker compose up --build`
- Одноразовые `npm`-операции выполняются во временном контейнере:

```bash
docker run --rm -v $(pwd):/app -w /app node:20-alpine npm install <pkg>
```

- `package-lock.json` коммитится в репозиторий
- Git-команды выполняются локально
- Перед каждой `bash`-командой нужно давать пояснение и дожидаться ответа пользователя `ок`

## Explicitly Out of MVP

- синхронизация между устройствами
- Telegram-бот с `/onday`
- экран «Сегодня» / дайджест
- подзадачи
- приоритеты
- теги
- ручная сортировка
- экспорт / импорт данных
