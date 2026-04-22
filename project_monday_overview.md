# MONDAY Overview

## Current architecture

- Frontend: React + Vite SPA, served by `nginx` on `http://localhost:8080`.
- Backend: Node 20 + Express API in `server/`, available only inside Docker network and proxied наружу через `nginx` under `/api/*`.
- Persistence: SQLite via `better-sqlite3`, stored in Docker volume `monday-data` at `/data/monday.sqlite`.

## API surface

- `GET /api/health` -> `{ ok: true }`
- `GET /api/tasks` -> `{ tasks, updatedAt }`
- `PUT /api/tasks` with `{ tasks }` -> `{ updatedAt }`

The backend keeps a single row in table `state` with `id = 1`, `tasks_json`, and `updated_at`.

## Sync model

- On app startup, the frontend pulls tasks from the server.
- If the server is empty and `localStorage` has tasks, the client seeds the server once from local cache.
- If the server is unavailable, the app stays on local cache and shows offline sync status.
- Task changes are debounced by 500 ms, then cached to `localStorage` and pushed to the backend.
- The client stores the last synced JSON snapshot in a ref to avoid duplicate PUT requests for identical task payloads.

## Docker notes

- `docker-compose.yml` now runs `app` and `api`.
- `api` does not publish a host port; only `app` exposes `8080`.
- Data survives `docker compose down` / `up --build` and is lost only after `docker compose down -v`.
