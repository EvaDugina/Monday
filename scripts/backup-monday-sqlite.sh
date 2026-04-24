#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/deploy/compose.production.yml}"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env}"
MONDAY_SERVICE="${MONDAY_SERVICE:-api}"
SQLITE_SOURCE_PATH="${SQLITE_SOURCE_PATH:-/data/monday.sqlite}"
BACKUP_ROOT="${BACKUP_ROOT:-$ROOT_DIR/backups/sqlite}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
TARGET_BASENAME="monday-${TIMESTAMP}.sqlite"

if [[ -n "${MSYSTEM:-}" ]]; then
  COMPOSE_FILE_DOCKER="$(cygpath -w "$COMPOSE_FILE")"
  ENV_FILE_DOCKER="$(cygpath -w "$ENV_FILE")"
else
  COMPOSE_FILE_DOCKER="$COMPOSE_FILE"
  ENV_FILE_DOCKER="$ENV_FILE"
fi

docker_compose() {
  if [[ -n "${MSYSTEM:-}" ]]; then
    MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' docker compose "$@"
  else
    docker compose "$@"
  fi
}

mkdir -p "$BACKUP_ROOT"

docker_compose --env-file "$ENV_FILE_DOCKER" -f "$COMPOSE_FILE_DOCKER" exec -T "$MONDAY_SERVICE" \
  node /app/dist/cli/backup.js "$SQLITE_SOURCE_PATH" "/backups/sqlite/${TARGET_BASENAME}"

gzip -f "$BACKUP_ROOT/$TARGET_BASENAME"
find "$BACKUP_ROOT" -type f -name '*.gz' -mtime +"$RETENTION_DAYS" -delete

echo "SQLite backup written to $BACKUP_ROOT/${TARGET_BASENAME}.gz"
