-- FR-01/FR-18 (ADR-0007): önce e-posta doğrulaması, sonra hesap. Kayıt isteği hesap açmaz; burada
-- bekler ve kod doğrulanınca hesaba dönüşür. Kayıtlı bir e-postayla gelen istek de aynı yanıtı alır
-- (A07: kayıt ucu hesabın varlığını belli etmez); o satırda parola özeti yoktur (`password_hash` NULL)
-- ve kod hiç gönderilmez, hesap sahibine yalnızca bilgilendirme e-postası gider.

CREATE TABLE pending_registrations (
  id                 uuid PRIMARY KEY DEFAULT uuidv7(),
  -- Kayıt çerezindeki rastgele token'ın SHA-256 özeti; token'ın kendisi saklanmaz.
  token_hash         bytea NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
  email              text NOT NULL CHECK (email = lower(email) AND length(email) BETWEEN 3 AND 254),
  password_hash      text,
  locale             text NOT NULL DEFAULT 'tr' CHECK (locale IN ('tr', 'en')),
  -- Kodun kendisi değil, anahtarlı özeti (HMAC-SHA256). Kod 2 dakika geçerli, kod başına deneme sayılır.
  code_hash          bytea NOT NULL CHECK (octet_length(code_hash) = 32),
  code_created_at    timestamptz NOT NULL,
  code_expires_at    timestamptz NOT NULL,
  attempts           integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  -- Bu satır için gönderilen e-posta sayısı (adres başına saatlik üst sınır için).
  emails_sent        integer NOT NULL DEFAULT 1 CHECK (emails_sent >= 1),
  created_at         timestamptz NOT NULL DEFAULT now(),
  expires_at         timestamptz NOT NULL,
  CHECK (code_expires_at > code_created_at),
  CHECK (expires_at > created_at)
);
CREATE INDEX pending_registrations_email_idx ON pending_registrations (email, created_at DESC);
CREATE INDEX pending_registrations_expires_idx ON pending_registrations (expires_at);

-- Bu bağlantının sahip olduğu kayıt (çerezdeki token'ın özeti). Ayar yoksa NULL; hiçbir satırla
-- eşleşmez (fail closed). Ayar transaction'a özeldir (SET LOCAL), havuzdaki bağlantıya sızmaz.
CREATE FUNCTION app_current_registration() RETURNS bytea
  LANGUAGE sql STABLE
  AS $$ SELECT decode(nullif(current_setting('app.registration_token', true), ''), 'hex') $$;
GRANT EXECUTE ON FUNCTION app_current_registration() TO jobtrack_app;

-- A01: uygulama yalnızca çerezini taşıdığı kaydı görür ve değiştirir.
ALTER TABLE pending_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_registrations FORCE ROW LEVEL SECURITY;
CREATE POLICY pending_registrations_owner ON pending_registrations
  USING (token_hash = app_current_registration())
  WITH CHECK (token_hash = app_current_registration());

-- Adres başına son dönemde gönderilen e-posta sayısı (e-posta bombardımanını sınırlar). Satırları
-- değil yalnızca toplamı döndürür.
CREATE FUNCTION registration_emails_sent_since(p_email text, p_since timestamptz)
  RETURNS integer
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT coalesce(sum(r.emails_sent), 0)::integer
    FROM pending_registrations r
    WHERE r.email = p_email AND r.created_at > p_since
  $$;
GRANT EXECUTE ON FUNCTION registration_emails_sent_since(text, timestamptz) TO jobtrack_app;

-- Süresi dolmuş bekleyen kayıtları siler (veri minimizasyonu, KVKK).
CREATE FUNCTION registration_purge_expired(p_now timestamptz)
  RETURNS void
  LANGUAGE sql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$ DELETE FROM pending_registrations WHERE expires_at <= p_now $$;
GRANT EXECUTE ON FUNCTION registration_purge_expired(timestamptz) TO jobtrack_app;
