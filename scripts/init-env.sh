#!/bin/sh
# Yerel kurulum için .env üretir; her gizli değer rastgele ve güçlüdür (varsayılan parola yok — A02).
set -eu
cd "$(dirname "$0")/.."

if [ -f .env ] && [ "${1:-}" != "--force" ]; then
  echo ".env zaten var. Üzerine yazmak için: $0 --force (veritabanı birimini de sıfırlamanız gerekir)"
  exit 1
fi

hex() { openssl rand -hex 32; }
b64() { openssl rand -base64 32; }

cat > .env <<ENV
# scripts/init-env.sh tarafından $(date -u +%Y-%m-%d) tarihinde üretildi. Git'e eklenmez.

# Veritabanı rolleri (ADR-0002)
POSTGRES_PASSWORD=$(hex)
MIGRATOR_DB_PASSWORD=$(hex)
APP_DB_PASSWORD=$(hex)

# Uygulama anahtarları. DATA_ENCRYPTION_KEY değişirse kayıtlı TOTP anahtarları çözülemez.
APP_SECRET=$(b64)
DATA_ENCRYPTION_KEY=$(b64)

# Tarayıcının kullandığı adres. 127.0.0.1 yerine localhost kullanın (Origin kontrolü).
APP_ORIGIN=http://localhost:8080
SITE_ADDRESS=

# İlk hesabınızı oluşturduktan sonra false yapın (ADR-0003).
REGISTRATION_ENABLED=true
HIBP_ENABLED=true
LOG_LEVEL=info

# ADR-0007: doğrulama kodları. Boş bırakılırsa yerel Mailpit kullanılır (http://localhost:8025).
# Gmail ile gerçek gönderim (Google hesabı > Güvenlik > 2 Adımlı Doğrulama > Uygulama şifreleri):
# SMTP_HOST=smtp.gmail.com
# SMTP_PORT=465
# SMTP_SECURE=true
# SMTP_USER=adiniz@gmail.com
# SMTP_PASSWORD=16-haneli-uygulama-sifresi
# MAIL_FROM=JobTrack <adiniz@gmail.com>

# ADR-0010: yapay zekâ ile CV uyarlama varsayılan olarak kapalıdır. Açmak için (README):
# AI_PROVIDER=gemini
# GEMINI_API_KEY=<Google AI Studio anahtarı>
# GEMINI_MODEL=gemini-3.8-flash
ENV
chmod 600 .env
echo ".env oluşturuldu."
