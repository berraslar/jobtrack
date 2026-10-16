# ADR-0001: JWT yerine sunucu taraflı oturum

- Durum: Kabul edildi
- Tarih: 2026-10-06
- İlgili: FR-01, FR-03, A07, A08

## Bağlam

API ve arayüz aynı kaynaktan (same-origin) sunulur. Kimlik doğrulama için iki seçenek vardı: JWT (genellikle localStorage'da) veya sunucuda saklanan oturum + HttpOnly çerez.

## Karar

Sunucu taraflı oturum kullanılır. Oturum ID'si 256 bit rastgele değerdir; veritabanında yalnızca SHA-256 hash'i saklanır. Çerez: `__Host-session`, `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`. Girişten sonra ID yenilenir; 30 dakika hareketsizlik veya 7 gün sonunda oturum biter.

## Sonuçlar

- XSS ile oturum çalınamaz (HttpOnly); oturum anında iptal edilebilir (FR-03).
- Her istekte bir veritabanı sorgusu gerekir; tek kullanıcılı ölçekte önemsizdir.
- Çerez tabanlı olduğu için CSRF koruması (senkronize token + `Origin` kontrolü) zorunludur.
