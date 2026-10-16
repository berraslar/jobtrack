-- Faz 2: başvuru takibinin temel alan modeli.
-- İlgili: FR-04, FR-05, FR-06, FR-07, FR-08, FR-13, FR-15, A01, ADR-0002
--
-- Sahiplik veritabanında da korunur: alt tablolar üst satıra (id, user_id) bileşik yabancı
-- anahtarıyla bağlanır. Yabancı anahtar kontrolleri RLS'i atladığı için, yalnızca id ile bağlansaydı
-- bir kullanıcı başkasının şirket/CV/başvuru ID'sini kendi kaydına iliştirebilirdi.

CREATE TABLE companies (
  id          uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name        text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  sector      text CHECK (length(sector) <= 100),
  website     text CHECK (length(website) <= 2048 AND website ~ '^https?://'),
  notes       text CHECK (length(notes) <= 10000),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, user_id)
);
CREATE UNIQUE INDEX companies_user_name_key ON companies (user_id, lower(name));

CREATE TABLE cv_versions (
  id          uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  label       text NOT NULL CHECK (length(btrim(label)) BETWEEN 1 AND 100),
  file_name   text CHECK (length(file_name) <= 255),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, user_id)
);
CREATE UNIQUE INDEX cv_versions_user_label_key ON cv_versions (user_id, lower(label));

CREATE TABLE applications (
  id                  uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id             uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  company_id          uuid NOT NULL,
  cv_version_id       uuid,
  position_title      text NOT NULL CHECK (length(btrim(position_title)) BETWEEN 1 AND 200),
  job_url             text CHECK (length(job_url) <= 2048 AND job_url ~ '^https?://'),
  source              text CHECK (source IN ('linkedin', 'kariyer_net', 'company_site', 'referral', 'other')),
  location            text CHECK (length(location) <= 200),
  work_mode           text CHECK (work_mode IN ('office', 'hybrid', 'remote')),
  salary_expectation  text CHECK (length(salary_expectation) <= 100),
  current_stage       text NOT NULL DEFAULT 'saved' CHECK (current_stage IN (
                        'saved', 'applied', 'screening', 'technical', 'assignment', 'final',
                        'offer', 'accepted', 'rejected', 'no_response', 'withdrawn')),
  applied_at          date,
  archived_at         timestamptz,
  notes               text CHECK (length(notes) <= 10000),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, user_id),
  -- Şirketi olan başvuru varken şirket silinemez.
  FOREIGN KEY (company_id, user_id) REFERENCES companies (id, user_id) ON DELETE RESTRICT,
  -- CV versiyonu silinirse başvuru kalır, yalnızca bağlantı kopar.
  FOREIGN KEY (cv_version_id, user_id) REFERENCES cv_versions (id, user_id)
    ON DELETE SET NULL (cv_version_id)
);
CREATE INDEX applications_user_stage_idx ON applications (user_id, current_stage);
CREATE INDEX applications_user_applied_idx ON applications (user_id, applied_at DESC);
CREATE INDEX applications_company_idx ON applications (company_id);
CREATE INDEX applications_cv_version_idx ON applications (cv_version_id);

-- FR-06: aşama geçmişi yalnızca eklemeye açıktır.
CREATE TABLE stage_history (
  id              uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id         uuid NOT NULL,
  application_id  uuid NOT NULL,
  from_stage      text,
  to_stage        text NOT NULL,
  changed_at      timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (application_id, user_id) REFERENCES applications (id, user_id) ON DELETE CASCADE
);
CREATE INDEX stage_history_application_idx ON stage_history (application_id, changed_at);
REVOKE UPDATE, DELETE ON stage_history FROM jobtrack_app;

-- Aşama değişince geçmiş kaydı veritabanında, aynı transaction'da yazılır. Uygulama kodu
-- geçmişi atlayarak aşama değiştiremez.
CREATE FUNCTION record_stage_change() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  BEGIN
    IF TG_OP = 'INSERT' OR NEW.current_stage IS DISTINCT FROM OLD.current_stage THEN
      INSERT INTO stage_history (user_id, application_id, from_stage, to_stage)
      VALUES (
        NEW.user_id,
        NEW.id,
        CASE WHEN TG_OP = 'UPDATE' THEN OLD.current_stage END,
        NEW.current_stage
      );
    END IF;
    RETURN NEW;
  END;
  $$;
CREATE TRIGGER applications_stage_history
  AFTER INSERT OR UPDATE OF current_stage ON applications
  FOR EACH ROW EXECUTE FUNCTION record_stage_change();

CREATE TABLE activities (
  id              uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id         uuid NOT NULL,
  application_id  uuid NOT NULL,
  type            text NOT NULL CHECK (type IN ('interview', 'email', 'call', 'assignment')),
  occurred_at     timestamptz NOT NULL,
  contact_name    text CHECK (length(contact_name) <= 200),
  notes           text CHECK (length(notes) <= 5000),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (application_id, user_id) REFERENCES applications (id, user_id) ON DELETE CASCADE
);
CREATE INDEX activities_application_idx ON activities (application_id, occurred_at DESC);

-- Row-Level Security (A01)
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies FORCE ROW LEVEL SECURITY;
CREATE POLICY companies_owner ON companies
  USING (user_id = app_current_user_id()) WITH CHECK (user_id = app_current_user_id());

ALTER TABLE cv_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE cv_versions FORCE ROW LEVEL SECURITY;
CREATE POLICY cv_versions_owner ON cv_versions
  USING (user_id = app_current_user_id()) WITH CHECK (user_id = app_current_user_id());

ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications FORCE ROW LEVEL SECURITY;
CREATE POLICY applications_owner ON applications
  USING (user_id = app_current_user_id()) WITH CHECK (user_id = app_current_user_id());

ALTER TABLE stage_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE stage_history FORCE ROW LEVEL SECURITY;
CREATE POLICY stage_history_owner ON stage_history
  USING (user_id = app_current_user_id()) WITH CHECK (user_id = app_current_user_id());

ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities FORCE ROW LEVEL SECURITY;
CREATE POLICY activities_owner ON activities
  USING (user_id = app_current_user_id()) WITH CHECK (user_id = app_current_user_id());
