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

required_vars=(
  MONDAY_DOMAIN
  AUTH_DOMAIN
  MONDAY_OWNER_USERNAME
  MONDAY_OWNER_NAME
  MONDAY_OWNER_EMAIL
  MONDAY_OWNER_PASSWORD
  MONDAY_AUTH_BRAND_TITLE
)

optional_denied_vars=(
  MONDAY_DENIED_USERNAME
  MONDAY_DENIED_NAME
  MONDAY_DENIED_EMAIL
  MONDAY_DENIED_PASSWORD
)

for var_name in "${required_vars[@]}"; do
  if [[ -z "${!var_name:-}" ]]; then
    echo "Missing required variable in $ENV_FILE: $var_name" >&2
    exit 1
  fi
done

provided_denied_count=0
for var_name in "${optional_denied_vars[@]}"; do
  if [[ -n "${!var_name:-}" ]]; then
    ((provided_denied_count+=1))
  fi
done

if (( provided_denied_count != 0 && provided_denied_count != ${#optional_denied_vars[@]} )); then
  echo "Set all MONDAY_DENIED_* variables together or leave them all empty." >&2
  exit 1
fi

docker_compose --env-file "$ENV_FILE_DOCKER" -f "$COMPOSE_FILE_DOCKER" up -d \
  authentik-postgresql authentik-server authentik-worker app api caddy

docker_compose --env-file "$ENV_FILE_DOCKER" -f "$COMPOSE_FILE_DOCKER" exec -T authentik-server \
  sh -lc 'until curl -fsS http://127.0.0.1:9000/-/health/ready/ >/dev/null; do sleep 2; done'

docker_compose --env-file "$ENV_FILE_DOCKER" -f "$COMPOSE_FILE_DOCKER" exec -T \
  -e MONDAY_DOMAIN="$MONDAY_DOMAIN" \
  -e AUTH_DOMAIN="$AUTH_DOMAIN" \
  -e MONDAY_OWNER_USERNAME="$MONDAY_OWNER_USERNAME" \
  -e MONDAY_OWNER_NAME="$MONDAY_OWNER_NAME" \
  -e MONDAY_OWNER_EMAIL="$MONDAY_OWNER_EMAIL" \
  -e MONDAY_OWNER_PASSWORD="$MONDAY_OWNER_PASSWORD" \
  -e MONDAY_DENIED_USERNAME="$MONDAY_DENIED_USERNAME" \
  -e MONDAY_DENIED_NAME="$MONDAY_DENIED_NAME" \
  -e MONDAY_DENIED_EMAIL="$MONDAY_DENIED_EMAIL" \
  -e MONDAY_DENIED_PASSWORD="$MONDAY_DENIED_PASSWORD" \
  -e MONDAY_AUTH_BRAND_TITLE="$MONDAY_AUTH_BRAND_TITLE" \
  authentik-server python manage.py shell <<'PY'
import os

from authentik.brands.models import Brand
from authentik.core.models import Application, Group, User
from authentik.flows.models import Flow
from authentik.outposts.models import Outpost, OutpostType
from authentik.policies.models import PolicyBinding
from authentik.providers.proxy.models import ProxyMode, ProxyProvider


def required_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise SystemExit(f"Missing required environment value: {name}")
    return value


def optional_env(name: str) -> str | None:
    value = os.environ.get(name, "").strip()
    return value or None


MONDAY_DOMAIN = required_env("MONDAY_DOMAIN")
AUTH_DOMAIN = required_env("AUTH_DOMAIN")
OWNER_USERNAME = required_env("MONDAY_OWNER_USERNAME")
OWNER_NAME = required_env("MONDAY_OWNER_NAME")
OWNER_EMAIL = required_env("MONDAY_OWNER_EMAIL")
OWNER_PASSWORD = required_env("MONDAY_OWNER_PASSWORD")
DENIED_USERNAME = optional_env("MONDAY_DENIED_USERNAME")
DENIED_NAME = optional_env("MONDAY_DENIED_NAME")
DENIED_EMAIL = optional_env("MONDAY_DENIED_EMAIL")
DENIED_PASSWORD = optional_env("MONDAY_DENIED_PASSWORD")
BRAND_TITLE = required_env("MONDAY_AUTH_BRAND_TITLE")


def require_flow(slug: str) -> Flow:
    flow = Flow.objects.filter(slug=slug).first()
    if flow is None:
        raise SystemExit(
            f"Required Authentik flow '{slug}' is missing. "
            "If this is a fresh environment, recreate Authentik data after removing the /blueprints bind-mount."
        )
    return flow


def upsert_user(username: str, name: str, email: str, password: str) -> User:
    user, _ = User.objects.get_or_create(
        username=username,
        defaults={
            "name": name,
            "email": email,
        },
    )
    dirty = False
    if user.name != name:
        user.name = name
        dirty = True
    if user.email != email:
        user.email = email
        dirty = True
    if not user.is_active:
        user.is_active = True
        dirty = True
    user.set_password(password)
    dirty = True
    if dirty:
        user.save()
    return user


default_authentication_flow = require_flow("default-authentication-flow")
provider_authorization_flow = require_flow("default-provider-authorization-implicit-consent")
provider_invalidation_flow = require_flow("default-provider-invalidation-flow")

owner_group, _ = Group.objects.get_or_create(name="monday-owner")
owner_user = upsert_user(OWNER_USERNAME, OWNER_NAME, OWNER_EMAIL, OWNER_PASSWORD)
owner_user.groups.add(owner_group)

denied_user = None
if all(value is not None for value in (DENIED_USERNAME, DENIED_NAME, DENIED_EMAIL, DENIED_PASSWORD)):
    denied_user = upsert_user(DENIED_USERNAME, DENIED_NAME, DENIED_EMAIL, DENIED_PASSWORD)
    denied_user.groups.remove(owner_group)

provider, _ = ProxyProvider.objects.get_or_create(
    name="MONDAY Proxy Provider",
    defaults={
        "external_host": f"https://{MONDAY_DOMAIN}",
        "internal_host": "http://app:8080",
        "mode": ProxyMode.FORWARD_SINGLE,
        "authentication_flow": default_authentication_flow,
        "authorization_flow": provider_authorization_flow,
        "invalidation_flow": provider_invalidation_flow,
    },
)
provider.external_host = f"https://{MONDAY_DOMAIN}"
provider.internal_host = "http://app:8080"
provider.mode = ProxyMode.FORWARD_SINGLE
provider.authentication_flow = default_authentication_flow
provider.authorization_flow = provider_authorization_flow
provider.invalidation_flow = provider_invalidation_flow
provider.save()
provider.set_oauth_defaults()
provider.save()

application, _ = Application.objects.get_or_create(
    slug="monday",
    defaults={
        "name": "MONDAY",
        "provider": provider,
    },
)
application.name = "MONDAY"
application.provider = provider
application.save()

bindings = PolicyBinding.objects.filter(target=application)
if not bindings.filter(group=owner_group, order=0).exists():
    bindings.filter(group=owner_group).delete()
    PolicyBinding.objects.create(target=application, group=owner_group, order=0)

default_brand = Brand.objects.filter(default=True).first() or Brand.objects.first()
if default_brand is None:
    raise SystemExit("No Authentik brand objects found after bootstrap.")
default_brand.branding_title = BRAND_TITLE
default_brand.default_application = application
default_brand.save()

embedded_outpost = (
    Outpost.objects.filter(type=OutpostType.PROXY, name__icontains="Embedded Outpost").first()
    or Outpost.objects.filter(type=OutpostType.PROXY).first()
)
if embedded_outpost is None:
    raise SystemExit("Unable to find Authentik embedded proxy outpost.")

config = embedded_outpost.config
config.authentik_host = f"https://{AUTH_DOMAIN}"
config.authentik_host_browser = f"https://{AUTH_DOMAIN}"
embedded_outpost.config = config
embedded_outpost.save()
embedded_outpost.providers.add(provider)
embedded_outpost.build_user_permissions(embedded_outpost.user)

print(
    {
        "owner_username": owner_user.username,
        "denied_username": denied_user.username if denied_user else None,
        "application_slug": application.slug,
        "provider_client_id": provider.client_id,
        "monday_domain": MONDAY_DOMAIN,
        "auth_domain": AUTH_DOMAIN,
    }
)
PY

docker_compose --env-file "$ENV_FILE_DOCKER" -f "$COMPOSE_FILE_DOCKER" restart authentik-server authentik-worker caddy

wait_for_command 180 docker_compose --env-file "$ENV_FILE_DOCKER" -f "$COMPOSE_FILE_DOCKER" exec -T authentik-server \
  sh -lc 'curl -fsS http://127.0.0.1:9000/-/health/ready/ >/dev/null'
wait_for_command 180 container_health_is_healthy authentik-worker
wait_for_command 60 docker_compose --env-file "$ENV_FILE_DOCKER" -f "$COMPOSE_FILE_DOCKER" exec -T api \
  node -e "fetch('http://127.0.0.1:3001/api/health/ready').then((r)=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"

echo "Authentik bootstrap completed for https://${MONDAY_DOMAIN} and https://${AUTH_DOMAIN}"
