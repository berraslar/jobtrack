-- FR-18/FR-19 (ADR-0007): e-posta doğrulama kodu ve güvenilen cihazlar.

-- Kayıtta doğrulanır; doğrulanmamış hesap tam oturum alamaz.
ALTER TABLE users ADD COLUMN email_verified_at timestamptz;

-- Tek kullanımlık 6 haneli kodlar. Kodun kendisi saklanmaz, anahtarlı özeti (HMAC-SHA256) saklanır.
-- 2 dakika geçerlidir; kod başına deneme sayılır.
CREATE TABLE email_codes (
  id           uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id      uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  purpose      text NOT NULL CHECK (purpose IN ('login', 'account_delete')),
  code_hash    bytea NOT NULL CHECK (octet_length(code_hash) = 32),
  attempts     integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  consumed_at  timestamptz,
  CHECK (expires_at > created_at)
);
CREATE INDEX email_codes_user_purpose_idx ON email_codes (user_id, purpose, created_at DESC);

-- E-posta koduyla doğrulanmış cihaz: 30 gün boyunca girişte yeniden kod istenmez.
CREATE TABLE trusted_devices (
  id          uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash  bytea NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
  user_agent  text CHECK (length(user_agent) <= 512),
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL
);
CREATE INDEX trusted_devices_user_idx ON trusted_devices (user_id);

ALTER TABLE email_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_codes FORCE ROW LEVEL SECURITY;
CREATE POLICY email_codes_owner ON email_codes
  USING (user_id = app_current_user_id()) WITH CHECK (user_id = app_current_user_id());

ALTER TABLE trusted_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE trusted_devices FORCE ROW LEVEL SECURITY;
CREATE POLICY trusted_devices_owner ON trusted_devices
  USING (user_id = app_current_user_id()) WITH CHECK (user_id = app_current_user_id());

-- Yeni denetim olayları.
ALTER TABLE audit_log DROP CONSTRAINT audit_log_event_check;
ALTER TABLE audit_log ADD CONSTRAINT audit_log_event_check CHECK (event IN (
  'register', 'login_success', 'login_failed', 'mfa_enabled', 'mfa_recovery_used',
  'logout_all', 'password_reset', 'data_export', 'account_deleted',
  'email_verified', 'email_code_failed'));
