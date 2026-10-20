# İş Başvurusu Takip Sistemi — Yazılım Gereksinimleri ve Mimari Plan

Oct 6, 2026 · @Berra Salar

## 1. Proje özeti ve kapsam

**JobTrack**, iş başvurularını başvurudan teklif ya da red aşamasına kadar takip eden kişisel bir CRM web uygulamasıdır. Hem Berra'nın günlük kullanımı hem de GitHub portföyü için tasarlanır. Bu yüzden kurumsal kalitede güvenlik, test ve dokümantasyon hedeflenir.

**"Sıfır güvenlik zafiyeti" hakkında dürüst not:** Hiçbir yazılım kanıtlanabilir şekilde sıfır zafiyetli olamaz. Gerçekçi hedef şudur: bilinen zafiyet sınıflarının (OWASP Top 10) tamamını tasarımla engellemek, OWASP ASVS 5.0 seviye 2 kontrollerini karşılamak ve her değişikliği otomatik güvenlik taramasından geçirmek. CI'da kritik veya yüksek seviyeli bulgu kaldığı sürece sürüm çıkmaz.

**Kullanıcılar:** Tek bir birincil kullanıcı vardır (Berra). Mimari, ileride çok kullanıcılı hale gelebilecek şekilde kurulur: her kayıt bir kullanıcıya aittir ve başkası erişemez.

**Kapsam içi (MVP):**

- Başvuru kaydı oluşturma, düzenleme, silme ve arşivleme
- Başvuru aşamaları (pipeline) ve aşama geçmişi
- Mülakat ve etkinlik zaman çizelgesi
- Hangi CV versiyonunun gönderildiğinin takibi
- Arama, filtreleme ve basit istatistikler
- Güvenli giriş (parola + iki adımlı doğrulama)

**Kapsam dışı (MVP sonrası):** e-posta entegrasyonu, LinkedIn'den sunucu tarafında otomatik veri çekme (scraping), mobil uygulama ve takım özellikleri.

**MVP sonrası eklenenler:** kullanıcının kendi tarayıcısında çalışan bir yer imi betiğiyle LinkedIn, Kariyer.net, Youthall ve şirket kariyer sayfalarındaki ilandan form doldurma (FR-22, ADR-0009) ve isteğe bağlı, varsayılan olarak kapalı yapay zekâ ile ilana göre CV uyarlama (FR-23, FR-24, ADR-0010).

## 2. Fonksiyonel gereksinimler

Gereksinimler ISO/IEC/IEEE 29148 tarzında yazılmıştır: her biri tek bir şey söyler, test edilebilir ve bir ID taşır. Öncelik sütunu MoSCoW yöntemini kullanır: Must (MVP'de şart), Should (MVP'de olmalı), Could (sonra eklenebilir).

| ID | Gereksinim | Öncelik |
| --- | --- | --- |
| FR-01 | Kullanıcı e-posta ve parola ile hesap oluşturabilir ve giriş yapabilir. Kayıt `REGISTRATION_ENABLED` ile açılıp kapatılır; üretimde varsayılan kapalıdır (ADR-0003). | Must |
| FR-02 | Kullanıcı TOTP tabanlı iki adımlı doğrulamayı (Google Authenticator vb.) açabilir; açarken mevcut parolası yeniden istenir; kurtarma kodları bir kez gösterilir. | Must |
| FR-03 | Kullanıcı aktif oturumlarını görebilir ve tüm oturumları kapatabilir. | Should |
| FR-04 | Kullanıcı bir başvuru ekleyebilir: şirket, pozisyon, ilan linki, kaynak (LinkedIn, Kariyer.net, şirket sitesi, referans), başvuru tarihi, konum, çalışma şekli (ofis/hibrit/uzaktan), maaş beklentisi ve notlar. | Must |
| FR-05 | Her başvurunun bir aşaması vardır: Kaydedildi → Başvuruldu → İlk görüşme → Teknik mülakat → Vaka/ödev → Son mülakat → Teklif → Kabul / Red / Dönüş yok / Geri çekildi. | Must |
| FR-06 | Her aşama değişikliği tarihçeli olarak kaydedilir; geçmiş silinemez, yalnızca okunur. | Must |
| FR-07 | Kullanıcı bir başvuruya etkinlik ekleyebilir: mülakat, e-posta, telefon, ödev teslimi. Her etkinliğin tarihi, türü, görüşülen kişi ve notu olur. | Must |
| FR-08 | Kullanıcı CV versiyonlarını (örn. "SnA Data AI", "SnA Data Analytics") tanımlayabilir ve her başvuruda hangisini gönderdiğini seçebilir. | Must |
| FR-09 | Başvurular liste ve Kanban görünümünde gösterilir; Kanban'da kart klavye ile de taşınabilir. | Must |
| FR-10 | Kullanıcı şirket ve pozisyona göre arama yapabilir; aşama, kaynak, tarih aralığı ve CV versiyonuna göre filtreleyebilir. | Must |
| FR-11 | Belirli bir gün sayısı boyunca (varsayılan 14 gün) dönüş gelmeyen başvurular "Takip et" olarak işaretlenir. | Should |
| FR-12 | Pano (dashboard), aşamalara göre başvuru sayısını, dönüş oranını, mülakata dönüş oranını ve CV versiyonuna göre başarı oranını gösterir. | Should |
| FR-13 | Kullanıcı şirket kaydı tutabilir (sektör, web sitesi, notlar); bir şirketin tüm başvuruları tek sayfada görünür. | Should |
| FR-14 | Kullanıcı tüm verisini CSV ve JSON olarak dışa aktarabilir ve hesabını kalıcı olarak silebilir (KVKK uyumu). Silme; parola, (açıksa) TOTP ve e-postaya gönderilen onay koduyla yapılır (ADR-0007). | Must |
| FR-15 | Başvurular silinmeden önce arşive alınabilir; silme işlemi onay ister. | Should |
| FR-16 | Arayüz Türkçe ve İngilizce dillerini destekler. | Could |
| FR-17 | Yaklaşan mülakatlar için takvim (.ics) dışa aktarımı yapılabilir. | Could |
| FR-18 | Kayıtta e-posta adresi, e-postaya gönderilen 6 haneli ve 2 dakika geçerli bir kodla doğrulanır; hesap ancak kod doğrulanınca açılır. Kayıtlı bir adresle yapılan kayıt aynı yanıtı alır ve adresin sahibine kod yerine bilgilendirme gider (ADR-0007, ADR-0011). | Must |
| FR-19 | TOTP açık olmayan hesapta tanınmayan bir cihazdan girişte e-postaya kod gönderilir; doğrulanan cihaz 30 gün hatırlanır. TOTP açıksa ikinci adım TOTP'dir (ADR-0007). | Must |
| FR-20 | Kullanıcı profilini (ad, unvan, iletişim, bağlantılar, özet, yetenekler, diller, deneyim, eğitim) görüntüleyip düzenleyebilir; profil dışa aktarımda yer alır ve hesapla birlikte silinir (ADR-0008). | Should |
| FR-21 | Kullanıcı yüklediği bir CV dosyasından profil önerisi alabilir (metinli PDF ve taranmış PDF için OCR). Öneri kullanıcı alan alan seçip onaylamadan kaydedilmez; CV dışarıdaki bir servise gönderilmez (ADR-0008). | Could |
| FR-22 | Kullanıcı Ayarlar sayfasından sürükleyerek kurduğu "JobTrack'e kaydet" yer imi betiğiyle (bookmarklet) LinkedIn, Kariyer.net, Youthall ya da bir şirket kariyer sayfasındaki ilandan pozisyon, şirket, konum, temiz ilan bağlantısını ve ilan metnini okuyup yeni başvuru formunu (`/basvurular/yeni`) önceden dolu açabilir; ilan metni başvuruyla birlikte kaydedilir (FR-23). Kayıt yalnızca kullanıcı formu gönderince yapılır. Parametreler doğrulanır ve uzunlukları sınırlanır; ilan bağlantısı yalnızca `https://` olabilir, izleme parametreleri atılır. İlan metni adres parçasında taşınır ve sunucu loglarına girmez (ADR-0009). | Could |
| FR-23 | Kullanıcı Markdown biçiminde tek bir "Ana CV" kaydedip düzenleyebilir ve bir başvuruya ilan metnini ekleyebilir. Ana CV, sürüklenen bir PDF CV'nin yalıtılmış ayrıştırıcıyla okunan metninden taslak olarak oluşturulabilir; PDF saklanmaz, taslak kullanıcı kaydedene kadar yazılmaz (ADR-0008). Düzenleme sırasında PDF çıktısıyla aynı biçimde canlı önizleme gösterilir. Ana CV ve ilan metni dışa aktarımda yer alır ve hesapla birlikte silinir. | Could |
| FR-24 | Kullanıcı yapay zekâ özelliğini açtıysa, bir başvurunun ilan metnine göre Ana CV'sinin uyarlanmış bir sürümünü önerebilir. Her istekte veri gönderimi için açık onay alınır; kişisel bilgiler gönderimden önce maskelenir ve yanıtta geri yerleştirilir. Model yalnızca sıralar, yeniden ifade eder, öne çıkarır ve kısaltır; uyum skoru, eksik anahtar kelimeler ve değişiklik listesi sabit bir JSON şemasıyla döner. Ana CV'de olmayan tarih, süre veya şirket adı çıktıda görünürse uyarı gösterilir. Kullanıcı varsayılan olarak açık "Tek sayfaya sığdır" seçeneğiyle uyarlanmış CV'nin tek A4 sayfaya sığacak kadar kısaltılmasını isteyebilir; model bunu yalnızca ilgisiz kısımları çıkararak yapar. Önizleme CV'nin tek sayfaya sığıp sığmadığını gösterir; az taşan CV PDF'te yazı en fazla %85'e küçültülerek tek sayfaya sığdırılır. Öneri yan yana fark görünümünde düzenlenip başvuruya bağlı bir sürüm olarak kaydedilir; Markdown ve PDF (yazdırma görünümü) olarak dışa aktarılır (ADR-0010). | Could |

## 3. Fonksiyonel olmayan gereksinimler

Kalite hedefleri ISO/IEC 25010:2023 ürün kalite modeline göre gruplandı. Bu model dokuz ana kalite özelliği tanımlar ve 2023 sürümünde "Usability" yerine "Interaction capability" adı kullanılır. Her hedefin bir ölçümü var, çünkü ölçülemeyen bir gereksinim test edilemez.

| ID | Kalite özelliği | Gereksinim | Nasıl doğrulanır |
| --- | --- | --- | --- |
| NFR-01 | Güvenlik | OWASP ASVS 5.0 Seviye 2 kontrolleri karşılanır; OWASP Top 10:2025'in 10 kategorisinin her biri için bir kontrol vardır (Bölüm 6). | ASVS kontrol listesi + CI güvenlik taramaları |
| NFR-02 | Güvenlik | CI'da kritik veya yüksek seviyeli bulgu (SAST, bağımlılık, konteyner, DAST) varken sürüm çıkmaz. | GitHub Actions kalite kapısı |
| NFR-03 | Performans | Core Web Vitals 75. yüzdelikte "iyi" bölgede: LCP ≤ 2,5 sn, INP ≤ 200 ms, CLS ≤ 0,1. | Lighthouse CI (laboratuvar) + web-vitals kütüphanesi (gerçek kullanım) |
| NFR-04 | Performans | API yanıtlarının 95. yüzdeliği 200 ms altındadır (1.000 başvuru kaydıyla). | k6 yük testi |
| NFR-05 | Performans | İlk yüklemedeki JavaScript paketi gzip ile 200 KB altındadır; sayfalar route bazlı bölünür (code splitting). | CI'da paket boyutu bütçesi |
| NFR-06 | Etkileşim (kullanılabilirlik) | WCAG 2.2 AA uyumu. | axe-core otomatik test + klavye ve ekran okuyucu ile elle test |
| NFR-07 | Etkileşim | Kanban'daki sürükle-bırak için tek tıklık veya klavye alternatifi vardır (WCAG 2.5.7). Tıklanabilir hedefler en az 24×24 CSS pikseldir (WCAG 2.5.8). | Elle test |
| NFR-08 | Etkileşim | Girişte parola yöneticisi ve yapıştırma engellenmez (WCAG 3.3.8 Accessible Authentication). | Elle test |
| NFR-09 | Etkileşim | Yeni bir başvuru en fazla 30 saniyede ve tek bir formla eklenebilir; zorunlu alanlar yalnızca şirket ve pozisyondur. | Kullanılabilirlik testi |
| NFR-10 | Etkileşim | Arayüz 360 px mobil genişlikten masaüstüne kadar duyarlıdır; açık ve koyu tema vardır. | Playwright görsel testleri |
| NFR-11 | Güvenilirlik | Veritabanı her gün otomatik ve şifreli olarak yedeklenir; geri yükleme ayda bir test edilir. | Geri yükleme tatbikatı |
| NFR-12 | Bakım kolaylığı | TypeScript strict mod açıktır, ESLint uyarısı sıfırdır; iş mantığında test kapsamı en az %80'dir. | CI |
| NFR-13 | Taşınabilirlik | Uygulama tek bir `docker compose up` komutuyla Linux'ta yerel olarak çalışır. | README talimatı + CI |
| NFR-14 | Gizlilik | Kişisel veriler KVKK'ya uygun işlenir: yalnızca gerekli veri toplanır, dışa aktarma ve silme hakkı vardır (FR-14), üçüncü taraf takipçi kullanılmaz. | Gizlilik incelemesi |

## 4. Veri modeli

Veritabanı PostgreSQL'dir ve 3. normal forma (3NF) uygun tasarlanır. Her tabloda `user_id` vardır; uygulama katmanındaki kontrole ek olarak PostgreSQL Row-Level Security (RLS) ile bir kullanıcının başkasının satırını görmesi veritabanı seviyesinde de engellenir. Birincil anahtarlar UUIDv7'dir; tahmin edilebilir ID'lerle (1, 2, 3) yapılan IDOR saldırılarını zorlaştırır ve zamana göre sıralanır.

| Tablo | Temel alanlar | İlişkiler |
| --- | --- | --- |
| users | id, email (benzersiz, küçük harfe çevrilmiş), password\_hash (Argon2id), totp\_secret\_enc (AES-256-GCM), totp\_enabled\_at, totp\_last\_step (tekrar oynatma koruması), locale, created\_at, updated\_at | Bir kullanıcının tüm kayıtları |
| sessions | id, token\_hash (256 bit rastgele token'ın SHA-256'sı; token'ın kendisi saklanmaz), user\_id, mfa\_pending, created\_at, last\_seen\_at, expires\_at, user\_agent | users 1—N |
| mfa\_recovery\_codes | id, user\_id, code\_hash, used\_at, created\_at | users 1—N (her kod tek kullanımlık) |
| companies | id, user\_id, name, sector, website, notes | users 1—N, applications 1—N |
| cv\_versions | id, user\_id, label (örn. "SnA Data AI"), file\_name (yalnızca metin; dosya yüklenmez, ADR-0003), created\_at | users 1—N |
| applications | id, user\_id, company\_id, cv\_version\_id, position\_title, job\_url, source, location, work\_mode, salary\_expectation, current\_stage, applied\_at, archived\_at, notes, job\_description (FR-23), created\_at, updated\_at | companies N—1, cv\_versions N—1 |
| stage\_history | id, user\_id, application\_id, from\_stage, to\_stage, changed\_at | applications 1—N (yalnızca ekleme yapılır) |
| activities | id, user\_id, application\_id, type (interview, email, call, assignment), occurred\_at, contact\_name, notes | applications 1—N |
| profiles | user\_id (birincil anahtar), full\_name, headline, email, phone, location, website, linkedin, github, summary, skills, languages, experience, education (jsonb listeler), updated\_at | users 1—1 (FR-20) |
| master\_cvs | user\_id (birincil anahtar), markdown, updated\_at | users 1—1 (FR-23) |
| tailored\_cvs | id, user\_id, application\_id, markdown, match\_score, missing\_keywords, changes (jsonb listeler), model, created\_at, updated\_at | applications 1—N (FR-24) |
| audit\_log | id, user\_id, event (register, login\_success, login\_failed, mfa\_enabled, mfa\_recovery\_used, logout\_all, password\_reset, data\_export, account\_deleted), ip\_hash, created\_at | users 1—N (yalnızca ekleme yapılır) |

- `current_stage` ve `type` gibi sınırlı değerler CHECK kısıtı ile korunur (`apps/api/migrations/0002_domain.sql`).
- Alt tablolar üst kayda `(id, user_id)` bileşik yabancı anahtarıyla bağlanır. Yabancı anahtar kontrolleri RLS'i atladığı için, bu sayede bir kullanıcı başkasının şirket, CV veya başvuru ID'sini kendi kaydına iliştiremez.
- Aşama geçmişi bir veritabanı trigger'ıyla aşama değişikliğiyle aynı transaction'da yazılır; uygulama rolünün `stage_history` üzerinde UPDATE/DELETE yetkisi yoktur (FR-06).
- Sık filtrelenen alanlara indeks eklenir: `(user_id, current_stage)`, `(user_id, applied_at DESC)`; şirket ve pozisyon araması için `pg_trgm` indeksi kullanılır.
- Maaş beklentisi, notlar, ilan metni, Ana CV ve uyarlanmış CV'ler hassas kabul edilir; loglara asla yazılmaz.
- Şema değişiklikleri yalnızca sürüm kontrollü migration dosyalarıyla yapılır (`apps/api/migrations/`, ADR-0004).
- RLS'in bağlantı havuzuyla nasıl çalıştığı ve veritabanı rolleri ADR-0002'de tanımlıdır.

## 5. Mimari ve teknoloji seçimi

Mimari, tek bir alan adı altında çalışan üç katmandan oluşur: React arayüzü, TypeScript ile yazılmış bir REST API ve PostgreSQL. Arayüz ve API aynı kaynaktan (same-origin) sunulur; API `/api` altındadır. Bu yüzden CORS açılmaz ve oturum çerezleri en sıkı ayarlarla kullanılabilir. Seçimler, Berra'nın bildiği teknolojileri (Node.js, React, PostgreSQL, Docker) temel alıp güvenliği varsayılan hale getiren araçlarla güçlendirir.

&#91;embedded content: JobTrack mimarisi · 4 bileşen, tek alan adı\]

Tüm trafik Caddy'den geçer: `/` statik React dosyalarına, `/api` API'ye gider. PostgreSQL'in portu internete hiç açılmaz.

| Katman | Seçim | Neden |
| --- | --- | --- |
| Depo yapısı | pnpm workspaces monorepo: `apps/web`, `apps/api`, `packages/shared` | Doğrulama şemaları arayüz ve API arasında tek kaynaktan paylaşılır (DRY) |
| Arayüz | React + TypeScript + Vite | Bilinen teknoloji, hızlı build, route bazlı code splitting |
| Sunucu verisi | TanStack Query | Önbellek, iyimser güncelleme (optimistic update) ve tekrar deneme hazır gelir; INP'yi düşük tutar |
| Formlar | React Hook Form + Zod | Aynı Zod şeması istemcide ve sunucuda çalışır |
| Bileşenler | Radix UI / shadcn/ui + Tailwind CSS | Erişilebilir (ARIA, klavye, odak yönetimi) hazır bileşenler |
| API | Node.js (LTS) + Fastify + TypeScript | JSON şema doğrulaması ve yüksek performans yerleşik gelir; Express'e çok benzer |
| Veri erişimi | Drizzle ORM | Tüm sorgular parametreli olur; SQL'e yakın, tip güvenli, migration desteği var |
| Veritabanı | PostgreSQL | RLS, enum, trigram arama; Berra'nın en güçlü veritabanı |
| Kimlik doğrulama | Sunucu taraflı oturum + HttpOnly çerez, Argon2id, TOTP | JWT'yi localStorage'da tutmaktan daha güvenli: XSS ile çalınamaz, anında iptal edilebilir |
| Ters vekil (reverse proxy) | Caddy | Otomatik HTTPS (Let's Encrypt), HTTP/2-3, güvenlik başlıkları tek dosyada |
| Çalıştırma | Docker Compose (yerel ve sunucu) | Linux'ta tek komutla kurulum (NFR-13) |
| Test | Vitest, Testing Library, Playwright, axe-core, k6 | Birim, bileşen, uçtan uca, erişilebilirlik ve yük testi |
| CI/CD | GitHub Actions | Ayrıntıları Bölüm 7'de |

**Katmanlı backend yapısı:** `routes` (HTTP, doğrulama) → `services` (iş kuralları) → `repositories` (veritabanı). Her katman yalnızca bir alttakini çağırır. Bu yapı SOLID'in tek sorumluluk ve bağımlılıkların tersine çevrilmesi ilkelerini uygular; servisler veritabanı olmadan test edilebilir.

## 6. Güvenlik tasarımı ve tehdit modeli

OWASP Top 10:2025'in her kategorisi için JobTrack'te en az bir somut kontrol vardır. 2025 listesinde iki yeni kategori bulunur: yazılım tedarik zinciri hataları (A03) ve istisnai durumların yanlış ele alınması (A10). SSRF ise artık A01 Erişim Kontrolü kategorisine dahildir. Bu kontroller OWASP ASVS 5.0'ın (Mayıs 2025) Seviye 2 gereksinimleriyle doğrulanır.

| OWASP 2025 riski | JobTrack'teki kontrol |
| --- | --- |
| A01 Erişim kontrolü hataları | Her sorgu oturumdaki `user_id` ile filtrelenir; PostgreSQL RLS ikinci savunma hattıdır. UUIDv7 ID kullanılır. Başkasının kaydına erişim 404 döner. Uygulama dışarıya kullanıcının verdiği bir URL'ye istek atmaz (SSRF yüzeyi yok); yapay zekâ sağlayıcısının adresi yalnızca yapılandırmadan gelir (ADR-0010). |
| A02 Güvenlik yapılandırma hataları | Caddy güvenlik başlıkları: sıkı CSP (`default-src 'self'`, inline script yok), HSTS, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `frame-ancestors 'none'`. Üretimde hata ayrıntısı ve stack trace gösterilmez. Varsayılan hesap ve parola yoktur. |
| A03 Yazılım tedarik zinciri hataları | `pnpm-lock.yaml` commit edilir, CI'da `--frozen-lockfile` kullanılır. `pnpm audit` ve OSV-Scanner çalışır. SBOM (CycloneDX) üretilir. GitHub Actions sürümleri commit SHA ile sabitlenir. Docker taban imajları resmi ve minimal (distroless/alpine/slim) olur, etiket yerine değişmez özetle (sha256 digest) sabitlenir ve Trivy ile taranır. |
| A04 Kriptografik hatalar | Yalnızca HTTPS (TLS 1.2+). Parolalar Argon2id ile hash'lenir; OWASP'ın önerdiği minimum ayar 19 MiB bellek, 2 iterasyon ve 1 paralelliktir. TOTP gizli anahtarı AES-256-GCM ile şifrelenir. Gizli anahtarlar koda değil, ortam değişkenine konur. |
| A05 Enjeksiyon | Drizzle ile tüm SQL sorguları parametrelidir; ham SQL'de string birleştirme yasaktır (ESLint kuralı). React çıktıyı otomatik kaçışlar (escape); `dangerouslySetInnerHTML` yasaktır. CSV dışa aktarımda `=`, `+`, `-`, `@` ile başlayan hücreler kaçışlanır (CSV injection). |
| A06 Güvensiz tasarım | Bu dokümandaki tehdit modeli kodlamadan önce yapılır. Her girdi için Zod şeması izin listesi (allowlist) mantığıyla çalışır; tanımsız alanlar reddedilir (mass assignment koruması). İstek gövdesi 100 KB ile sınırlıdır. Yer imi betiğinden gelen adres parametreleri de aynı şemalardan geçer (ADR-0009). Yapay zekâ çıktısı güvenilmeyen girdi sayılır: şemadan geçmeyen yanıt reddedilir, olmayan tarih/süre/şirket adı işaretlenir (ADR-0010). |
| A07 Kimlik doğrulama hataları | Parola en az 12 karakterdir ve sızmış parola listesine karşı kontrol edilir (k-anonimlik ile). Girişte IP ve hesap bazında hız sınırı uygulanır. TOTP ile iki adımlı doğrulama yapılır. Ne giriş ne kayıt ucu hesabın var olup olmadığını belli eder (ADR-0011). Giriş kilidi denetim kaydından sayılır, bu yüzden yeniden başlatmada düşmez; güvenilen cihazdan gelen giriş, başkalarının hatalı denemeleriyle kilitlenmez. Girişten sonra oturum ID'si yenilenir. Çerez ayarları: `HttpOnly`, `Secure`, `SameSite=Lax`, `__Host-` öneki; 30 dakika hareketsizlikte ve 7 günün sonunda oturum biter. |
| A08 Yazılım veya veri bütünlüğü hataları | Durum değiştiren isteklerde CSRF koruması (SameSite + senkronize token) ve `Origin` başlığı kontrolü yapılır. Güvensiz deserialization yapılmaz; JSON yalnızca şemadan geçince kabul edilir. Dağıtım yalnızca CI'dan, imzalı imajla yapılır. |
| A09 Güvenlik loglama ve uyarı hataları | Giriş, başarısız giriş, MFA değişikliği, dışa aktarma ve hesap silme olayları `audit_log`'a yazılır. Yapılandırılmış JSON log tutulur (pino); parola, oturum ID'si ve notlar loglanmaz. Ardışık başarısız girişler bir sonraki girişte uygulama içinde uyarı olarak gösterilir (MVP'de e-posta yok, ADR-0003). |
| A10 İstisnai durumların yanlış ele alınması | Merkezi hata yöneticisi vardır; kullanıcıya genel bir mesaj ve iz ID'si gösterilir, ayrıntı loga gider. Sistem "kapalı kalarak hata verir" (fail closed): yetki kontrolü hata verirse erişim reddedilir. Veritabanı işlemleri transaction içinde yapılır; yarım kalan işlem geri alınır. |

**Tehdit modeli (STRIDE özeti):**

- **Spoofing (kimlik taklidi):** Çalınmış parola → TOTP, hız sınırı ve sızmış parola kontrolüyle engellenir.
- **Tampering (veri değiştirme):** Başkasının başvurusunu düzenleme → RLS ve sahiplik kontrolüyle engellenir.
- **Repudiation (inkar):** "Ben silmedim" → `audit_log` ve `stage_history` yalnızca eklemeye açıktır.
- **Information disclosure (bilgi sızıntısı):** XSS ile veri çalma → CSP ve HttpOnly çerezle engellenir. Yedek sızıntısı → yedekler şifrelenir. CV'nin üçüncü tarafa (yapay zekâ sağlayıcısı) gitmesi → özellik varsayılan kapalıdır, her istekte açık onay alınır, kişisel bilgiler maskelenir; anahtar yalnızca sunucudadır (ADR-0010).
- **Denial of service (hizmet engelleme):** Pahalı Argon2 çağrılarıyla sunucuyu yorma → giriş hız sınırı ve istek boyutu limitiyle engellenir.
- **Elevation of privilege (yetki yükseltme):** Admin rolü yoktur; veritabanı kullanıcısı yalnızca gerekli yetkilere sahiptir (en az yetki ilkesi), migration için ayrı bir kullanıcı vardır.

## 7. Yazılım ilkeleri, test ve CI/CD stratejisi

Kod kalitesi kişinin dikkatine bırakılmaz; kurallar CI tarafından zorlanır ve bir kontrol geçmezse kod `main` dalına giremez.

**Uygulanan ilkeler:**

- **SOLID:** Katmanlı backend (Bölüm 5); servisler repository arayüzlerine bağımlıdır, somut veritabanına değil.
- **DRY:** Zod şemaları `packages/shared` içinde tek kaynaktır; tipler bu şemalardan türetilir.
- **KISS ve YAGNI:** Mikroservis, Redis veya kuyruk kullanılmaz; tek API ve tek veritabanı yeterlidir. İhtiyaç çıktığında eklenir.
- **Secure by default ve en az yetki:** Yeni bir endpoint varsayılan olarak kimlik doğrulama ister; herkese açık olması açıkça belirtilmelidir.
- **12-Factor App:** Yapılandırma ortam değişkenlerindedir, loglar stdout'a yazılır, uygulama durumsuzdur (stateless).
- **Conventional Commits ve Semantic Versioning:** Commit mesajları standarttır, CHANGELOG otomatik üretilir.
- **ADR (Architecture Decision Records):** Önemli kararlar (örn. "neden JWT değil de oturum") `docs/adr/` klasöründe kısa notlar olarak yazılır.

**Test piramidi:**

| Seviye | Araç | Neyi kapsar | Hedef |
| --- | --- | --- | --- |
| Birim | Vitest | Servislerdeki iş kuralları, Zod şemaları, aşama geçiş kuralları | %80+ kapsam |
| Entegrasyon | Vitest + Testcontainers (gerçek PostgreSQL) | API uçları, RLS, transaction'lar | Her endpoint |
| Yetki (authorization) | Vitest | A kullanıcısı B'nin her kaydına erişmeyi dener; 404 bekler | Her endpoint |
| Uçtan uca | Playwright | Kayıt, giriş + TOTP, başvuru ekleme, Kanban'da taşıma, dışa aktarma | Kritik 5 akış |
| Erişilebilirlik | axe-core (Playwright içinde) | WCAG 2.2 AA otomatik kontrolleri | 0 ihlal |
| Performans | Lighthouse CI, k6 | Core Web Vitals, API gecikmesi | NFR-03, NFR-04 |

**CI akışı (her pull request'te):**

1. Lint ve tip kontrolü: ESLint (eslint-plugin-security dahil), Prettier, `tsc --noEmit`
2. Birim ve entegrasyon testleri, kapsam raporu
3. Güvenlik taramaları: Semgrep (SAST), `pnpm audit` + OSV-Scanner (bağımlılıklar), Gitleaks (sızmış gizli anahtar), Trivy (Docker imajı)
4. Build ve paket boyutu bütçesi kontrolü
5. Playwright uçtan uca testler + axe-core
6. Lighthouse CI
7. `main` dalında: OWASP ZAP baseline taraması (DAST), imajın imzalanması, sunucuya dağıtım

Her push'ta tüm kontroller CI'da çalışır; imajlar yalnızca `main` yeşilken yayımlanır.

## 8. Yol haritası ve uygulama

Proje dört fazda ilerler. Her fazın sonunda bir kapı (gate) vardır: o fazın testleri ve güvenlik kontrolleri geçmeden sonraki faza geçilmez. Tarih verilmedi; her faz bir çalışma bloğu olarak düşünülmeli.

&#91;embedded content: Yol haritası · 4 faz, 4 kapı\]

Güvenlik en sona bırakılmaz: tarama ve testler Faz 1'de kurulur, sonraki her faz bu kontrollerden geçer.

**Çalışma şekli:**

1. Bu dokümanı Markdown olarak dışa aktar ve proje köküne `docs/requirements.md` adıyla koy.
2. Her seferinde tek bir faz uygula, örneğin: "Faz 1'i uygula. Sadece FR-01, FR-02, FR-03 ve Bölüm 6'daki A04 ve A07 kontrollerini yap. Bitince testleri çalıştır ve hangi gereksinimleri karşıladığını listele."
3. Her faz sonunda ayrı bir güvenlik incelemesi yap: "Bu fazın kodunu OWASP Top 10:2025'e göre incele; bulduklarını önem sırasına göre listele, düzeltmeden önce bana sor."
4. Kod `main` dalına yalnızca CI yeşil olduğunda birleştirilir.

## 9. Kaynaklar

- [OWASP Top 10:2025](https://owasp.org/Top10/2025/es/)
- [OWASP Top 10 2025 değişiklikleri — Cyber Security News](https://cybersecuritynews.com/owasp-top-10-2025/)
- [OWASP ASVS 5.0 — arc42 Quality](https://quality.arc42.org/standards/owasp-asvs)
- [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [Web Vitals — web.dev](https://web.dev/articles/vitals)
- [WCAG 2.2 açıklaması — e-Include](https://e-include.eu/web-accessibility/wcag-2-2/)
- [WCAG 2.2 yeni başarı kriterleri — IntegraNXT](https://accessibility.integranxt.com/?p=394)
- [ISO/IEC 25010:2023 — genorma](https://genorma.com/en/standards/iso-iec-25010-2023/amp)
- [ISO/IEC 25010 açıklaması — SonarSource](https://www.sonarsource.com/resources/library//iso-iec-25010-explained/)
