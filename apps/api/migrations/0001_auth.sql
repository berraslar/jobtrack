-- Faz 1: kimlik doğrulama tabloları, RLS ve giriş öncesi fonksiyonlar.
-- İlgili: FR-01, FR-02, FR-03, A01, A04, A07, A09, ADR-0002

-- Oturumdaki kullanıcı. Ayar yoksa NULL döner; NULL hiçbir satırla eşleşmez (fail closed).
CREATE FUNCTION app_current_user_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;
GRANT EXECUTE ON FUNCTION app_current_user_id() TO jobtrack_app;

CREATE TABLE users (
  id               uuid PRIMARY KEY DEFAULT uuidv7(),
  email            text NOT NULL CHECK (email = lower(email) AND length(email) BETWEEN 3 AND 254),
  password_hash    text NOT NULL,
  totp_secret_enc  text,
  totp_enabled_at  timestamptz,
  totp_last_step   bigint,
  locale           text NOT NULL DEFAULT 'tr' CHECK (locale IN ('tr', 'en')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_key ON users (email);

CREATE TABLE sessions (
  id            uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id       uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash    bytea NOT NULL UNIQUE,
  mfa_pending   boolean NOT NULL DEFAULT false,
  user_agent    text CHECK (length(user_agent) <= 512),
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL
);
CREATE INDEX sessions_user_id_idx ON sessions (user_id);

CREATE TABLE mfa_recovery_codes (
  id          uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  code_hash   bytea NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mfa_recovery_codes_user_id_idx ON mfa_recovery_codes (user_id);

CREATE TABLE audit_log (
  id          uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  event       text NOT NULL CHECK (event IN (
                'register', 'login_success', 'login_failed', 'mfa_enabled', 'mfa_recovery_used',
                'logout_all', 'password_reset', 'data_export', 'account_deleted')),
  ip_hash     bytea,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_user_event_idx ON audit_log (user_id, event, created_at DESC);

-- Denetim kaydı yalnızca eklemeye açıktır (STRIDE: inkar).
REVOKE UPDATE, DELETE ON audit_log FROM jobtrack_app;

-- Row-Level Security (A01). jobtrack_app her zaman RLS altındadır; yalnızca BYPASSRLS taşıyan
-- jobtrack_owner (migration ve aşağıdaki SECURITY DEFINER fonksiyonlar) dışında kalır.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
CREATE POLICY users_self ON users
  USING (id = app_current_user_id())
  WITH CHECK (id = app_current_user_id());

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions FORCE ROW LEVEL SECURITY;
CREATE POLICY sessions_owner ON sessions
  USING (user_id = app_current_user_id())
  WITH CHECK (user_id = app_current_user_id());

ALTER TABLE mfa_recovery_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE mfa_recovery_codes FORCE ROW LEVEL SECURITY;
CREATE POLICY mfa_recovery_codes_owner ON mfa_recovery_codes
  USING (user_id = app_current_user_id())
  WITH CHECK (user_id = app_current_user_id());

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_log_owner ON audit_log
  USING (user_id = app_current_user_id())
  WITH CHECK (user_id = app_current_user_id());

-- Giriş öncesi, dar kapsamlı aramalar (ADR-0002). Yalnızca gereken sütunları döndürür.
CREATE FUNCTION auth_find_user_by_email(p_email text)
  RETURNS TABLE (id uuid, password_hash text, totp_enabled boolean)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT u.id, u.password_hash, u.totp_enabled_at IS NOT NULL
    FROM users u
    WHERE u.email = p_email
  $$;
GRANT EXECUTE ON FUNCTION auth_find_user_by_email(text) TO jobtrack_app;

CREATE FUNCTION auth_find_session(p_token_hash bytea)
  RETURNS TABLE (id uuid, user_id uuid, mfa_pending boolean, last_seen_at timestamptz, expires_at timestamptz)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT s.id, s.user_id, s.mfa_pending, s.last_seen_at, s.expires_at
    FROM sessions s
    WHERE s.token_hash = p_token_hash
  $$;
GRANT EXECUTE ON FUNCTION auth_find_session(bytea) TO jobtrack_app;
