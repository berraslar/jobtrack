-- Veritabanı rolleri (ADR-0002). Yalnızca ilk kurulumda, süper kullanıcıyla bir kez çalışır.
-- psql değişkenleri: dbname, app_password, migrator_password
\set ON_ERROR_STOP on

-- Tabloların sahibi. Oturum açamaz. SECURITY DEFINER fonksiyonları bu rolle çalışır;
-- giriş öncesi dar kapsamlı aramalar için RLS'i atlayabilmesi gerekir.
CREATE ROLE jobtrack_owner NOLOGIN BYPASSRLS;

-- Migration çalıştırır; oturum açınca otomatik olarak jobtrack_owner rolüne geçer.
CREATE ROLE jobtrack_migrator LOGIN PASSWORD :'migrator_password' IN ROLE jobtrack_owner;
ALTER ROLE jobtrack_migrator SET role = 'jobtrack_owner';

-- Uygulamanın rolü: tablo sahibi değil, RLS'i atlayamaz, DDL yapamaz.
CREATE ROLE jobtrack_app LOGIN PASSWORD :'app_password' NOBYPASSRLS;

REVOKE ALL ON DATABASE :"dbname" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"dbname" TO jobtrack_app, jobtrack_migrator;
GRANT CREATE ON DATABASE :"dbname" TO jobtrack_owner;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO jobtrack_owner;
GRANT USAGE ON SCHEMA public TO jobtrack_app;

-- Sahibin oluşturacağı yeni tablolarda uygulamaya yalnızca DML yetkisi verilir.
ALTER DEFAULT PRIVILEGES FOR ROLE jobtrack_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO jobtrack_app;
-- Fonksiyonlar varsayılan olarak herkese açık olmasın; her biri açıkça yetkilendirilir.
ALTER DEFAULT PRIVILEGES FOR ROLE jobtrack_owner
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
