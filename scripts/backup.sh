#!/bin/sh
# Şifreli yedek al (NFR-11). Günlük çalıştırmak için crontab örneği README'de.
#   ./scripts/backup.sh            → ./backups/jobtrack-<zaman>.dump.age
set -eu
cd "$(dirname "$0")/.."
mkdir -p "${BACKUP_DIR:-./backups}"
BACKUP_UID=$(id -u) BACKUP_GID=$(id -g) docker compose ${COMPOSE_ARGS:-} --profile ops run --rm backup
