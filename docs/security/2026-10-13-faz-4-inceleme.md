# Güvenlik incelemesi: Faz 4 (profil, CV'den öneri, tanıtım sayfası)

- Tarih: 2026-10-13
- Kapsam: `744b7be`..`6df22cf` (FR-20, FR-21, ADR-0008, tanıtım sayfası) ve bu incelemedeki düzeltmeler
- Yöntem: OWASP Top 10:2025'e göre elle kod incelemesi; OWASP ZAP baseline (DAST); uçtan uca testler (Playwright, axe WCAG 2.2 AA); ayrıştırıcıya 100 KB'lık patolojik girdilerle zamanlama testi.
- Sonuç: Kritik bulgu yok. 1 orta ve 1 düşük bulgu düzeltildi. ZAP'ta orta veya yüksek bulgu yok.

| #   | Önem  | Kategori  | Bulgu                                                                                                                                                                                   | Düzeltme                                                                                                               | Test                                                     |
| --- | ----- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| 1   | Orta  | DoS (A06) | CV ayrıştırıcısındaki e-posta regex'inde sınırsız niceleyici vardı (ReDoS). "@" içermeyen 100 KB'lık tek kelimelik bir CV metni API'nin olay döngüsünü yaklaşık 23 saniye kilitliyordu. | Niceleyiciler RFC 5321 sınırlarıyla sınırlandı (yerel kısım 64, alan adı 253). En kötü durum 23 sn'den 143 ms'ye indi. | `cv-parse.test.ts`: 100 KB patolojik metinde hızlı kalır |
| 2   | Düşük | DoS (A06) | Sayfa boyutu aşırı büyük bir PDF, OCR için devasa bir görüntü üretebiliyordu. Konteynerin bellek ve tmpfs sınırları bunu durduruyordu, ama kuyruğu boşuna meşgul ediyordu.              | `pdftoppm -scale-to 3000`: görüntünün uzun kenarı en fazla 3000 piksel.                                                | Taranmış örnek PDF ile elle doğrulandı                   |

## Doğrulanan kontroller

- **A01:** `/profile` uç noktaları oturum ister. Profil RLS altında okunur ve yazılır. Başkasının CV versiyonuyla `extract` çağrısı 404 döner ve ayrıştırıcıya hiçbir şey gitmez. Ayrıştırıcının adresi yapılandırmadan gelir, kullanıcı girdisinden gelmez (SSRF yüzeyi yok). Bunların hepsi entegrasyon testiyle doğrulanır.
- **A05:** Bağlantılar yalnızca `http(s)` olabilir; `javascript:` reddedilir. Öneriler React'te metin olarak gösterilir.
- **A06:** Tüm girdiler Zod `strictObject` şemasından geçer. Profil rotasının gövde sınırı 256 KB'dır. `extract` için dakikada 6 istekle sınırlı bir IP sınırı vardır. Ayrıştırıcı kuyruğu 8 ile sınırlıdır.
- **A08:** Durum değiştiren isteklerde CSRF token'ı ve Origin denetimi yapılır (test edildi).
- **A09:** Profil gövdesi, PDF ve çıkarılan metin loglanmaz. Ayrıştırıcı hatalarında yalnızca hata türü loglanır.
- **A10:** Ayrıştırıcı tanımsızsa ya da yanıt vermiyorsa 503 döner (fail closed). Okunamayan PDF 422 döner.
- **Yalıtım:** `cv-parser` yalnızca API ile paylaşılan `internal` bir ağdadır: internete ve veritabanına erişemez, portu dışarı açık değildir. Konteyner salt okunurdur, yetkisiz kullanıcıyla çalışır ve `cap_drop: ALL`, bellek, CPU ve süreç sınırları vardır. Araçlar kabuksuz ve zaman aşımıyla çalışır. İmaj CI'da Trivy ile taranır.
- **KVKK:** Profil JSON dışa aktarımında yer alır ve hesapla birlikte silinir (test edildi). CV dışarıdaki bir servise gönderilmez.

## Bilinçli olarak kabul edilen riskler

- **Ayrıştırıcı kuyruğunun doldurulması:** Oturum açmış bir kullanıcı, kuyruğu kısa süre için doldurup diğer `extract` isteklerinin 503 almasına yol açabilir. Uygulama tek kullanıcılıdır; uygulamanın geri kalanı bundan etkilenmez.
- **Kural tabanlı ayrıştırma:** Alışılmadık CV düzenlerinde öneriler eksik ya da yanlış olabilir. Bu bir güvenlik değil doğruluk riskidir: onay ekranı zorunludur ve hiçbir öneri kullanıcı seçip kaydetmeden yazılmaz.
- **ZAP kapsamı:** Baseline taraması pasiftir ve oturumsuz yapılır; tanıtım ve giriş sayfalarını kapsar. Oturum gerektiren sayfalar entegrasyon ve uçtan uca testlerle doğrulanır.
