-- Native Hono/Workers authentication cutover.
-- This intentionally invalidates all browser sessions, OAuth clients/tokens,
-- pending email links, and encrypted per-user SearchAPI credentials.
ALTER TABLE "users"
	ADD COLUMN IF NOT EXISTS "password_reset_required" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
UPDATE "users"
SET
	"password_reset_required" = true,
	"searchapi_api_key_encrypted" = NULL;
--> statement-breakpoint
ALTER TABLE "users"
	ALTER COLUMN "searchapi_api_key_encrypted" TYPE text
	USING NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auth_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" bigint NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
	"family_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL UNIQUE,
	"created_at" timestamp with time zone NOT NULL DEFAULT now(),
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"replaced_by" uuid
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_sessions_user_id_idx" ON "auth_sessions" ("user_id");
CREATE INDEX IF NOT EXISTS "auth_sessions_family_id_idx" ON "auth_sessions" ("family_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auth_action_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" bigint NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
	"purpose" varchar(32) NOT NULL,
	"token_hash" varchar(64) NOT NULL UNIQUE,
	"payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone NOT NULL DEFAULT now(),
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_action_tokens_user_purpose_idx"
	ON "auth_action_tokens" ("user_id", "purpose");
--> statement-breakpoint
TRUNCATE TABLE
	"oauth_device_grants",
	"oauth_refresh_tokens",
	"oauth_access_tokens",
	"oauth_id_tokens",
	"oauth_grants",
	"oauth_applications"
RESTART IDENTITY CASCADE;
