# ADR-0008: Profil ve CV'den profil önerisi

- Durum: Kabul edildi (2. madde, FR-24 için ADR-0010 ile daraltıldı)
- Tarih: 2026-10-13
- İlgili: FR-08, FR-14, FR-20, FR-21, FR-23, A01, A05, A06, A10, NFR-14

## Bağlam

Kullanıcı başvurularda kullandığı bilgileri (iletişim, deneyim, eğitim, yetenekler) tek yerde tutmak ve bunları elle yazmak yerine yüklediği CV'den doldurmak istedi. CV'ler ADR-0006'ya göre veritabanında PDF olarak duruyor. PDF ayrıştırma, güvenilmeyen ve karmaşık bir girdinin işlenmesi demektir; taranmış CV'ler için OCR da gerekir.

## Karar

1. **Profil (FR-20):** Kullanıcı başına tek satırlık `profiles` tablosu (RLS, `ON DELETE CASCADE`). Liste alanları (yetenek, dil, deneyim, eğitim) her zaman bütün olarak okunup yazıldığı için ayrı tablolar yerine `jsonb` tutulur; içerik API'de Zod şemasıyla (`packages/shared/src/profile.ts`) doğrulanır, veritabanında tür ve uzunluk CHECK ile sınırlanır. `PUT /profile` profilin tamamını yazar. Bağlantılar yalnızca `http(s)` olabilir. Dolu bir profil 100 KB'ı aşabildiği için bu rotanın gövde sınırı 256 KB'dır.
2. **Dışarıya gönderim yok:** CV hiçbir harici servise (LLM, bulut OCR) gönderilmez. Metin çıkarma ve ayrıştırma tamamen bu kurulumda yapılır (KVKK, NFR-14).
3. **Yalıtılmış ayrıştırıcı (`apps/cv-parser`):** PDF'i API sürecinde değil ayrı bir konteynerde okuruz. Metin katmanı varsa `pdftotext`, yoksa (taranmış PDF) `pdftoppm` + Tesseract (`tur+eng`) kullanılır; en fazla 4 sayfa. Konteyner yalnızca API ile paylaşılan `internal` bir ağdadır: internete, veritabanına ve dış porta erişimi yoktur. Salt okunur dosya sistemi, yetkisiz kullanıcı, `cap_drop: ALL`, bellek/CPU/süreç sınırları vardır. Araçlar kabuksuz, sabit argümanlarla, zaman aşımı ve çıktı sınırıyla çalışır; aynı anda tek PDF işlenir, kuyruk 8 ile sınırlıdır. PDF ve metin loglanmaz.
4. **Ayrıştırma (FR-21):** Metinden profile çeviri API'de, kural tabanlı ve deterministiktir (`cv-parse.ts`): bölüm başlıkları (Türkçe/İngilizce), tarih aralıkları (`03/2021`, `Oca 2020`, `Sep 2022 - now`, `Halen`), e-posta, telefon ve bağlantılar. Sonuç her zaman şemadan geçer; geçmeyen alan boşaltılır.
5. **Onaysız kayıt yok:** `POST /profile/extract` yalnızca öneri döndürür, veritabanına yazmaz. Arayüz öneriyi mevcut profille yan yana gösterir; kullanıcı alanları tek tek seçer ve düzeltir, kayıt normal `PUT /profile` ile yapılır.
6. **Erişim ve sınırlar:** Uç nokta oturum ister; CV versiyonu RLS altında okunur, başkasınınki 404 döner ve ayrıştırıcıya hiçbir şey gitmez. OCR pahalı olduğundan IP başına dakikada 6 istek sınırı vardır. Ayrıştırıcının adresi yapılandırmadan gelir (`CV_PARSER_URL`), kullanıcı girdisinden gelmez (SSRF yüzeyi yok). Tanımlı değilse veya servis yanıt vermezse 503 döner (fail closed); okunamayan PDF 422 döner.

7. **PDF'ten Ana CV (FR-23, 2026-10-16 eki):** Aynı ayrıştırıcı Ana CV için de kullanılır. `POST /master-cv/import` PDF'i ham gövde olarak alır (en fazla 5 MB, PDF imzası denetlenir), metni ayrıştırıcıdan alır ve kural tabanlı olarak Markdown taslağına çevirir (`cv-to-markdown.ts`: ad `#`, bölüm başlıkları `##`, madde işaretleri `-`). PDF de taslak da saklanmaz ve loglanmaz; yalnızca kullanıcı taslağı düzenleyip `PUT /master-cv` ile kaydedince yazılır. Oturum ister ve 6. maddedeki IP sınırı geçerlidir.

## Sonuçlar

- Kural tabanlı ayrıştırma alışılmadık CV düzenlerinde (çok sütun, tablo) eksik öneri verir; onay ekranı bu yüzden zorunludur ve her alan elle düzeltilebilir. Daha iyi sonuç için ileride yerel bir model değerlendirilebilir; harici servis bu ADR değiştirilmeden kullanılamaz.
- OCR imajı (~300 MB) ve CPU maliyeti eklenir. Servis kapalıyken uygulamanın geri kalanı etkilenmez.
- Profil JSON dışa aktarımına eklenir ve hesapla birlikte silinir (FR-14).
