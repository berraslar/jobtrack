-- FR-20/FR-21 (ADR-0008): kullanıcı profili. Kullanıcı başına tek satır; CV'den gelen öneri
-- yalnızca kullanıcı onaylayıp kaydedince buraya yazılır.
--
-- Liste alanları (yetenek, dil, deneyim, eğitim) her zaman bütün olarak okunup yazılır; ayrı
-- tablolar yerine jsonb tutulur. İçerik API'de Zod ile doğrulanır; burada tür ve boyut sınırlanır.
CREATE TABLE profiles (
  user_id     uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  full_name   text CHECK (length(full_name) <= 120),
  headline    text CHECK (length(headline) <= 160),
  email       text CHECK (length(email) <= 254),
  phone       text CHECK (length(phone) <= 40),
  location    text CHECK (length(location) <= 120),
  website     text CHECK (length(website) <= 2048),
  linkedin    text CHECK (length(linkedin) <= 2048),
  github      text CHECK (length(github) <= 2048),
  summary     text CHECK (length(summary) <= 4000),
  skills      jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(skills) = 'array' AND jsonb_array_length(skills) <= 100),
  languages   jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(languages) = 'array' AND jsonb_array_length(languages) <= 20),
  experience  jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(experience) = 'array' AND jsonb_array_length(experience) <= 30),
  education   jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(education) = 'array' AND jsonb_array_length(education) <= 15),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles FORCE ROW LEVEL SECURITY;
CREATE POLICY profiles_owner ON profiles
  USING (user_id = app_current_user_id()) WITH CHECK (user_id = app_current_user_id());
