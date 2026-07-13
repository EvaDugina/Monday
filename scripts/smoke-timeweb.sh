#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/deploy/compose.timeweb.yml}"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/deploy/timeweb.env}"
PUBLIC_BASE_URL="${PUBLIC_BASE_URL:-http://127.0.0.1}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing environment file: $ENV_FILE" >&2
  exit 1
fi

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
    export "$line"
  done < "$ENV_FILE"
}

docker_compose() {
  if [[ -n "${MSYSTEM:-}" ]]; then
    MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' docker compose "$@"
  else
    docker compose "$@"
  fi
}

wait_for_command() {
  local timeout_seconds="$1"
  shift
  local started_at
  started_at="$(date +%s)"

  until "$@"; do
    if (( $(date +%s) - started_at >= timeout_seconds )); then
      echo "Timed out waiting for command: $*" >&2
      return 1
    fi
    sleep 2
  done
}

load_env_file

APP_BASE_PATH="${APP_BASE_PATH:-/monday}"
ROOT_URL="${PUBLIC_BASE_URL%/}${APP_BASE_PATH}"
EXPECTED_REDIRECT_LOCATION="${APP_BASE_PATH%/}/"
COOKIE_JAR="$(mktemp)"
trap 'rm -f "$COOKIE_JAR"' EXIT

echo "Checking compose health..."
docker_compose --env-file "$ENV_FILE_DOCKER" -f "$COMPOSE_FILE_DOCKER" ps

echo "Checking container readiness..."
wait_for_command 60 docker_compose --env-file "$ENV_FILE_DOCKER" -f "$COMPOSE_FILE_DOCKER" exec -T monday \
  node -e "fetch('http://127.0.0.1:8080${APP_BASE_PATH}/api/health/ready').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

echo "Checking nginx path redirect..."
curl -fsS -I "${ROOT_URL}" | tr -d '\r' | grep -qi "^location: ${EXPECTED_REDIRECT_LOCATION}$"

echo "Checking public health endpoint..."
curl -fsS "${ROOT_URL}/api/health/ready" | grep -q '"ok":true'

echo "Checking unauthenticated /api/me..."
curl -sS -o /dev/null -w '%{http_code}' "${ROOT_URL}/api/me" | grep -q '^401$'

if [[ -n "${SMOKE_USERNAME:-}" && -n "${SMOKE_PASSWORD:-}" ]]; then
  echo "Checking login flow..."
  curl -fsS \
    -c "$COOKIE_JAR" \
    -H 'Content-Type: application/json' \
    -d "{\"username\":\"${SMOKE_USERNAME}\",\"password\":\"${SMOKE_PASSWORD}\"}" \
    "${ROOT_URL}/api/auth/login" | grep -q '"username"'

  echo "Checking authenticated endpoints..."
  curl -fsS -b "$COOKIE_JAR" "${ROOT_URL}/api/me" | grep -q '"username"'
  curl -fsS -b "$COOKIE_JAR" "${ROOT_URL}/api/tasks" | grep -q '"tasks"'

  echo "Checking logout flow..."
  curl -fsS -o /dev/null -w '%{http_code}' -b "$COOKIE_JAR" -X POST "${ROOT_URL}/api/auth/logout" | grep -q '^204$'
fi

echo "Timeweb smoke checks passed."
