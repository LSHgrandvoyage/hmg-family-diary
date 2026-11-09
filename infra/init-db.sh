#!/bin/sh
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set=app_password="$APP_DB_PASSWORD" --set=auth_password="$AUTH_DB_PASSWORD" --set=migration_password="$MIGRATION_DB_PASSWORD" <<'SQL'
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
CREATE ROLE diary_migrate LOGIN PASSWORD :'migration_password';
CREATE ROLE diary_auth LOGIN PASSWORD :'auth_password';
CREATE ROLE diary_app LOGIN PASSWORD :'app_password';
CREATE SCHEMA auth AUTHORIZATION diary_migrate;
CREATE SCHEMA diary AUTHORIZATION diary_migrate;
GRANT USAGE ON SCHEMA auth TO diary_auth;
GRANT USAGE ON SCHEMA diary TO diary_app;
ALTER ROLE diary_auth SET search_path = auth, pg_catalog;
ALTER ROLE diary_migrate SET search_path = auth, diary, pg_catalog;
ALTER ROLE diary_app SET search_path = diary, pg_catalog;
ALTER DEFAULT PRIVILEGES FOR ROLE diary_migrate IN SCHEMA auth GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO diary_auth;
ALTER DEFAULT PRIVILEGES FOR ROLE diary_migrate IN SCHEMA auth GRANT USAGE, SELECT ON SEQUENCES TO diary_auth;
SQL
