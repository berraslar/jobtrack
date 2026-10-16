# ADR-0003: MVP kapsam kararları (e-posta, kayıt, CV dosyası, sızmış parola)

- Durum: Kabul edildi
- Tarih: 2026-10-06
- İlgili: FR-01, FR-08, A07, A09, NFR-14

## 1. E-posta gönderimi yok

> **Kısmen yerini aldı:** ADR-0007 (2026-10-07). Doğrulama kodları e-postayla gönderilir. Parola sıfırlama ve başarısız giriş uyarısı hâlâ e-postasızdır.

E-posta entegrasyonu MVP kapsamı dışındadır. Bu yüzden:

- A09'daki "ardışık başarısız girişlerde e-posta uyarısı" yerine olay `audit_log`'a yazılır ve bir sonraki girişte uygulama içinde uyarı gösterilir.
- Parola sıfırlama akışı MVP'de yoktur. Hesaba erişimi kaybeden kullanıcı TOTP kurtarma kodlarını kullanır; parola unutulursa sunucu tarafında bir CLI komutuyla sıfırlanır (Faz 1).

## 2. Herkese açık kayıt varsayılan olarak kapalı

`REGISTRATION_ENABLED` ortam değişkeni `false` ise kayıt uç noktası 404 döner. İlk hesap açıldıktan sonra üretimde kapalı tutulur. Bu, tek kullanıcılı sistemde gereksiz saldırı yüzeyini kaldırır.

## 3. CV dosyası yüklenmez

> **Yerini aldı:** ADR-0006 (2026-10-07). CV versiyonuna PDF dosyası yüklenebilir.

`cv_versions` yalnızca etiket ve dosya adını metin olarak tutar. Dosya yükleme (zararlı içerik, depolama, tarama) MVP sonrasına bırakıldı.

## 4. Sızmış parola kontrolü — bilinçli istisna

Parola, Have I Been Pwned "Pwned Passwords" API'sine k-anonimlik ile (SHA-1 hash'in yalnızca ilk 5 karakteri) sorulur. Parolanın kendisi veya tam hash'i gönderilmez, kişisel veri aktarılmaz. NFR-14'teki "üçüncü taraf takipçi yok" ilkesi takipçileri kapsar; bu sorgu bir takipçi değildir. API'ye ulaşılamazsa kayıt engellenmez, olay loglanır (yalnızca bu kontrol için fail-open; diğer tüm güvenlik kontrolleri fail-closed).
