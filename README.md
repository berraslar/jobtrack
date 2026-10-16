<div align="center">

# JobTrack

**İş arama sürecini tek bir yerde toplayan kişisel başvuru takip uygulaması.**

İlanı tek tıkla kaydet, CV'ni o ilana göre tek sayfaya uyarla, başvurunun her adımını takip et ve neyin işe yaradığını panoda gör.

[![CI](https://github.com/berraslar/jobtrack/actions/workflows/ci.yml/badge.svg)](https://github.com/berraslar/jobtrack/actions/workflows/ci.yml)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React_19-20232A?logo=react&logoColor=61DAFB)
![Fastify](https://img.shields.io/badge/Fastify_5-000000?logo=fastify&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL_18-4169E1?logo=postgresql&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white)
![WCAG 2.2 AA](https://img.shields.io/badge/WCAG_2.2-AA-2e7d32)

<img src="docs/ekran-goruntuleri/pano.webp" alt="JobTrack panosu: başvuru sayısı, dönüş, mülakat ve teklif oranları, aşamalara göre ve haftalık başvuru grafikleri" width="100%">

</div>

## Neden JobTrack?

İş ararken başvurular LinkedIn'e, Kariyer.net'e, e-postaya ve not defterlerine dağılır. Hangi ilana hangi CV ile başvurduğun, kimden ne zamandır ses çıkmadığı ve hangi CV'nin gerçekten dönüş aldığı kaybolur. JobTrack bunların hepsini tek bir düzenli yerde toplar ve her gün ilk olarak neyle ilgilenmen gerektiğini gösterir.

## Öne çıkanlar

### Tek tıkla ilan kaydı

Tarayıcının yer imi çubuğuna eklenen küçük bir yer imi, açık ilan sayfasından pozisyonu, şirketi, konumu, temiz ilan bağlantısını ve **ilan metninin tamamını** okuyup yeni başvuru formunu önceden dolu açar. LinkedIn, Kariyer.net, Youthall ve schema.org `JobPosting` verisi taşıyan şirket kariyer sayfalarında (Greenhouse, Lever, Workday…) çalışır. Kaydı her zaman kullanıcı yapar.

<img src="docs/ekran-goruntuleri/yer-imiyle-kayit.webp" alt="Yer imiyle Kariyer.net ilanından önceden doldurulmuş yeni başvuru formu" width="100%">

### Yapay zekâ ile ilana göre CV

Ana CV'yi bir kez kaydedersin (PDF'ini sürükleyip bırakman yeter). Bir başvuru seçince yapay zekâ CV'ni o ilana göre yeniden sıralar ve kısaltır; uyum skorunu, ilanda olup CV'de olmayan anahtar kelimeleri ve yaptığı her değişikliği listeler.

- **Uydurma yok:** model yalnızca sıralar, yeniden ifade eder ve çıkarır. Çıktıda Ana CV'de olmayan bir tarih, süre ya da şirket adı geçerse uyarı gösterilir.
- **Gizlilik:** ad, e-posta, telefon, adres ve bağlantılar gönderilmeden önce maskelenir, yanıt gelince geri yerleştirilir. Özellik varsayılan olarak kapalıdır ve her istekte açık onay istenir.
- **Kesintisiz:** model yoğunsa beklemeden yedek modele geçilir; uyarlama birkaç saniye sürer.

<img src="docs/ekran-goruntuleri/ilana-gore-uyarlama.webp" alt="Uyum skoru, eksik anahtar kelimeler, yapılan değişiklikler ve Ana CV ile uyarlanmış CV arasındaki fark" width="100%">

### Tek sayfa PDF

Düzenleyicinin yanında, PDF'in birebir aynısı olan canlı bir önizleme durur ve CV'nin tek A4 sayfaya sığıp sığmadığını yazdıkça söyler. Az taşan CV, PDF'te yazı ölçeği küçültülerek otomatik olarak tek sayfaya sığdırılır. Sayfa bütçesi, gerçek yazdırma çıktısı ölçülerek belirlendi.

<img src="docs/ekran-goruntuleri/tek-sayfa-pdf.webp" alt="Markdown düzenleyici, canlı PDF önizlemesi ve 'Tek A4 sayfaya sığıyor' bilgisi" width="100%">

### Başvuru takibi

| Liste, arama ve filtreler                                                                                       | Kanban                                                                            |
| --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| <img src="docs/ekran-goruntuleri/basvurular.webp" alt="Başvuru listesi, takip edilecekler ve sıradaki mülakat"> | <img src="docs/ekran-goruntuleri/kanban.webp" alt="Aşamalara göre Kanban panosu"> |

- On bir aşamalı süreç (kaydedildi → başvuruldu → … → teklif); aşama değişiklikleri veritabanında otomatik olarak geçmişe yazılır.
- Kanban'da sürükle-bırak ya da klavyeyle taşıma.
- Mülakat, telefon, e-posta ve ödev kayıtları; yaklaşan mülakatlar takvim dosyası olarak dışa aktarılır.
- Uzun süredir ses çıkmayan başvurular "takip et" olarak işaretlenir.

<img src="docs/ekran-goruntuleri/basvuru-ayrintisi.webp" alt="Başvuru ayrıntısı ve aşama geçmişi" width="100%">

### Pano

Dönüş, mülakat ve teklif oranları; aşamalara göre dağılım, haftalık başvurular ve hangi CV versiyonunun ve hangi kaynağın daha çok dönüş aldığı, hepsi aşama geçmişinden hesaplanır.

### Açık ve koyu tema, telefonda da

| Koyu tema                                                                | Telefon                                                                             |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| <img src="docs/ekran-goruntuleri/pano-koyu.webp" alt="Koyu temada pano"> | <img src="docs/ekran-goruntuleri/mobil-pano.webp" alt="Telefonda pano" width="260"> |

## Güvenlik ve gizlilik

Kişisel veriyle (CV, maaş beklentisi, notlar) çalıştığı için güvenlik baştan tasarlandı; her kontrol [OWASP Top 10:2025](docs/requirements.md) maddelerine bağlı.

- **Veri izolasyonu:** kullanıcıya ait her sorgu PostgreSQL **Row-Level Security** altında çalışır; uygulama kodunda bir hata olsa bile kimse başkasının kaydını göremez. Başkasının kaydına erişim her zaman `404` döner ve bu her uç nokta için test edilir.
- **Kimlik doğrulama:** sunucu taraflı oturum, Argon2id parola özeti, TOTP ile iki adımlı doğrulama, yeni cihazda e-posta kodu, CSRF koruması.
- **Şifreleme:** iki adımlı doğrulama sırları veritabanında AES-256-GCM ile şifreli durur; yedekler [age](https://age-encryption.org) ile şifrelenir ve ayda bir geri yükleme tatbikatı yapılır.
- **Yalıtılmış CV okuma:** güvenilmeyen PDF'ler internete ve veritabanına erişimi olmayan, ayrı bir konteynerde (pdftotext + Tesseract OCR) okunur.
- **KVKK:** tüm veri JSON ya da CSV olarak indirilebilir, hesap kalıcı olarak silinebilir; üçüncü taraf takipçi yoktur.
- **Tedarik zinciri:** imajlar distroless/alpine, SBOM ile yayımlanır ve Sigstore cosign ile imzalanır.

## Kalite

Her değişiklik CI'da şu kapılardan geçer:

| Kapı                          | Araç                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------- |
| Lint, tip kontrolü, format    | ESLint (security eklentisiyle, sıfır uyarı), `tsc --strict`, Prettier                 |
| Birim ve entegrasyon testleri | Vitest; API testleri gerçek PostgreSQL ile (Testcontainers), **370+ test**            |
| Uçtan uca ve erişilebilirlik  | Playwright + axe (WCAG 2.2 AA), 360 px mobil kontrolü, Lighthouse                     |
| Güvenlik                      | Semgrep (SAST), Gitleaks, pnpm audit + OSV-Scanner, Trivy (imajlar), OWASP ZAP (DAST) |
| Performans                    | k6 yük testi (1.000 başvuruyla API p95 < 200 ms), ilk yükleme JS bütçesi < 200 KB     |

## Mimari

```mermaid
flowchart LR
  B[Tarayıcı<br/>React 19 + Vite] -->|HTTPS| C[Caddy<br/>statik dosyalar, güvenlik başlıkları]
  Y[Yer imi] -.->|ilan bilgileri| B
  C -->|/api| A[API<br/>Fastify 5 + TypeScript]
  A -->|RLS| D[(PostgreSQL 18)]
  A -->|iç ağ| P[CV ayrıştırıcı<br/>pdftotext + Tesseract]
  A -.->|maskelenmiş, onaylı| G[Gemini API]
```

- **Monorepo** (pnpm workspaces): `apps/api`, `apps/web`, `apps/cv-parser`, `packages/shared`.
- İstemci ve sunucu aynı **Zod** şemalarını paylaşır; her istek iki tarafta da doğrulanır.
- Katmanlı API: `routes → services → repositories`; şema değişiklikleri elle yazılmış SQL migration'larıyla.
- Tüm kararlar [mimari karar kayıtlarında (ADR)](docs/adr/), gereksinimler [`docs/requirements.md`](docs/requirements.md) içinde.

| Katman     | Teknolojiler                                                      |
| ---------- | ----------------------------------------------------------------- |
| Arayüz     | React 19, React Router 7, TanStack Query, Tailwind CSS 4, Vite    |
| API        | Node.js 24, Fastify 5, Drizzle ORM, Zod 4, Argon2id               |
| Veri       | PostgreSQL 18 (Row-Level Security)                                |
| Yapay zekâ | Gemini API (sağlayıcı arayüzü arkasında; yerel model eklenebilir) |
| Altyapı    | Docker Compose, Caddy, GitHub Actions                             |

## Çalıştırma

```bash
./scripts/init-env.sh && docker compose up --build   # http://localhost:8080
```

Yapılandırma, yapay zekâ özelliğini açma, yedekleme ve geliştirme ortamı için: [**docs/kurulum.md**](docs/kurulum.md)

---

<div align="center">

Ekran görüntülerindeki kişi, şirketler ve başvurular uydurmadır.

Geliştiren: [Berra Salar](https://github.com/berraslar)

</div>
