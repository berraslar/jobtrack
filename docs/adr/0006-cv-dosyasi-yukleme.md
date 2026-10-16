# ADR-0006: CV dosyası yükleme

- Durum: Kabul edildi (ADR-0003 §3'ün yerini alır)
- Tarih: 2026-10-07
- İlgili: FR-08, FR-14, NFR-11, A01, A03, A05, A06

## Bağlam

ADR-0003, dosya yüklemeyi (zararlı içerik, depolama, tarama) MVP sonrasına bırakmıştı; CV versiyonu yalnızca etiket ve dosya adını metin olarak tutuyordu. Kullanıcı, CV'sini sürükleyip bırakarak gerçekten yüklemek istiyor.

## Karar

1. **Yalnızca PDF, en fazla 5 MB.** Tür, dosya uzantısına veya tarayıcının bildirdiği türe değil, içeriğin ilk baytlarındaki PDF imzasına (`%PDF-`) bakılarak doğrulanır. Aynı kural istemcide (hızlı geri bildirim) ve sunucuda (asıl denetim) uygulanır.
2. **Dosya PostgreSQL'de, ayrı tabloda** (`cv_files`, 0005 migration'ı) tutulur. Böylece RLS (A01), şifreli günlük yedek (NFR-11) ve hesap silmede zincirleme silme (FR-14) dosyayı da kendiliğinden kapsar; ayrı bir depolama birimi, yol yönetimi veya senkronizasyon gerekmez. Versiyon listesi baytları okumaz. Tek kullanıcılı sistemde birkaç CV için boyut sorun değildir.
3. **Yeni bağımlılık yok** (A03). Gövde `multipart` yerine ham `application/pdf` olarak gönderilir; dosya adı ve etiket URI kodlamasıyla `X-File-Name` ve `X-Cv-Label` başlıklarında gelir. Ayrıştırıcı ve 5 MB sınırı yalnızca CV rotalarına uygulanır; uygulamanın geri kalanında 100 KB sınırı (A06) geçerlidir.
4. **Uç noktalar:** `POST /cv-versions/upload` (versiyon ve dosya tek transaction'da; dosya geçersizse versiyon da oluşmaz), `PUT/GET/DELETE /cv-versions/:id/file`.
5. **İndirme güvenliği (A05):** `Content-Disposition: attachment` (dosya sitenin kökeninde açılmaz, indirilir), `X-Content-Type-Options: nosniff`, `Cache-Control: no-store`. Dosya adından yol bileşenleri ve kontrol karakterleri atılır.
6. **Kişisel veri (KVKK):** JSON dışa aktarımı dosyanın yalnızca bilgisini (boyut, tarih) içerir; dosyalar CV sayfasından tek tek indirilir. Dosya içeriği ve adı loglanmaz (istek gövdesi zaten loglanmaz).
7. **Kullanılabilirlik:** Sürükle-bırakın yanında aynı işi yapan "Dosya seç" düğmesi vardır (WCAG 2.1.1, 2.5.7). Alanı ıskalayan dosya bırakıldığında tarayıcının dosyayı açıp sayfadan çıkması engellenir.

## Sonuçlar

- PDF'in içeriği taranmaz (antivirüs yok). Dosyayı yalnızca yükleyen kullanıcı indirebilir ve indirme tarayıcıda açılmadan yapılır; risk kabul edilmiştir. Paylaşım özelliği eklenirse bu karar yeniden değerlendirilmelidir.
- Veritabanı ve yedekler CV dosyaları kadar büyür.
- Word (.docx) desteği istenirse imza denetimi (ZIP + `word/` içeriği) ve tür listesi genişletilmelidir.
