# ADR-0004: Migration'lar elle yazılan SQL dosyalarıdır

- Durum: Kabul edildi
- Tarih: 2026-10-06
- İlgili: Bölüm 4, ADR-0002

## Bağlam

Drizzle'ın migration aracı (drizzle-kit) şemadan SQL üretir. Ancak JobTrack'in şemasının önemli bir kısmı RLS politikaları, `FORCE ROW LEVEL SECURITY`, `SECURITY DEFINER` fonksiyonlar ve rol bazlı `REVOKE` komutlarından oluşur. Bunlar zaten elle yazılmak zorunda. drizzle-kit ayrıca büyük bir geliştirme bağımlılığıdır (esbuild ve kurulum betikleri).

## Karar

- Migration'lar `apps/api/migrations/NNNN_ad.sql` dosyalarıdır ve elle yazılır.
- `src/db/migrate.ts` (yaklaşık 50 satır) bunları ad sırasına göre, her birini ayrı bir transaction içinde ve yalnızca bir kez uygular. Uygulananlar `schema_migrations` tablosunda tutulur. Eşzamanlı çalışmayı advisory lock engeller.
- Migration'lar `jobtrack_migrator` rolüyle çalışır; uygulama rolünün DDL yetkisi yoktur.
- Drizzle yalnızca sorgu oluşturucu olarak kullanılır. `src/db/schema.ts` SQL şemasının tipli aynasıdır.

## Sonuçlar

- SQL şeması ile `schema.ts` elle senkron tutulmalıdır. Entegrasyon testleri gerçek veritabanında bütün sorguları çalıştırdığı için uyumsuzluk testte yakalanır.
- Geri alma (down) migration'ı yoktur; hatalı bir değişiklik yeni bir ileri migration ile düzeltilir.
