-- Faz 3: arama ve takip.
-- İlgili: FR-10, FR-11, Bölüm 4 (indeksler)

-- Şirket ve pozisyon içinde "içerir" araması (ILIKE '%…%') için trigram indeksleri.
-- pg_trgm güvenilir (trusted) bir eklentidir; veritabanında CREATE yetkisi olan sahip rolü kurabilir.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX applications_position_trgm_idx ON applications USING gin (position_title gin_trgm_ops);
CREATE INDEX companies_name_trgm_idx ON companies USING gin (name gin_trgm_ops);

-- FR-11: kaç gün dönüş gelmezse "Takip et" işareti çıkacağı, kullanıcı başına.
ALTER TABLE users
  ADD COLUMN follow_up_days integer NOT NULL DEFAULT 14
  CHECK (follow_up_days BETWEEN 1 AND 365);
