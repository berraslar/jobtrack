#!/bin/sh
# Yedekleme anahtar çifti üretir. Özel anahtarı sunucuda BIRAKMAYIN: parola yöneticinize veya
# çevrim dışı bir ortama taşıyın. Açık anahtar .env içindeki BACKUP_AGE_RECIPIENT'e yazılır.
set -eu
cd "$(dirname "$0")/.."
OUT="${1:-./backup-key.txt}"
if [ -e "$OUT" ]; then echo "$OUT zaten var; üzerine yazılmadı." >&2; exit 1; fi

docker compose --profile ops build backup >/dev/null
docker run --rm --entrypoint age-keygen jobtrack-backup > "$OUT"
chmod 600 "$OUT"
RECIPIENT=$(grep -o 'age1[0-9a-z]*' "$OUT" | head -1)
echo "Özel anahtar: $OUT  →  sunucudan kaldırıp güvenli bir yere taşıyın."
echo "Açık anahtar (.env içine):"
echo "BACKUP_AGE_RECIPIENT=$RECIPIENT"
