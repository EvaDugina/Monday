#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RUN_ID="${RUN_ID:-$(date -u +%Y%m%d%H%M%S)}"
DEV_PROJECT="monday_parity_dev_${RUN_ID}"
PROD_PROJECT="monday_parity_prod_${RUN_ID}"
APP_PORT="${APP_PORT:-18081}"
API_PORT="${API_PORT:-13011}"
MONDAY_APP_PORT="${MONDAY_APP_PORT:-18082}"
APP_BASE_PATH="${APP_BASE_PATH:-/monday}"
SMOKE_USERNAME="${SMOKE_USERNAME:-admin}"
SMOKE_PASSWORD="${SMOKE_PASSWORD:-monday-smoke-password}"
TMP_DIR="$(mktemp -d)"
PROD_ENV_FILE="$TMP_DIR/timeweb.env"
PROD_OVERRIDE_FILE="$TMP_DIR/compose.timeweb.override.yml"
COOKIE_JAR="$TMP_DIR/cookies.txt"
DEV_STATE_FILE="$TMP_DIR/dev-state.json"
PROD_STATE_FILE="$TMP_DIR/prod-state.json"

cleanup() {
  docker compose -p "$DEV_PROJECT" -f "$ROOT_DIR/deploy/compose.dev.yml" down -v --remove-orphans >/dev/null 2>&1 || true
  docker compose -p "$PROD_PROJECT" --env-file "$PROD_ENV_FILE" -f "$ROOT_DIR/deploy/compose.timeweb.yml" -f "$PROD_OVERRIDE_FILE" down -v --remove-orphans >/dev/null 2>&1 || true
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

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

wait_for_url() {
  local url="$1"
  local timeout_seconds="${2:-90}"
  local started_at
  started_at="$(date +%s)"

  until curl -fsS "$url" >/dev/null; do
    if (( $(date +%s) - started_at >= timeout_seconds )); then
      echo "Timed out waiting for $url" >&2
      return 1
    fi
    sleep 2
  done
}

write_prod_env() {
  local generated
  generated="$(docker_run --rm -v "$ROOT_DIR:/app" -w /app node:20-alpine node scripts/generate-auth-hash.mjs "$SMOKE_PASSWORD")"

  {
    echo "MONDAY_APP_PORT=$MONDAY_APP_PORT"
    echo "APP_BASE_PATH=$APP_BASE_PATH"
    echo "SESSION_COOKIE_SECURE=false"
    echo "MONDAY_AUTH_USERNAME=$SMOKE_USERNAME"
    echo "MONDAY_AUTH_NAME=MONDAY Smoke"
    echo "$generated"
  } > "$PROD_ENV_FILE"

  cat > "$PROD_OVERRIDE_FILE" <<YAML
volumes:
  monday_timeweb_sqlite_data:
    name: ${PROD_PROJECT}_sqlite_data
YAML
}

compare_board_snapshots() {
  docker_run --rm -v "$TMP_DIR:/work:ro" node:20-alpine node - <<'NODE'
const { readFileSync } = require('node:fs');

function read(path) {
  const parsed = JSON.parse(readFileSync(path, 'utf8'));
  return {
    categories: parsed.categories,
    settings: parsed.settings,
    tasks: parsed.tasks,
  };
}

const dev = read('/work/dev-state.json');
const prod = read('/work/prod-state.json');

if (JSON.stringify(dev) !== JSON.stringify(prod)) {
  console.error('Dev and prod initial board snapshots differ.');
  console.error('dev:', JSON.stringify(dev));
  console.error('prod:', JSON.stringify(prod));
  process.exit(1);
}
NODE
}

write_prod_env

echo "Starting dev stack..."
APP_PORT="$APP_PORT" API_PORT="$API_PORT" docker_compose -p "$DEV_PROJECT" -f "$ROOT_DIR/deploy/compose.dev.yml" up -d --build

echo "Starting timeweb-prod stack..."
docker_compose -p "$PROD_PROJECT" --env-file "$PROD_ENV_FILE" -f "$ROOT_DIR/deploy/compose.timeweb.yml" -f "$PROD_OVERRIDE_FILE" up -d --build

DEV_BASE_URL="http://127.0.0.1:${APP_PORT}"
PROD_BASE_URL="http://127.0.0.1:${MONDAY_APP_PORT}${APP_BASE_PATH}"

echo "Waiting for dev API..."
wait_for_url "$DEV_BASE_URL/api/health/ready"

echo "Waiting for prod API..."
wait_for_url "$PROD_BASE_URL/api/health/ready"

echo "Checking dev unauthenticated local mode..."
curl -fsS "$DEV_BASE_URL/api/me" | grep -q '"username":"local"'
curl -fsS "$DEV_BASE_URL/api/tasks" > "$DEV_STATE_FILE"

echo "Checking prod login boundary..."
curl -fsS -o /dev/null -w '%{http_code}' "$PROD_BASE_URL/api/me" | grep -q '^401$'
curl -fsS \
  -c "$COOKIE_JAR" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"${SMOKE_USERNAME}\",\"password\":\"${SMOKE_PASSWORD}\"}" \
  "$PROD_BASE_URL/api/auth/login" | grep -q "\"username\":\"${SMOKE_USERNAME}\""
curl -fsS -b "$COOKIE_JAR" "$PROD_BASE_URL/api/me" | grep -q "\"username\":\"${SMOKE_USERNAME}\""
curl -fsS -b "$COOKIE_JAR" "$PROD_BASE_URL/api/tasks" > "$PROD_STATE_FILE"

echo "Comparing initial board contract..."
compare_board_snapshots

echo "Checking SPA entrypoints..."
curl -fsS "$DEV_BASE_URL/" | grep -q '<div id="root"></div>'
curl -fsS "$PROD_BASE_URL/" | grep -q '<div id="root"></div>'

echo "Dev/prod parity smoke passed."
