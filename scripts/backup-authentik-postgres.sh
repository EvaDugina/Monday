#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/deploy/compose.production.yml}"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env}"
BACKUP_ROOT="${BACKUP_ROOT:-$ROOT_DIR/backups/postgres}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"

if [[ -n "${MSYSTEM:-}" ]]; then
  COMPOSE_FILE_DOCKER="$(cygpath -w "$COMPOSE_FILE")"
  ENV_FILE_DOCKER="$(cygpath -w "$ENV_FILE")"
else
  COMPOSE_FILE_DOCKER="$COMPOSE_FILE"
  ENV_FILE_DOCKER="$ENV_FILE"
fi

load_env_file() {
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    [[ -z "$line" ]] && continue
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    [[ "$line" != *=* ]] && continue

    key="${line%%=*}"
    value="${line#*=}"

    key="${key#"${key%%[![:space:]]*}"}"
    key="${key%"${key##*[![:space:]]}"}"

    if [[ "$value" == \"*\" && "$value" == *\" ]]; then
      value="${value:1:-1}"
    elif [[ "$value" == \'*\' && "$value" == *\' ]]; then
      value="${value:1:-1}"
    fi

    export "$key=$value"
  done < "$ENV_FILE"
}

load_env_file

docker_compose() {
  if [[ -n "${MSYSTEM:-}" ]]; then
    MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' docker compose "$@"
  else
    docker compose "$@"
  fi
}

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
TARGET_PATH="$BACKUP_ROOT/authentik-${TIMESTAMP}.sql.gz"

mkdir -p "$BACKUP_ROOT"

docker_compose --env-file "$ENV_FILE_DOCKER" -f "$COMPOSE_FILE_DOCKER" exec -T authentik-postgresql \
  pg_dump --clean --if-exists --create -U "${PG_USER:-authentik}" "${PG_DB:-authentik}" | gzip > "$TARGET_PATH"

find "$BACKUP_ROOT" -type f -name '*.sql.gz' -mtime +"$RETENTION_DAYS" -delete

echo "PostgreSQL backup written to $TARGET_PATH"
