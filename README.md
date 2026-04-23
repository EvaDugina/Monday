# MONDAY

MONDAY is a small task board with a React/Vite frontend and an Express/SQLite API. The repo keeps the application code in `src/` and `server/src/`, while deployment assets live in `deploy/` and operator scripts live in `scripts/`.

## Run locally

```bash
npm run dev
```

The local stack starts the static app and API with `DEBUG=true` defaults. The UI is available on `http://localhost:8080`, the API on `http://localhost:3001`.

## Deploy to production

1. Copy `.env.example` to `.env`.
2. Set `DEBUG=false` and fill the required hostnames and secrets.
3. Run:

```bash
npm run deploy:prod
```

If you use Authentik for the first time on that host, run `./scripts/bootstrap-authentik.sh` after the stack is healthy.

## Configuration

All environment settings are documented in `.env.example`. The main switch is `DEBUG`:

- `DEBUG=true`: local/dev mode, auth is relaxed and the lightweight dev stack is enough.
- `DEBUG=false`: production mode, hardened deployment with Caddy + Authentik.

You should not need separate env files for dev and prod.

## Repo layout

- `src/`: frontend application.
- `server/src/`: API, validation, persistence, CLI helpers.
- `deploy/`: compose files, Dockerfiles, Caddy configs.
- `scripts/`: bootstrap, smoke, backup, restore.

## Operations

- Production smoke check: `./scripts/smoke-production.sh`
- SQLite backup: `./scripts/backup-monday-sqlite.sh`
- SQLite restore: `./scripts/restore-monday-sqlite.sh backups/sqlite/<file>.sqlite.gz`
- Authentik PostgreSQL backup: `./scripts/backup-authentik-postgres.sh`
- Authentik PostgreSQL restore: `./scripts/restore-authentik-postgres.sh backups/postgres/<file>.sql.gz`
