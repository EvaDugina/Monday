#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/deploy/compose.production.yml}"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env}"

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

container_health_is_healthy() {
  local service_name="$1"
  local container_id
  container_id="$(docker_compose --env-file "$ENV_FILE_DOCKER" -f "$COMPOSE_FILE_DOCKER" ps -q "$service_name")"
  [[ -n "$container_id" ]] || return 1
  [[ "$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$container_id")" == "healthy" ]]
}

if [[ -z "${MONDAY_DOMAIN:-}" || -z "${AUTH_DOMAIN:-}" ]]; then
  echo "MONDAY_DOMAIN and AUTH_DOMAIN must be set in $ENV_FILE" >&2
  exit 1
fi

echo "Checking container health..."
docker_compose --env-file "$ENV_FILE_DOCKER" -f "$COMPOSE_FILE_DOCKER" ps

echo "Checking API readiness from inside the container..."
wait_for_command 60 docker_compose --env-file "$ENV_FILE_DOCKER" -f "$COMPOSE_FILE_DOCKER" exec -T api \
  node -e "fetch('http://127.0.0.1:3001/api/health/live').then((r)=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"
wait_for_command 60 docker_compose --env-file "$ENV_FILE_DOCKER" -f "$COMPOSE_FILE_DOCKER" exec -T api \
  node -e "fetch('http://127.0.0.1:3001/api/health/ready').then((r)=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"

echo "Checking Authentik readiness from inside the container..."
wait_for_command 180 docker_compose --env-file "$ENV_FILE_DOCKER" -f "$COMPOSE_FILE_DOCKER" exec -T authentik-server \
  sh -lc 'curl -fsS http://127.0.0.1:9000/-/health/ready/ >/dev/null'
wait_for_command 180 container_health_is_healthy authentik-worker

echo "Checking external unauthenticated redirect..."
headers_file="$(mktemp)"
curl -fsS -D "$headers_file" -o /dev/null "https://${MONDAY_DOMAIN}/"
grep -qi '^http/.* 302' "$headers_file"
grep -qi "^location: https://${AUTH_DOMAIN}/application/o/authorize/" "$headers_file"
grep -qi '^strict-transport-security:' "$headers_file"
grep -qi '^content-security-policy:' "$headers_file"
grep -qi '^referrer-policy:' "$headers_file"
grep -qi '^x-content-type-options:' "$headers_file"
rm -f "$headers_file"

echo "Checking that Authentik login UI is reachable..."
curl -fsS -o /dev/null -w '%{http_code}' "https://${AUTH_DOMAIN}/" | grep -qE '^(200|302)$'

echo "Checking that API is not published directly on the host..."
if curl -fsS --max-time 2 http://127.0.0.1:3001/api/health/live >/dev/null 2>&1; then
  echo "API service unexpectedly exposes port 3001 on the host." >&2
  exit 1
fi

echo "Production smoke checks passed."
