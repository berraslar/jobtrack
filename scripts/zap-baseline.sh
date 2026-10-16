#!/bin/sh
# OWASP ZAP baseline (DAST, pasif tarama). Yalıtılmış ortama karşı çalışır; orta veya yüksek riskli
# bir bulgu varsa başarısız olur (NFR-02). Rapor: zap-report/ (HTML + JSON).
#   ./scripts/zap-baseline.sh
set -eu
cd "$(dirname "$0")/.."

if [ -z "${E2E_BASE_URL:-}" ]; then
  exec ./scripts/with-test-stack.sh "$0"
fi

ZAP_IMAGE=${ZAP_IMAGE:-ghcr.io/zaproxy/zaproxy@sha256:781a2bdaea47324e7bab583e2263f21d257b0aee61ed51521a5be45f5f5081ef}
OUT="$PWD/zap-report"
rm -rf "$OUT" && mkdir -p "$OUT" && chmod 777 "$OUT"

# -I: uyarılarda ZAP'ın kendi çıkış kodunu kullanma; karar aşağıda risk seviyesine göre verilir.
docker run --rm --network host -v "$OUT:/zap/wrk:rw" "$ZAP_IMAGE" \
  zap-baseline.py -t "$E2E_BASE_URL" -m 2 -I -J zap.json -r zap.html >/dev/null

node -e '
const report = require(process.argv[1]);
const alerts = report.site.flatMap((s) => s.alerts);
const levels = { 0: "Bilgi", 1: "Düşük", 2: "Orta", 3: "Yüksek" };
for (const a of alerts) console.log(`${levels[a.riskcode]}\t${a.name} [${a.pluginid}]`);
const blocking = alerts.filter((a) => Number(a.riskcode) >= 2);
console.log(blocking.length ? `\n${blocking.length} orta/yüksek bulgu — başarısız.` : "\nOrta veya yüksek bulgu yok ✓");
process.exit(blocking.length ? 1 : 0);
' "$OUT/zap.json"
