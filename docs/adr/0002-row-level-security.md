# ADR-0002: PostgreSQL Row-Level Security stratejisi

- Durum: Kabul edildi
- Tarih: 2026-10-06
- İlgili: A01, NFR-01, Bölüm 4

## Bağlam

Uygulama katmanındaki `user_id` filtresine ek olarak RLS ikinci savunma hattıdır. Drizzle tek bir bağlantı havuzu kullanır; bağlantılar istekler arasında paylaşılır, bu yüzden kullanıcı kimliği bağlantıya kalıcı olarak bağlanamaz.

## Karar

1. **Her tabloda `user_id` bulunur**, `stage_history` ve `activities` dahil. RLS politikaları JOIN gerektirmez: `USING (user_id = current_setting('app.user_id')::uuid)`.
2. **Kimlik transaction'a bağlanır.** Kimliği doğrulanmış her istek tek bir transaction içinde çalışır ve ilk iş `SELECT set_config('app.user_id', $1, true)` (yani `SET LOCAL`) çalıştırır. Transaction bitince ayar kaybolur; havuzdaki bağlantıya sızmaz.
3. **Ayar yoksa erişim yok (fail closed).** `current_setting('app.user_id', true)` boş dönerse politika hiçbir satırı eşleştirmez.
4. **Üç ayrı veritabanı rolü** (`infra/postgres/bootstrap.sql`):
   - `jobtrack_owner`: Tabloların sahibi, oturum açamaz (`NOLOGIN`). `BYPASSRLS` taşır; yalnızca migration'lar ve giriş öncesi `SECURITY DEFINER` fonksiyonlar bu rolle çalışır.
   - `jobtrack_migrator`: Migration çalıştırır; oturum açınca otomatik olarak `jobtrack_owner` rolüne geçer.
   - `jobtrack_app`: Uygulamanın kullandığı rol. Tablo sahibi değil, `BYPASSRLS` yok, DDL yapamaz; yalnızca `SELECT/INSERT/UPDATE/DELETE`. `audit_log` üzerinde `UPDATE/DELETE` yetkisi de yoktur.
5. Tablolarda `FORCE ROW LEVEL SECURITY` açılır. `users` tablosunda politika `id`, diğerlerinde `user_id` sütununa bakar.

## Sonuçlar

- Repository katmanı her zaman bir transaction nesnesi alır; doğrudan havuz erişimi yasaktır.
- Giriş öncesi iki işlem RLS dışında kalır ve yalnızca dar kapsamlı `SECURITY DEFINER` fonksiyonlarla yapılır: `auth_find_user_by_email` (yalnızca ID, parola hash'i, MFA durumu) ve `auth_find_session` (token hash'iyle oturum). Kayıtta yeni kullanıcının ID'si önce üretilir, `app.user_id` ona ayarlanır ve satır RLS altında eklenir.
- Entegrasyon testleri, ayar yapılmadan sorgu atıldığında 0 satır döndüğünü doğrular.
