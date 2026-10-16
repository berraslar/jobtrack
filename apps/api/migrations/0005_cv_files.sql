-- FR-08: CV dosyası (ADR-0006). Her CV versiyonunun en fazla bir PDF dosyası olur.
--
-- Dosya ayrı tablodadır; versiyon listesi baytları okumaz. Veritabanında tutulduğu için RLS,
-- şifreli yedek (NFR-11) ve hesap silme (FR-14, zincirleme silme) dosyayı da kapsar.
CREATE TABLE cv_files (
  cv_version_id  uuid PRIMARY KEY,
  user_id        uuid NOT NULL,
  file_name      text NOT NULL CHECK (length(btrim(file_name)) BETWEEN 1 AND 255),
  content_type   text NOT NULL CHECK (content_type = 'application/pdf'),
  size_bytes     integer NOT NULL CHECK (size_bytes BETWEEN 1 AND 5242880),
  data           bytea NOT NULL CHECK (octet_length(data) = size_bytes),
  uploaded_at    timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (cv_version_id, user_id) REFERENCES cv_versions (id, user_id) ON DELETE CASCADE
);
-- PDF zaten sıkıştırılmıştır; TOAST'un boşa sıkıştırma denemesi atlanır.
ALTER TABLE cv_files ALTER COLUMN data SET STORAGE EXTERNAL;

ALTER TABLE cv_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE cv_files FORCE ROW LEVEL SECURITY;
CREATE POLICY cv_files_owner ON cv_files
  USING (user_id = app_current_user_id()) WITH CHECK (user_id = app_current_user_id());
