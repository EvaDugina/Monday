#!/usr/bin/env bash

set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <backup-file.sqlite.gz|backup-file.sqlite>" >&2
  exit 1
fi

BACKUP_FILE="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/deploy/compose.production.yml}"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env}"
VOLUME_NAME="${SQLITE_VOLUME_NAME:-monday_sqlite_data}"

if [[ -n "${MSYSTEM:-}" ]]; then
  BACKUP_FILE_DOCKER="$(cygpath -w "$BACKUP_FILE")"
  COMPOSE_FILE_DOCKER="$(cygpath -w "$COMPOSE_FILE")"
  ENV_FILE_DOCKER="$(cygpath -w "$ENV_FILE")"
else
  BACKUP_FILE_DOCKER="$BACKUP_FILE"
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

docker_run() {
  if [[ -n "${MSYSTEM:-}" ]]; then
    MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' docker run "$@"
  else
    docker run "$@"
  fi
}

docker_compose --env-file "$ENV_FILE_DOCKER" -f "$COMPOSE_FILE_DOCKER" stop api

if [[ "$BACKUP_FILE" == *.gz ]]; then
  docker_run --rm \
    -v "${VOLUME_NAME}:/data" \
    -v "${BACKUP_FILE_DOCKER}:/backup/input.sqlite.gz:ro" \
    alpine:3.20 \
    sh -lc 'rm -f /data/monday.sqlite /data/monday.sqlite-wal /data/monday.sqlite-shm && gunzip -c /backup/input.sqlite.gz > /data/monday.sqlite && chown -R 1000:1000 /data'
else
  docker_run --rm \
    -v "${VOLUME_NAME}:/data" \
    -v "${BACKUP_FILE_DOCKER}:/backup/input.sqlite:ro" \
    alpine:3.20 \
    sh -lc 'rm -f /data/monday.sqlite /data/monday.sqlite-wal /data/monday.sqlite-shm && cp /backup/input.sqlite /data/monday.sqlite && chown -R 1000:1000 /data'
fi

docker_compose --env-file "$ENV_FILE_DOCKER" -f "$COMPOSE_FILE_DOCKER" up -d api

echo "SQLite database restored from $BACKUP_FILE"
