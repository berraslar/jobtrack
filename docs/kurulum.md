# Kurulum ve işletim

JobTrack'i çalıştırma, yapılandırma, geliştirme ve işletme rehberi. Tanıtım için [README](../README.md) · Gereksinimler: [`requirements.md`](requirements.md) · Mimari kararlar: [`adr/`](adr/)

## Hızlı başlangıç (Docker)

Gereksinim: Docker Compose v2, OpenSSL.

```bash
./scripts/init-env.sh          # .env içine rastgele parolalar ve anahtarlar üretir
docker compose up --build
```

Uygulama: <http://localhost:8080> (127.0.0.1 değil, `localhost` kullanın; Origin kontrolü buna göre yapılır).

İlk hesabınızı oluşturduktan sonra `.env` içinde `REGISTRATION_ENABLED=false` yapıp `docker compose up -d` ile yeniden başlatın.

### E-posta doğrulama kodları (FR-18, FR-19, ADR-0007)

Kayıtta, yeni cihazdan girişte (TOTP kapalıysa) ve hesap silmede e-postaya 2 dakika geçerli bir kod gider.

- **Yerel (varsayılan):** Kodlar Mailpit test kutusuna düşer: <http://localhost:8025> (yalnızca bu makineden erişilir).
- **Gmail ile gerçek gönderim:** Google hesabında 2 adımlı doğrulamayı açın, _Güvenlik › Uygulama şifreleri_ bölümünden bir uygulama şifresi oluşturun ve `.env` dosyasına ekleyin:

  ```bash
  SMTP_HOST=smtp.gmail.com
  SMTP_PORT=465
  SMTP_SECURE=true
  SMTP_USER=adiniz@gmail.com
  SMTP_PASSWORD=uygulama-sifresi   # 16 karakter, boşluksuz
  MAIL_FROM=JobTrack <adiniz@gmail.com>
  ```

  Ardından `docker compose up -d` ile yeniden başlatın.

### Parola sıfırlama

E-posta ile sıfırlama yoktur (ADR-0003). Sunucuda:

```bash
docker compose run --rm -it migrate dist/cli/reset-password.js eposta@ornek.com
```

Komut yeni parolayı sorar, bütün oturumları kapatır ve denetim kaydı yazar.

### İlan sayfasından kaydetme (FR-22, ADR-0009)

LinkedIn, Kariyer.net, Youthall ya da bir şirketin kariyer sayfasındaki bir ilandayken tek tıkla JobTrack'te yeni başvuru formunu ilan bilgileri ve ilan metniyle dolu açan bir yer imi (bookmarklet). Yer imi yalnızca açık sayfayı okur; hiçbir yere veri göndermez ve kendiliğinden kaydetmez.

1. Tarayıcının yer imi çubuğunu açın (Chrome/Edge: `Ctrl+Shift+B`, Firefox: Görünüm > Araç çubukları > Yer imleri araç çubuğu).
2. JobTrack'te **Ayarlar > İlan sayfasından kaydet** bölümüne gidin.
3. **JobTrack'e kaydet** bağlantısını sürükleyip yer imi çubuğuna bırakın.
   Sürükleyemiyorsanız **Yer imi kodunu kopyala**'ya basın, tarayıcıda yeni bir yer imi oluşturun ve kopyalanan kodu adres (URL) alanına yapıştırın.
4. Bir ilan açın (LinkedIn'de `/jobs/view/…` ya da ilan listesinde seçili ilan; Kariyer.net'te `/is-ilani/…`; Youthall'da ilanın kendi sayfası; ya da şirketin kariyer sayfasındaki ilan) ve yer imine tıklayın.
5. JobTrack yeni sekmede **Yeni başvuru** formunu açar: pozisyon, şirket, konum, temiz ilan bağlantısı, kaynak, bugünün tarihi ve **İlan metni** doludur. Kontrol edip **Başvuruyu kaydet**'e basın; ilan metni başvuruyla birlikte kaydedilir ve CV Düzenle'de uyarlamada kullanılır.

Notlar:

- Yer imi JobTrack'in adresini içerir; adres değişirse (örn. alan adına taşıma) bağlantıyı Ayarlar'dan yeniden sürükleyin.
- Okuma sırası: LinkedIn ve Kariyer.net için sayfaya özel alanlar; Youthall ve çoğu şirket kariyer sayfası (Greenhouse, Lever, Workday gibi) için sayfadaki schema.org `JobPosting` verisi; bunlar yoksa sayfa başlığı ve adresi. Bazı şirket sayfalarında yalnızca başlık ve bağlantı alınabilir; eksik alanı elle doldurursunuz.
- Parametreler doğrulanır: uzunluklar sınırlıdır, ilan bağlantısı yalnızca `https://` olabilir; izleme parametreleri (`utm_*`, `gclid` vb.) atılır, LinkedIn bağlantısı kanonik ilan adresine çevrilir. Geçmeyen alan forma girmez ve formun üstünde belirtilir.
- İlan metni (en fazla 20.000 karakter) sorgu dizesinde değil adres parçasında (`#ilan=`) taşınır: sunucuya gönderilmez, erişim loglarına girmez ve form açılınca adresten silinir.
- Kaynak kodu: `apps/web/bookmarklet/save-job.js`. Değiştirdikten sonra küçültülmüş sürümü yeniden üretin: `corepack pnpm --filter @jobtrack/web build:bookmarklet` (bir test, üretilen dosyanın güncel olduğunu denetler).

### Yapay zekâ ile CV uyarlama (FR-23, FR-24, ADR-0010)

**CV Düzenle** sayfasında Ana CV'nizi (Markdown) bir kez kaydeder, bir başvuru seçip ilan metnini yapıştırırsınız. Yapay zekâ CV'nizi ilana göre yeniden sıralar ve ifade eder; olmayan deneyim, beceri, sertifika ya da tarih eklemez. Sonuç Ana CV ile yan yana fark olarak gösterilir, düzenleyip başvuruya bağlı bir sürüm olarak kaydedersiniz; sürümler Markdown olarak indirilir ya da yazdırma penceresinden PDF olarak kaydedilir.

Özellik **varsayılan olarak kapalıdır**. Kapalıyken Ana CV, ilan metni ve elle düzenlenen sürümler yine kullanılabilir.

> **Gizlilik:** Açarsanız maskelenmiş CV'niz ve ilan metni Google'a (Gemini API) gönderilir. Ad, e-posta, telefon, adres ve bağlantılar gönderilmeden önce yer tutucularla değiştirilir; ama deneyim ve proje metinleri gider. Ücretsiz katmanda Google gönderilen içeriği ve yanıtları ürünlerini geliştirmek için kullanabilir ve insan inceleyiciler okuyabilir ([Gemini API ek koşulları](https://ai.google.dev/gemini-api/terms)). Her uyarlamada ayrıca açık onay istenir.

**Gemini API anahtarı alma (ücretsiz):**

1. [Google AI Studio](https://aistudio.google.com/) adresine Google hesabınızla girin ve kullanım koşullarını kabul edin.
2. Sol menüden **Get API key** (API anahtarı al) sayfasını açın ya da doğrudan <https://aistudio.google.com/app/apikey> adresine gidin.
3. **Create API key** (API anahtarı oluştur) düğmesine basın; bir Google Cloud projesi seçin ya da AI Studio'nun yeni proje oluşturmasına izin verin.
4. Oluşan anahtarı kopyalayın. Anahtarı kimseyle paylaşmayın, koda ya da depoya yazmayın.
5. Ücretsiz katmanın güncel hız sınırlarını AI Studio'da görebilirsiniz; sınır aşılırsa JobTrack birkaç kez bekleyip yeniden dener, olmazsa "birkaç dakika sonra tekrar deneyin" der.

**Özelliği açma:** `.env` dosyasına (depoya girmez, `.gitignore` içinde) şunları yazın ve API'yi yeniden başlatın:

```bash
AI_PROVIDER=gemini
GEMINI_API_KEY=buraya-anahtar
# İsteğe bağlı; varsayılan 2026-10-14'te doğrulanan ücretsiz Flash modeli:
GEMINI_MODEL=gemini-3.8-flash
```

```bash
docker compose up -d api
```

Anahtar yalnızca API konteynerinde durur; tarayıcıya hiçbir yanıtla gitmez ve loglanmaz. Google bir modeli kapatırsa uygulama "model bulunamadı" der; [modeller sayfasından](https://ai.google.dev/gemini-api/docs/models) güncel bir Flash modelini `GEMINI_MODEL` olarak yazın. Kapatmak için `AI_PROVIDER=` satırını boşaltın.

## Geliştirme

Gereksinim: Node.js 24 LTS (`.nvmrc`), pnpm (`corepack enable`).

```bash
pnpm install
pnpm --filter @jobtrack/api dev    # API: http://localhost:3000
pnpm --filter @jobtrack/web dev    # Arayüz: http://localhost:5173 (/api → 3000)
```

| Komut               | Açıklama                                                                                                                                                                                                        |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm lint`         | ESLint (eslint-plugin-security dahil), uyarı sıfır olmalı                                                                                                                                                       |
| `pnpm format:check` | Prettier                                                                                                                                                                                                        |
| `pnpm typecheck`    | `tsc --noEmit`, tüm paketler                                                                                                                                                                                    |
| `pnpm test`         | Vitest, tüm paketler                                                                                                                                                                                            |
| `pnpm build`        | Üretim build'i                                                                                                                                                                                                  |
| `pnpm check:bundle` | İlk yüklemedeki JavaScript gzip ile 200 KB altında mı (NFR-05)                                                                                                                                                  |
| `pnpm test:e2e`     | Playwright uçtan uca testleri + axe (WCAG 2.2 AA) + 360 px kontrolü. Kendi veritabanıyla geçici bir Docker ortamı açar (port 8081), bitince siler; asıl verilere dokunmaz. Sistemdeki Google Chrome'u kullanır. |

## API

Tüm uçlar `/api` altındadır. Belirtilmedikçe oturum ister; durum değiştiren isteklerde `X-CSRF-Token` başlığı zorunludur (değer `GET /api/auth/me` yanıtında). Başka kullanıcının kaydı ve geçersiz ID her zaman `404` döner.

| Uç nokta                                                                                                                       | Açıklama                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `POST /auth/register`, `POST /auth/login`, `POST /auth/mfa/verify`                                                             | Kayıt, giriş, ikinci adım (herkese açık / yarım oturum)                                                   |
| `POST /auth/email/verify`, `POST /auth/email/resend`                                                                           | E-posta kodu adımı ve yeni kod (yarım oturum; FR-18, FR-19)                                               |
| `GET /auth/me`, `POST /auth/logout`                                                                                            | Oturum bilgisi ve CSRF token'ı, çıkış                                                                     |
| `GET /auth/sessions`, `DELETE /auth/sessions`                                                                                  | Aktif oturumlar, tümünü kapat (FR-03)                                                                     |
| `POST /auth/mfa/setup`, `POST /auth/mfa/enable`                                                                                | TOTP kurulumu (FR-02)                                                                                     |
| `GET/POST /companies`, `GET/PATCH/DELETE /companies/:id`                                                                       | Şirketler; detay tüm başvuruları içerir (FR-13)                                                           |
| `GET/POST /cv-versions`, `PATCH/DELETE /cv-versions/:id`                                                                       | CV versiyonları (FR-08)                                                                                   |
| `POST /cv-versions/upload`, `PUT/GET/DELETE /cv-versions/:id/file`                                                             | CV PDF dosyası; ham `application/pdf` gövdesi, en fazla 5 MB (FR-08, ADR-0006)                            |
| `GET/PUT/DELETE /profile`                                                                                                      | Profil; `PUT` bütün profili yazar (FR-20)                                                                 |
| `POST /profile/extract`                                                                                                        | `{ cvVersionId }` ile CV dosyasından profil önerisi; hiçbir şey kaydetmez (FR-21, ADR-0008)               |
| `GET /applications?q=…&stage=…&source=…&cvVersionId=…&appliedFrom=…&appliedTo=…&followUp=true&archived=exclude\|include\|only` | Liste, arama ve filtreler (FR-10); her başvuruda `needsFollowUp` (FR-11)                                  |
| `GET/PATCH /settings`                                                                                                          | Takip süresi (FR-11) ve arayüz dili `tr`/`en` (FR-16); kısmi güncelleme                                   |
| `GET /stats`                                                                                                                   | Pano: aşama dağılımı, dönüş/mülakat/teklif hunisi, CV ve kaynak kırılımı, haftalık başvuru (FR-12)        |
| `GET /account/export?format=json\|csv`                                                                                         | Tüm verinin dışa aktarımı (FR-14)                                                                         |
| `POST /account/deletion-code`, `DELETE /account`                                                                               | Silme onay kodu; hesabı silme: parola, `confirm: "SİL"`, `emailCode` ve MFA açıksa kod (FR-14)            |
| `GET /account/calendar.ics`                                                                                                    | Yaklaşan mülakatlar takvim dosyası (FR-17)                                                                |
| `POST /vitals`                                                                                                                 | Gerçek kullanıcı Core Web Vitals ölçümü (herkese açık, NFR-03)                                            |
| `POST /applications`, `GET/PATCH/DELETE /applications/:id`                                                                     | Başvuru; zorunlu alanlar yalnızca şirket ve pozisyon (FR-04, NFR-09)                                      |
| `POST /applications/:id/stage`                                                                                                 | Aşama değişikliği; geçmiş otomatik yazılır (FR-05, FR-06)                                                 |
| `POST /applications/:id/archive`, `POST /applications/:id/unarchive`                                                           | Arşiv (FR-15)                                                                                             |
| `POST /applications/:id/activities`, `PATCH/DELETE /activities/:id`                                                            | Mülakat, e-posta, telefon, ödev kayıtları (FR-07)                                                         |
| `GET/PUT /master-cv`                                                                                                           | Ana CV, Markdown, en fazla 30.000 karakter (FR-23)                                                        |
| `POST /master-cv/import`                                                                                                       | PDF CV'den Ana CV taslağı; dosya saklanmaz, kaydetmez, dakikada 6 istek (FR-23, ADR-0008)                 |
| `GET/PUT /applications/:id/job-description`                                                                                    | Başvurunun ilan metni, en fazla 20.000 karakter (FR-23)                                                   |
| `GET /ai/status`                                                                                                               | Yapay zekâ özelliği açık mı (ADR-0010)                                                                    |
| `POST /applications/:id/tailor`                                                                                                | `{ consent: true, extraMaskTerms? }` ile uyarlama taslağı; kaydetmez; kullanıcı başına dakikada 5 (FR-24) |
| `GET/POST /applications/:id/tailored-cvs`, `GET/PUT/DELETE /tailored-cvs/:id`                                                  | Başvuruya bağlı CV sürümleri (FR-24)                                                                      |

## Operasyon

### Şifreli yedekleme (NFR-11)

Yedekler [age](https://age-encryption.org) ile açık anahtara şifrelenir. Sunucuda yalnızca açık anahtar bulunur; yedeği açacak özel anahtar sunucu dışında saklanır.

```bash
./scripts/backup-keygen.sh            # bir kez: anahtar çifti üretir, açık anahtarı gösterir
# Çıktıdaki BACKUP_AGE_RECIPIENT=... satırını .env'e ekleyin; backup-key.txt'yi sunucudan kaldırıp güvenli bir yere taşıyın.
./scripts/backup.sh                   # yedek: backups/jobtrack-<zaman>.dump.age (30 günden eskiler silinir)
```

Her gün 03:00'te otomatik yedek için crontab satırı:

```cron
0 3 * * * cd /yol/JobTrack && ./scripts/backup.sh >> backups/backup.log 2>&1
```

**Silinen hesaplar ve yedekler (KVKK, FR-14, NFR-14):** Hesap silme, verinin tamamını canlı veritabanından hemen siler. O ana kadar alınmış şifreli yedeklerde ise veri, yedeğin saklama süresi dolana kadar kalır. Bu süre **en fazla 30 gündür** ve gizlilik bildiriminde kullanıcıya açıkça belirtilmelidir. Bir yedek geri yüklenirse, yedekten sonra silinmiş hesaplar geri yüklemenin ardından yeniden silinmelidir.

**Geri yükleme tatbikatı (ayda bir):** Yedeği geçici, ağa kapalı bir veritabanına geri yükler, tutarlılık kontrollerini yapar ve siler.

```bash
./scripts/restore-drill.sh backups/jobtrack-<zaman>.dump.age /guvenli/yer/backup-key.txt
```

### Güvenlik ve performans testleri

| Komut                                                                                      | Ne yapar                                                                                                                                |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `./scripts/zap-baseline.sh`                                                                | OWASP ZAP baseline (DAST); orta veya yüksek bulguda başarısız olur. Rapor `zap-report/` dizinine yazılır. CI'da `main` dalında çalışır. |
| `./scripts/load-test.sh`                                                                   | k6: 1.000 başvuruyla API p95 < 200 ms (NFR-04). CI'da haftalık çalışır.                                                                 |
| `./scripts/with-test-stack.sh pnpm dlx @lhci/cli@0.15.1 autorun --config=lighthouserc.cjs` | Lighthouse CI (NFR-03, laboratuvar ölçümü)                                                                                              |

Hepsi yalıtılmış, geçici bir Docker ortamında çalışır; asıl verilere dokunmaz. Gerçek kullanıcıların Core Web Vitals ölçümleri (LCP, INP, CLS) `web-vitals` ile toplanıp API loglarına `web-vitals` mesajıyla yazılır.

### Dağıtım ve imza doğrulama (A03, A08)

`main` dalında CI yeşil olunca `release` iş akışı imajları `ghcr.io/<kullanıcı>/<depo>-{api,web,backup}` adlarıyla yayımlar. Her imaja bir CycloneDX SBOM eklenir ve imaj Sigstore cosign ile anahtarsız olarak imzalanır. Sunucuda yalnızca imzası doğrulanan imajı çalıştırın:

```bash
cosign verify ghcr.io/<kullanıcı>/<depo>-api:<commit> \
  --certificate-identity-regexp 'https://github.com/<kullanıcı>/<depo>/.github/workflows/release.yml@.*' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
```

## Yapı

```
apps/api         Fastify + TypeScript REST API (/api)
apps/web         React + Vite arayüz
apps/cv-parser   Yalıtılmış CV metin çıkarıcı: pdftotext + Tesseract OCR (ADR-0008)
packages/shared  Ortak Zod şemaları ve tipler
infra/caddy      Ters vekil ve güvenlik başlıkları
infra/postgres   Veritabanı rolleri (ilk kurulum)
apps/api/migrations  Şema, RLS politikaları (SQL)
docs/            Gereksinimler ve ADR'ler
```
