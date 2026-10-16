#!/bin/sh
# NFR-11: veritabanının şifreli yedeği. Sunucuda yalnızca AÇIK anahtar bulunur; yedeği açacak özel
# anahtar sunucu dışında saklanır. Sunucu ele geçirilse bile yedekler okunamaz.
set -eu

: "${BACKUP_AGE_RECIPIENT:?BACKUP_AGE_RECIPIENT (age açık anahtarı) tanımlı değil — ./scripts/backup-keygen.sh}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
DIR=/backups
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
TARGET="$DIR/jobtrack-$STAMP.dump.age"

# Yarım kalan dosya "geçerli yedek" gibi görünmesin: önce geçici ada yazılır, bitince taşınır.
pg_dump --format=custom --compress=6 --no-password \
  | age --encrypt --recipient "$BACKUP_AGE_RECIPIENT" > "$TARGET.partial"
mv "$TARGET.partial" "$TARGET"

find "$DIR" -name 'jobtrack-*.dump.age' -type f -mtime "+$RETENTION_DAYS" -print -delete
echo "Yedek oluşturuldu: $(basename "$TARGET") ($(du -h "$TARGET" | cut -f1))"
