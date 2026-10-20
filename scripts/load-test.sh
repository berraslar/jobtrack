#!/bin/sh
# NFR-04 yük testi: yalıtılmış ortam + 1.000 başvuru + k6. Asıl verilere dokunmaz.
#   ./scripts/load-test.sh
set -eu
cd "$(dirname "$0")/.."

if [ -z "${E2E_BASE_URL:-}" ]; then
  # Önce yalıtılmış ortamı kur, sonra bu betiği onun içinde yeniden çalıştır.
  exec ./scripts/with-test-stack.sh "$0"
fi

# 1.3.0 sürümü; etiket değişebileceği için değişmez özetle (digest) sabitlenir (A03).
K6_IMAGE=${K6_IMAGE:-grafana/k6@sha256:3ddc8b1a33a2c3d8edc6e99b6a762ae36cba08788463458f5e6a7703e14eb77d}
EMAIL=yuk-testi@example.com
PASSWORD=yuk-testi-parolasi-2026

JAR=$(mktemp)
trap 'rm -f "$JAR"' EXIT

# Kullanıcı API ile oluşturulur (gerçek Argon2id hash); kayıt yarım oturum açar ve e-posta kodu
# gönderir. Kod Mailpit'ten okunup doğrulanınca tam oturum elde edilir (FR-18, FR-19).
curl -fsS -o /dev/null -c "$JAR" -b "$JAR" -H "Origin: $E2E_BASE_URL" -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" "$E2E_BASE_URL/api/auth/register"
ID=''
for _ in $(seq 1 30); do
  ID=$(curl -fsS "$E2E_MAILPIT_URL/api/v1/search?query=to%3A%22yuk-testi%40example.com%22" | jq -r '.messages[0].ID // empty')
  [ -n "$ID" ] && break
  sleep 1
done
CODE=$(curl -fsS "$E2E_MAILPIT_URL/api/v1/message/$ID" | jq -r .Text | grep -oE '\b[0-9]{6}\b' | head -n1)
curl -fsS -o /dev/null -c "$JAR" -b "$JAR" -H "Origin: $E2E_BASE_URL" -H "Content-Type: application/json" \
  -d "{\"code\":\"$CODE\"}" "$E2E_BASE_URL/api/auth/email/verify"
SESSION=$(awk '$6 == "__Host-session" { print $7 }' "$JAR")

docker compose -p "$E2E_PROJECT" --env-file "$E2E_ENV_FILE" exec -T db \
  psql -U jobtrack_admin -d jobtrack -q -v email="$EMAIL" -f - < scripts/load/seed.sql
echo "Tohum verisi hazır: 1.000 başvuru."

docker run --rm --network host -v "$PWD/scripts/load:/scripts:ro" \
  -e BASE_URL="$E2E_BASE_URL" -e LOAD_SESSION="$SESSION" \
  "$K6_IMAGE" run --quiet /scripts/api-latency.js
