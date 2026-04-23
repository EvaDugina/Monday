#!/usr/bin/env bash

set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <backup-file.sql.gz|backup-file.sql>" >&2
  exit 1
fi

BACKUP_FILE="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/deploy/compose.production.yml}"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env}"

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

docker_compose --env-file "$ENV_FILE_DOCKER" -f "$COMPOSE_FILE_DOCKER" up -d authentik-postgresql
docker_compose --env-file "$ENV_FILE_DOCKER" -f "$COMPOSE_FILE_DOCKER" stop authentik-server authentik-worker

if [[ "$BACKUP_FILE" == *.gz ]]; then
  gunzip -c "$BACKUP_FILE" | docker_compose --env-file "$ENV_FILE_DOCKER" -f "$COMPOSE_FILE_DOCKER" exec -T authentik-postgresql \
    psql -U "${PG_USER:-authentik}" -d postgres
else
  cat "$BACKUP_FILE" | docker_compose --env-file "$ENV_FILE_DOCKER" -f "$COMPOSE_FILE_DOCKER" exec -T authentik-postgresql \
    psql -U "${PG_USER:-authentik}" -d postgres
fi

docker_compose --env-file "$ENV_FILE_DOCKER" -f "$COMPOSE_FILE_DOCKER" up -d authentik-server authentik-worker caddy

echo "PostgreSQL restored from $BACKUP_FILE"
