-- FR-23, FR-24 (ADR-0010): Ana CV, başvuruya bağlı ilan metni ve ilana göre uyarlanmış CV sürümleri.
-- Hepsi kullanıcının hassas verisidir: RLS altında, dışa aktarıma girer, hesapla silinir ve
-- loglanmaz.

-- Kullanıcı başına tek Ana CV (Markdown).
CREATE TABLE master_cvs (
  user_id     uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  markdown    text NOT NULL CHECK (length(markdown) <= 30000),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE master_cvs ENABLE ROW LEVEL SECURITY;
ALTER TABLE master_cvs FORCE ROW LEVEL SECURITY;
CREATE POLICY master_cvs_owner ON master_cvs
  USING (user_id = app_current_user_id()) WITH CHECK (user_id = app_current_user_id());

-- İlan metni başvuruyla birlikte saklanır; liste yanıtlarına girmez (yalnızca kendi ucu okur).
ALTER TABLE applications
  ADD COLUMN job_description text CHECK (length(job_description) <= 20000);

-- Uyarlanmış CV sürümleri. Başvuruya (id, user_id) bileşik yabancı anahtarla bağlanır; başkasının
-- başvurusuna sürüm iliştirilemez. Başvuru silinince sürümleri de silinir.
CREATE TABLE tailored_cvs (
  id                uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id           uuid NOT NULL,
  application_id    uuid NOT NULL,
  markdown          text NOT NULL CHECK (length(markdown) <= 30000),
  match_score       smallint CHECK (match_score BETWEEN 0 AND 100),
  missing_keywords  jsonb NOT NULL DEFAULT '[]'
    CHECK (jsonb_typeof(missing_keywords) = 'array' AND jsonb_array_length(missing_keywords) <= 30),
  changes           jsonb NOT NULL DEFAULT '[]'
    CHECK (jsonb_typeof(changes) = 'array' AND jsonb_array_length(changes) <= 20),
  model             text CHECK (length(model) <= 100),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (application_id, user_id) REFERENCES applications (id, user_id) ON DELETE CASCADE
);
CREATE INDEX tailored_cvs_application_idx ON tailored_cvs (application_id, created_at DESC);

ALTER TABLE tailored_cvs ENABLE ROW LEVEL SECURITY;
ALTER TABLE tailored_cvs FORCE ROW LEVEL SECURITY;
CREATE POLICY tailored_cvs_owner ON tailored_cvs
  USING (user_id = app_current_user_id()) WITH CHECK (user_id = app_current_user_id());
