-- Migrate users.id (bigint identity) → Better Auth default text UUID.
-- Remaps every existing user to a new UUID and rewrites all user_id FKs.
-- Invalidates sessions and OAuth tokens (JWT `sub` would otherwise keep old ids).

CREATE TABLE "_user_id_remap" (
  "old_id" bigint PRIMARY KEY,
  "new_id" text NOT NULL UNIQUE
);

INSERT INTO "_user_id_remap" ("old_id", "new_id")
SELECT "id", gen_random_uuid()::text FROM "users";

-- Drop FKs that reference users(id)
ALTER TABLE "account_deletion_requests" DROP CONSTRAINT IF EXISTS "account_deletion_requests_user_id_fkey";
ALTER TABLE "videos" DROP CONSTRAINT IF EXISTS "videos_user_id_fkey";
ALTER TABLE "video_groups" DROP CONSTRAINT IF EXISTS "video_groups_user_id_fkey";
ALTER TABLE "tags" DROP CONSTRAINT IF EXISTS "tags_user_id_fkey";
ALTER TABLE "chat_logs" DROP CONSTRAINT IF EXISTS "chat_logs_user_id_fkey";
ALTER TABLE "group_evaluation_snapshots" DROP CONSTRAINT IF EXISTS "group_evaluation_snapshots_user_id_fkey";
ALTER TABLE "learner_concept_states" DROP CONSTRAINT IF EXISTS "learner_concept_states_user_id_fkey";
ALTER TABLE "session" DROP CONSTRAINT IF EXISTS "session_user_id_fkey";
ALTER TABLE "account" DROP CONSTRAINT IF EXISTS "account_user_id_fkey";
ALTER TABLE "oauth_client" DROP CONSTRAINT IF EXISTS "oauth_client_user_id_fkey";
ALTER TABLE "oauth_refresh_token" DROP CONSTRAINT IF EXISTS "oauth_refresh_token_user_id_fkey";
ALTER TABLE "oauth_access_token" DROP CONSTRAINT IF EXISTS "oauth_access_token_user_id_fkey";
ALTER TABLE "oauth_consent" DROP CONSTRAINT IF EXISTS "oauth_consent_user_id_fkey";

-- Helper: rewrite a bigint user_id column to text UUID via remap
-- (applied per table below)

ALTER TABLE "account_deletion_requests" ADD COLUMN "user_id_new" text;
UPDATE "account_deletion_requests" t
SET "user_id_new" = r."new_id"
FROM "_user_id_remap" r WHERE t."user_id" = r."old_id";
ALTER TABLE "account_deletion_requests" DROP COLUMN "user_id";
ALTER TABLE "account_deletion_requests" RENAME COLUMN "user_id_new" TO "user_id";
ALTER TABLE "account_deletion_requests" ALTER COLUMN "user_id" SET NOT NULL;

ALTER TABLE "videos" ADD COLUMN "user_id_new" text;
UPDATE "videos" t
SET "user_id_new" = r."new_id"
FROM "_user_id_remap" r WHERE t."user_id" = r."old_id";
ALTER TABLE "videos" DROP COLUMN "user_id";
ALTER TABLE "videos" RENAME COLUMN "user_id_new" TO "user_id";
ALTER TABLE "videos" ALTER COLUMN "user_id" SET NOT NULL;

ALTER TABLE "video_groups" ADD COLUMN "user_id_new" text;
UPDATE "video_groups" t
SET "user_id_new" = r."new_id"
FROM "_user_id_remap" r WHERE t."user_id" = r."old_id";
ALTER TABLE "video_groups" DROP COLUMN "user_id";
ALTER TABLE "video_groups" RENAME COLUMN "user_id_new" TO "user_id";
ALTER TABLE "video_groups" ALTER COLUMN "user_id" SET NOT NULL;

ALTER TABLE "tags" ADD COLUMN "user_id_new" text;
UPDATE "tags" t
SET "user_id_new" = r."new_id"
FROM "_user_id_remap" r WHERE t."user_id" = r."old_id";
ALTER TABLE "tags" DROP COLUMN "user_id";
ALTER TABLE "tags" RENAME COLUMN "user_id_new" TO "user_id";
ALTER TABLE "tags" ALTER COLUMN "user_id" SET NOT NULL;

ALTER TABLE "chat_logs" ADD COLUMN "user_id_new" text;
UPDATE "chat_logs" t
SET "user_id_new" = r."new_id"
FROM "_user_id_remap" r WHERE t."user_id" = r."old_id";
ALTER TABLE "chat_logs" DROP COLUMN "user_id";
ALTER TABLE "chat_logs" RENAME COLUMN "user_id_new" TO "user_id";
ALTER TABLE "chat_logs" ALTER COLUMN "user_id" SET NOT NULL;

ALTER TABLE "group_evaluation_snapshots" ADD COLUMN "user_id_new" text;
UPDATE "group_evaluation_snapshots" t
SET "user_id_new" = r."new_id"
FROM "_user_id_remap" r WHERE t."user_id" = r."old_id";
ALTER TABLE "group_evaluation_snapshots" DROP COLUMN "user_id";
ALTER TABLE "group_evaluation_snapshots" RENAME COLUMN "user_id_new" TO "user_id";
ALTER TABLE "group_evaluation_snapshots" ALTER COLUMN "user_id" SET NOT NULL;

ALTER TABLE "learner_concept_states" ADD COLUMN "user_id_new" text;
UPDATE "learner_concept_states" t
SET "user_id_new" = r."new_id"
FROM "_user_id_remap" r WHERE t."user_id" = r."old_id";
ALTER TABLE "learner_concept_states" DROP COLUMN "user_id";
ALTER TABLE "learner_concept_states" RENAME COLUMN "user_id_new" TO "user_id";
ALTER TABLE "learner_concept_states" ALTER COLUMN "user_id" SET NOT NULL;

ALTER TABLE "scene_embeddings" ADD COLUMN "user_id_new" text;
UPDATE "scene_embeddings" t
SET "user_id_new" = r."new_id"
FROM "_user_id_remap" r WHERE t."user_id" = r."old_id";
ALTER TABLE "scene_embeddings" DROP COLUMN "user_id";
ALTER TABLE "scene_embeddings" RENAME COLUMN "user_id_new" TO "user_id";
ALTER TABLE "scene_embeddings" ALTER COLUMN "user_id" SET NOT NULL;

-- Better Auth tables: drop auth material that embeds old subject ids, then remap the rest
DELETE FROM "session";
DELETE FROM "oauth_access_token";
DELETE FROM "oauth_refresh_token";
DELETE FROM "oauth_consent";
DELETE FROM "device_code";

ALTER TABLE "account" ADD COLUMN "user_id_new" text;
UPDATE "account" t
SET "user_id_new" = r."new_id"
FROM "_user_id_remap" r WHERE t."user_id" = r."old_id";
ALTER TABLE "account" DROP COLUMN "user_id";
ALTER TABLE "account" RENAME COLUMN "user_id_new" TO "user_id";
ALTER TABLE "account" ALTER COLUMN "user_id" SET NOT NULL;

ALTER TABLE "session" ADD COLUMN "user_id_new" text;
-- table empty after DELETE; still convert column type
ALTER TABLE "session" DROP COLUMN "user_id";
ALTER TABLE "session" RENAME COLUMN "user_id_new" TO "user_id";
ALTER TABLE "session" ALTER COLUMN "user_id" SET NOT NULL;

ALTER TABLE "device_code" ADD COLUMN "user_id_new" text;
ALTER TABLE "device_code" DROP COLUMN "user_id";
ALTER TABLE "device_code" RENAME COLUMN "user_id_new" TO "user_id";

ALTER TABLE "oauth_client" ADD COLUMN "user_id_new" text;
UPDATE "oauth_client" t
SET "user_id_new" = r."new_id"
FROM "_user_id_remap" r WHERE t."user_id" = r."old_id";
ALTER TABLE "oauth_client" DROP COLUMN "user_id";
ALTER TABLE "oauth_client" RENAME COLUMN "user_id_new" TO "user_id";

ALTER TABLE "oauth_refresh_token" ADD COLUMN "user_id_new" text;
ALTER TABLE "oauth_refresh_token" DROP COLUMN "user_id";
ALTER TABLE "oauth_refresh_token" RENAME COLUMN "user_id_new" TO "user_id";
ALTER TABLE "oauth_refresh_token" ALTER COLUMN "user_id" SET NOT NULL;

ALTER TABLE "oauth_access_token" ADD COLUMN "user_id_new" text;
ALTER TABLE "oauth_access_token" DROP COLUMN "user_id";
ALTER TABLE "oauth_access_token" RENAME COLUMN "user_id_new" TO "user_id";

ALTER TABLE "oauth_consent" ADD COLUMN "user_id_new" text;
ALTER TABLE "oauth_consent" DROP COLUMN "user_id";
ALTER TABLE "oauth_consent" RENAME COLUMN "user_id_new" TO "user_id";

-- API keys reference users as text already; rewrite values
UPDATE "apikey" a
SET "reference_id" = r."new_id"
FROM "_user_id_remap" r
WHERE a."reference_id" = r."old_id"::text;

-- Swap users.id to UUID text PK
ALTER TABLE "users" ADD COLUMN "id_new" text;
UPDATE "users" u
SET "id_new" = r."new_id"
FROM "_user_id_remap" r WHERE u."id" = r."old_id";
ALTER TABLE "users" DROP CONSTRAINT "users_pkey";
ALTER TABLE "users" DROP COLUMN "id";
ALTER TABLE "users" RENAME COLUMN "id_new" TO "id";
ALTER TABLE "users" ALTER COLUMN "id" SET NOT NULL;
ALTER TABLE "users" ADD PRIMARY KEY ("id");
DROP SEQUENCE IF EXISTS "users_id_seq";

-- Recreate FKs
ALTER TABLE "account_deletion_requests"
  ADD CONSTRAINT "account_deletion_requests_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;

ALTER TABLE "videos"
  ADD CONSTRAINT "videos_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id");

ALTER TABLE "video_groups"
  ADD CONSTRAINT "video_groups_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id");

ALTER TABLE "tags"
  ADD CONSTRAINT "tags_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id");

ALTER TABLE "chat_logs"
  ADD CONSTRAINT "chat_logs_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id");

ALTER TABLE "group_evaluation_snapshots"
  ADD CONSTRAINT "group_evaluation_snapshots_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id");

ALTER TABLE "learner_concept_states"
  ADD CONSTRAINT "learner_concept_states_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;

ALTER TABLE "session"
  ADD CONSTRAINT "session_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;

ALTER TABLE "account"
  ADD CONSTRAINT "account_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;

ALTER TABLE "oauth_client"
  ADD CONSTRAINT "oauth_client_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL;

ALTER TABLE "oauth_refresh_token"
  ADD CONSTRAINT "oauth_refresh_token_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;

ALTER TABLE "oauth_access_token"
  ADD CONSTRAINT "oauth_access_token_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;

ALTER TABLE "oauth_consent"
  ADD CONSTRAINT "oauth_consent_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;

DROP TABLE "_user_id_remap";
