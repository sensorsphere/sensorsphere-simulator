#!/usr/bin/env bash
set -euo pipefail

REPOSITORY="${REPOSITORY:-sensorsphere/sensorsphere-simulator}"
RAW_BASE_URL="${RAW_BASE_URL:-https://raw.githubusercontent.com}"
VERSION="${VERSION:-1.3.0}"
SOURCE_REF="v${VERSION}"
INSTALL_DIR="${SIMULATOR_INSTALL_DIR:-${INSTALL_DIR:-${HOME}/sensorsphere-simulator}}"
IMAGE="${SIMULATOR_IMAGE:-ghcr.io/sensorsphere/sensorsphere-simulator:${VERSION}}"
COMPOSE_PROJECT="${COMPOSE_PROJECT_NAME:-sensorsphere-simulator}"

fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

download() {
  local url="$1" destination="$2"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$url" -o "$destination"
  elif command -v wget >/dev/null 2>&1; then
    wget -qO "$destination" "$url"
  else
    fail "curl or wget is required"
  fi
}

for cmd in docker mktemp; do
  command -v "$cmd" >/dev/null 2>&1 || fail "$cmd is required"
done
docker compose version >/dev/null 2>&1 || fail "docker compose plugin is required"
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z.-]+)?$ ]] || fail "VERSION must be a semantic version"

mkdir -p "$INSTALL_DIR"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

printf 'Installing SensorSphere Simulator\n'
printf '  version:      %s\n' "$VERSION"
printf '  image:        %s\n' "$IMAGE"
printf '  install dir:  %s\n' "$INSTALL_DIR"
printf '  web port:     %s\n' "${WEB_PORT:-8090}"
printf '  MQTT broker:  %s:%s\n' "${SIMULATOR_MQTT_HOST:-${MQTT_HOST:-preserved/default}}" "${SIMULATOR_MQTT_PORT:-${MQTT_PORT:-1883}}"

download "${RAW_BASE_URL}/${REPOSITORY}/${SOURCE_REF}/docker-compose.yml" "$TMP_DIR/docker-compose.yml"
download "${RAW_BASE_URL}/${REPOSITORY}/${SOURCE_REF}/.env.example" "$TMP_DIR/.env.example"

cp "$TMP_DIR/docker-compose.yml" "$INSTALL_DIR/docker-compose.yml"
cp "$TMP_DIR/.env.example" "$INSTALL_DIR/.env.example"

if [[ -f "$INSTALL_DIR/.env" ]]; then
  backup="$INSTALL_DIR/.env.backup-$(date +%Y%m%d-%H%M%S)"
  cp -p "$INSTALL_DIR/.env" "$backup"
  printf 'Preserving existing %s/.env\n' "$INSTALL_DIR"
  printf 'Backup created: %s\n' "$backup"
else
  cp "$INSTALL_DIR/.env.example" "$INSTALL_DIR/.env"
fi

set_env() {
  local key="$1" value="$2" tmp
  tmp="$(mktemp)"
  grep -v "^${key}=" "$INSTALL_DIR/.env" > "$tmp" || true
  printf '%s=%s\n' "$key" "$value" >> "$tmp"
  cat "$tmp" > "$INSTALL_DIR/.env"
  rm -f "$tmp"
}

set_if_supplied() {
  local source_name="$1" target_name="${2:-$1}"
  if [[ -n "${!source_name+x}" ]]; then
    set_env "$target_name" "${!source_name}"
  fi
}

set_env SIMULATOR_IMAGE "$IMAGE"
set_env COMPOSE_PROJECT_NAME "$COMPOSE_PROJECT"

set_if_supplied WEB_PORT
set_if_supplied WEB_BIND_ADDRESS
set_if_supplied APP_INSTANCE_NAME
set_if_supplied MQTT_TOPIC_PREFIX
set_if_supplied LOG_RETENTION_MINUTES
set_if_supplied LOG_LIMIT
set_if_supplied SIMULATOR_BACKUP_INTERVAL_MINUTES
set_if_supplied SIMULATOR_BACKUP_RETENTION
set_if_supplied SIMULATOR_MQTT_USERNAME
set_if_supplied SIMULATOR_MQTT_PASSWORD

if [[ -n "${SIMULATOR_MQTT_HOST+x}" ]]; then
  set_env SIMULATOR_MQTT_HOST "$SIMULATOR_MQTT_HOST"
elif [[ -n "${MQTT_HOST+x}" ]]; then
  set_env SIMULATOR_MQTT_HOST "$MQTT_HOST"
fi

if [[ -n "${SIMULATOR_MQTT_PORT+x}" ]]; then
  set_env SIMULATOR_MQTT_PORT "$SIMULATOR_MQTT_PORT"
elif [[ -n "${MQTT_PORT+x}" ]]; then
  set_env SIMULATOR_MQTT_PORT "$MQTT_PORT"
fi

chmod 600 "$INSTALL_DIR/.env"
mkdir -p "$INSTALL_DIR/data"

(
  cd "$INSTALL_DIR"
  docker compose --env-file .env config -q
  docker compose --env-file .env pull
  docker compose --env-file .env up -d
)

cid="$(cd "$INSTALL_DIR" && docker compose --env-file .env ps -q sensor-simulator)"
[[ -n "$cid" ]] || fail "Simulator container was not created"

for _ in $(seq 1 60); do
  status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$cid" 2>/dev/null || true)"
  if [[ "$status" == "healthy" ]]; then
    printf 'SensorSphere Simulator is healthy\n'
    printf 'Open: http://<host>:%s\n' "${WEB_PORT:-8090}"
    exit 0
  fi
  if [[ "$status" == "unhealthy" || "$status" == "exited" || "$status" == "dead" ]]; then
    docker logs --tail=100 "$cid" >&2 || true
    fail "Simulator container became $status"
  fi
  sleep 2
done

docker logs --tail=100 "$cid" >&2 || true
fail "Simulator did not become healthy in time"
