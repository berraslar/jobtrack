#!/bin/sh
# Kendi veritabanı olan, geçici ve yalıtılmış bir JobTrack ortamı açar; verilen komutu çalıştırır
# ve ortamı (veritabanı birimi dahil) siler. Asıl kurulumdaki verilere dokunmaz.
#
#   ./scripts/with-test-stack.sh pnpm exec playwright test
#
# Komut çalışırken E2E_BASE_URL geçici ortamın adresini, E2E_PROJECT ve E2E_ENV_FILE ise
# `docker compose -p "$E2E_PROJECT" --env-file "$E2E_ENV_FILE"` ile ortama erişimi sağlar.
set -eu
cd "$(dirname "$0")/.."

PROJECT=jobtrack-e2e
PORT=${E2E_PORT:-8081}
MAILPIT_PORT=${E2E_MAILPIT_PORT:-8026}
ENV_FILE=$(mktemp)
cleanup() {
  docker compose -p "$PROJECT" --env-file "$ENV_FILE" down -v --remove-orphans >/dev/null 2>&1 || true
  rm -f "$ENV_FILE"
}
trap cleanup EXIT INT TERM

hex() { openssl rand -hex 32; }
b64() { openssl rand -base64 32; }
cat > "$ENV_FILE" <<ENV
POSTGRES_PASSWORD=$(hex)
MIGRATOR_DB_PASSWORD=$(hex)
APP_DB_PASSWORD=$(hex)
APP_SECRET=$(b64)
DATA_ENCRYPTION_KEY=$(b64)
APP_ORIGIN=http://localhost:$PORT
WEB_PORT=$PORT
SITE_ADDRESS=
REGISTRATION_ENABLED=true
HIBP_ENABLED=false
LOG_LEVEL=warn
MAILPIT_PORT=$MAILPIT_PORT
ENV

echo "Test ortamı başlatılıyor (http://localhost:$PORT)…"
docker compose -p "$PROJECT" --env-file "$ENV_FILE" up -d --build --wait
E2E_BASE_URL="http://localhost:$PORT" E2E_MAILPIT_URL="http://127.0.0.1:$MAILPIT_PORT" E2E_PROJECT="$PROJECT" E2E_ENV_FILE="$ENV_FILE" "$@"
