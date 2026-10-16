# ADR-0005: Arayüz dilleri (Türkçe ve İngilizce)

- Durum: Kabul edildi
- Tarih: 2026-10-07
- İlgili: FR-16, FR-14, NFR-05, NFR-06, A03

## Bağlam

FR-16 arayüzün Türkçe ve İngilizce olmasını ister. Arayüz metinleri bileşenlere dağınık yazılmıştı; doğrulama mesajları (Zod şemaları) ve API hata metinleri Türkçedir ve sunucuyla ortak kullanılır.

## Karar

1. **Çeviri kütüphanesi yok.** `apps/web/src/i18n/` altında küçük, tip güvenli bir yapı kullanılır: `tr.ts` kaynak dildir ve `Messages` tipi ondan türetilir. `en.ts` bu tipi sağlamak zorundadır; eksik anahtar derleme hatası verir. Değişkenli metinler fonksiyondur (İngilizcede tekil/çoğul ayrımı burada yapılır). Bağımlılık eklenmemesi paket bütçesini (NFR-05) ve tedarik zinciri yüzeyini (A03) küçük tutar.
2. **Türkçe kaynak metindir.** Şema doğrulama mesajları ve API hata metinleri Türkçe kalır; sunucu dil bilmez. İngilizce arayüz hataları istemcide çevirir: API hataları `code` alanından, doğrulama hataları Zod hata türü ve alan adından. Kodu bilinmeyen hata durum koduna göre genel bir metne düşer.
3. **Dil tercihi hesapta saklanır.** `users.locale` (0001 migration'ında vardı, migration gerekmedi) `GET/PATCH /settings` ve `GET /auth/me` ile okunur/yazılır; kayıtta seçili dil gönderilir. Girişten önce tercih `localStorage`'da tutulur. Oturum açıkken hesabın dili cihazdaki tercihi geçersiz kılar, böylece tercih cihazlar arasında taşınır. Varsayılan Türkçedir.
4. **Alan değerlerinin etiketleri** (aşama, kaynak, çalışma şekli, etkinlik türü) `packages/shared`'de `DOMAIN_LABELS` olarak iki dilde tutulur. Arayüz ve dışa aktarma (CSV başlıkları, takvim) aynı kaynağı kullanır; dışa aktarılan dosyalar kullanıcının dilindedir.
5. **URL'ler değişmez** (`/giris`, `/basvurular` …). Paylaşılmış bağlantılar dil değişince bozulmaz.
6. **Hesap silme onayı:** kullanıcı kendi dilindeki kelimeyi yazar (`SİL` / `DELETE`); istemci denetler ve API'ye her dilde `confirm: "SİL"` gönderir. API sözleşmesi değişmez.
7. `<html lang>` seçili dile göre güncellenir (WCAG 3.1.1).

## Sonuçlar

- Yeni bir arayüz metni eklemek için iki dosyada da anahtar gerekir; derleyici unutulanı yakalar. Ek olarak bir test, İngilizce metinlerin boş olmadığını ve Türkçe karakter içermediğini denetler.
- Yeni bir API hata kodu eklendiğinde `en.ts`'deki `enApiErrors` tablosuna da eklenmelidir; eklenmezse İngilizce arayüz durum koduna göre genel bir metin gösterir.
- İki dilin metinleri ana pakettedir (gzip ile yaklaşık 9 KB artış; 129 KB / 200 KB bütçe). Üçüncü bir dil eklenirse diller tembel yüklemeye (lazy loading) geçirilmelidir.
