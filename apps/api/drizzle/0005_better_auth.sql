-- Better Auth cutover: replace custom auth/OAuth/API-key tables with BA-native schema.
-- Destructive: invalidates sessions, OAuth clients/tokens, API keys; forces password reset.

-- 1) Extend users for Better Auth core + admin/username plugins
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "name" text NOT NULL DEFAULT '';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_verified" boolean NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "image" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "created_at" timestamptz NOT NULL DEFAULT now();
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "updated_at" timestamptz NOT NULL DEFAULT now();
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "display_username" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "role" text NOT NULL DEFAULT 'user';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "banned" boolean DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "ban_reason" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "ban_expires" timestamptz;

UPDATE "users"
SET
  "name" = COALESCE(NULLIF("name", ''), "username"),
  "display_username" = COALESCE("display_username", "username"),
  "email_verified" = COALESCE("is_active", false),
  "created_at" = COALESCE("created_at", "date_joined", now()),
  "updated_at" = now(),
  "role" = CASE WHEN "is_superuser" THEN 'admin' ELSE 'user' END,
  "password_reset_required" = true,
  "searchapi_api_key_encrypted" = NULL;

-- 2) Drop legacy auth / API key / OAuth tables
DROP TABLE IF EXISTS "oauth_device_grants" CASCADE;
DROP TABLE IF EXISTS "oauth_id_tokens" CASCADE;
DROP TABLE IF EXISTS "oauth_refresh_tokens" CASCADE;
DROP TABLE IF EXISTS "oauth_access_tokens" CASCADE;
DROP TABLE IF EXISTS "oauth_grants" CASCADE;
DROP TABLE IF EXISTS "oauth_applications" CASCADE;
DROP TABLE IF EXISTS "auth_action_tokens" CASCADE;
DROP TABLE IF EXISTS "auth_sessions" CASCADE;
DROP TABLE IF EXISTS "api_keys" CASCADE;

-- 3) Drop users.password (credentials live in Better Auth account)
ALTER TABLE "users" DROP COLUMN IF EXISTS "password";

-- 4) Better Auth tables
CREATE TABLE IF NOT EXISTS "session" (
  "id" text PRIMARY KEY,
  "expires_at" timestamptz NOT NULL,
  "token" text NOT NULL UNIQUE,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "ip_address" text,
  "user_agent" text,
  "user_id" bigint NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "impersonated_by" text
);
CREATE INDEX IF NOT EXISTS "session_user_id_idx" ON "session" ("user_id");

CREATE TABLE IF NOT EXISTS "account" (
  "id" text PRIMARY KEY,
  "account_id" text NOT NULL,
  "provider_id" text NOT NULL,
  "user_id" bigint NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "access_token" text,
  "refresh_token" text,
  "id_token" text,
  "access_token_expires_at" timestamptz,
  "refresh_token_expires_at" timestamptz,
  "scope" text,
  "password" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "account_user_id_idx" ON "account" ("user_id");

CREATE TABLE IF NOT EXISTS "verification" (
  "id" text PRIMARY KEY,
  "identifier" text NOT NULL,
  "value" text NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "apikey" (
  "id" text PRIMARY KEY,
  "config_id" text NOT NULL DEFAULT 'default',
  "name" text,
  "start" text,
  "reference_id" text NOT NULL,
  "prefix" text,
  "key" text NOT NULL,
  "refill_interval" integer,
  "refill_amount" integer,
  "last_refill_at" timestamptz,
  "enabled" boolean NOT NULL DEFAULT true,
  "rate_limit_enabled" boolean,
  "rate_limit_time_window" integer,
  "rate_limit_max" integer,
  "request_count" integer,
  "remaining" integer,
  "last_request" timestamptz,
  "expires_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "permissions" text,
  "metadata" text
);
CREATE INDEX IF NOT EXISTS "apikey_reference_id_idx" ON "apikey" ("reference_id");
CREATE INDEX IF NOT EXISTS "apikey_key_idx" ON "apikey" ("key");

CREATE TABLE IF NOT EXISTS "jwks" (
  "id" text PRIMARY KEY,
  "public_key" text NOT NULL,
  "private_key" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "expires_at" timestamptz
);

CREATE TABLE IF NOT EXISTS "device_code" (
  "id" text PRIMARY KEY,
  "device_code" text NOT NULL,
  "user_code" text NOT NULL,
  "user_id" bigint,
  "expires_at" timestamptz NOT NULL,
  "status" text NOT NULL,
  "last_polled_at" timestamptz,
  "polling_interval" integer,
  "client_id" text,
  "scope" text
);
CREATE UNIQUE INDEX IF NOT EXISTS "device_code_device_code_uidx" ON "device_code" ("device_code");
CREATE INDEX IF NOT EXISTS "device_code_user_code_idx" ON "device_code" ("user_code");

CREATE TABLE IF NOT EXISTS "oauth_client" (
  "id" text PRIMARY KEY,
  "client_id" text NOT NULL UNIQUE,
  "client_secret" text,
  "disabled" boolean DEFAULT false,
  "skip_consent" boolean,
  "enable_end_session" boolean,
  "subject_type" text,
  "scopes" text[],
  "user_id" bigint REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamptz DEFAULT now(),
  "updated_at" timestamptz DEFAULT now(),
  "name" text,
  "uri" text,
  "icon" text,
  "contacts" text[],
  "tos" text,
  "policy" text,
  "software_id" text,
  "software_version" text,
  "software_statement" text,
  "redirect_uris" text[] NOT NULL,
  "post_logout_redirect_uris" text[],
  "token_endpoint_auth_method" text,
  "grant_types" text[],
  "response_types" text[],
  "public" boolean,
  "type" text,
  "require_pkce" boolean,
  "reference_id" text,
  "metadata" jsonb
);
CREATE INDEX IF NOT EXISTS "oauth_client_user_id_idx" ON "oauth_client" ("user_id");

CREATE TABLE IF NOT EXISTS "oauth_refresh_token" (
  "id" text PRIMARY KEY,
  "token" text NOT NULL,
  "client_id" text NOT NULL REFERENCES "oauth_client"("client_id") ON DELETE CASCADE,
  "session_id" text,
  "user_id" bigint NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "reference_id" text,
  "expires_at" timestamptz,
  "created_at" timestamptz DEFAULT now(),
  "revoked" timestamptz,
  "auth_time" timestamptz,
  "scopes" text[] NOT NULL
);
CREATE INDEX IF NOT EXISTS "oauth_refresh_token_user_id_idx" ON "oauth_refresh_token" ("user_id");

CREATE TABLE IF NOT EXISTS "oauth_access_token" (
  "id" text PRIMARY KEY,
  "token" text,
  "client_id" text NOT NULL REFERENCES "oauth_client"("client_id") ON DELETE CASCADE,
  "session_id" text,
  "user_id" bigint REFERENCES "users"("id") ON DELETE CASCADE,
  "reference_id" text,
  "refresh_id" text,
  "expires_at" timestamptz,
  "created_at" timestamptz DEFAULT now(),
  "scopes" text[] NOT NULL
);
CREATE INDEX IF NOT EXISTS "oauth_access_token_user_id_idx" ON "oauth_access_token" ("user_id");

CREATE TABLE IF NOT EXISTS "oauth_consent" (
  "id" text PRIMARY KEY,
  "client_id" text NOT NULL REFERENCES "oauth_client"("client_id") ON DELETE CASCADE,
  "user_id" bigint REFERENCES "users"("id") ON DELETE CASCADE,
  "reference_id" text,
  "scopes" text[] NOT NULL,
  "created_at" timestamptz DEFAULT now(),
  "updated_at" timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "oauth_consent_user_id_idx" ON "oauth_consent" ("user_id");

-- 5) Credential accounts without passwords (users must reset via Better Auth)
INSERT INTO "account" ("id", "account_id", "provider_id", "user_id", "password", "created_at", "updated_at")
SELECT
  gen_random_uuid()::text,
  u.id::text,
  'credential',
  u.id,
  NULL,
  now(),
  now()
FROM "users" u
WHERE NOT EXISTS (
  SELECT 1 FROM "account" a
  WHERE a.user_id = u.id AND a.provider_id = 'credential'
);
