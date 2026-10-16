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

# Kullanıcı API ile oluşturulur (gerçek Argon2id hash).
curl -fsS -o /dev/null -H "Origin: $E2E_BASE_URL" -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" "$E2E_BASE_URL/api/auth/register"

docker compose -p "$E2E_PROJECT" --env-file "$E2E_ENV_FILE" exec -T db \
  psql -U jobtrack_admin -d jobtrack -q -v email="$EMAIL" -f - < scripts/load/seed.sql
echo "Tohum verisi hazır: 1.000 başvuru."

docker run --rm --network host -v "$PWD/scripts/load:/scripts:ro" \
  -e BASE_URL="$E2E_BASE_URL" -e LOAD_EMAIL="$EMAIL" -e LOAD_PASSWORD="$PASSWORD" \
  "$K6_IMAGE" run --quiet /scripts/api-latency.js
