#!/bin/sh
# PostgreSQL resmi imajı bu betiği yalnızca veri dizini boşken (ilk kurulum) çalıştırır.
set -eu

: "${APP_DB_PASSWORD:?APP_DB_PASSWORD tanımlı değil}"
: "${MIGRATOR_DB_PASSWORD:?MIGRATOR_DB_PASSWORD tanımlı değil}"

psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v dbname="$POSTGRES_DB" \
  -v app_password="$APP_DB_PASSWORD" \
  -v migrator_password="$MIGRATOR_DB_PASSWORD" \
  -f /bootstrap/bootstrap.sql
