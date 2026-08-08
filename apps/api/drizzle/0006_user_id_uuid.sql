-- Generated via: drizzle-kit generate --name user_id_uuid
-- Snapshot (schema end-state): drizzle/meta/0006_snapshot.json
--
-- drizzle-kit DDL preview (replaced with UUID remap custom SQL below):
--   ALTER TABLE "account" ALTER COLUMN "user_id" SET DATA TYPE text;
--   ALTER TABLE "account_deletion_requests" ALTER COLUMN "user_id" SET DATA TYPE text;
--   ALTER TABLE "chat_logs" ALTER COLUMN "user_id" SET DATA TYPE text;
--   ALTER TABLE "device_code" ALTER COLUMN "user_id" SET DATA TYPE text;
--   ALTER TABLE "group_evaluation_snapshots" ALTER COLUMN "user_id" SET DATA TYPE text;
--   ALTER TABLE "learner_concept_states" ALTER COLUMN "user_id" SET DATA TYPE text;
--   ALTER TABLE "oauth_access_token" ALTER COLUMN "user_id" SET DATA TYPE text;
--   ALTER TABLE "oauth_client" ALTER COLUMN "user_id" SET DATA TYPE text;
--   ALTER TABLE "oauth_consent" ALTER COLUMN "user_id" SET DATA TYPE text;
--   ALTER TABLE "oauth_refresh_token" ALTER COLUMN "user_id" SET DATA TYPE text;
--   ALTER TABLE "scene_embeddings" ALTER COLUMN "user_id" SET DATA TYPE text;
--   ALTER TABLE "session" ALTER COLUMN "user_id" SET DATA TYPE text;
--   ALTER TABLE "tags" ALTER COLUMN "user_id" SET DATA TYPE text;
--   ALTER TABLE "users" ALTER COLUMN "id" SET DATA TYPE text;
--   ALTER TABLE "users" ALTER COLUMN "id" DROP IDENTITY;
--   ALTER TABLE "video_groups" ALTER COLUMN "user_id" SET DATA TYPE text;
--   ALTER TABLE "videos" ALTER COLUMN "user_id" SET DATA TYPE text;
--
-- Custom SQL: remap existing bigint ids to new UUIDs (not USING id::text),
-- and invalidate sessions / OAuth tokens whose JWT sub would keep old ids.
-- Regenerate with: npx tsx scripts/generate-user-id-uuid-migration.mjs

CREATE TABLE "_user_id_remap" (
	"old_id" bigint PRIMARY KEY,
	"new_id" text NOT NULL UNIQUE
);
--> statement-breakpoint
INSERT INTO "_user_id_remap" ("old_id", "new_id")
SELECT "id", gen_random_uuid()::text FROM "users";
--> statement-breakpoint
ALTER TABLE "account_deletion_requests" DROP CONSTRAINT IF EXISTS "account_deletion_requests_user_id_fkey";
--> statement-breakpoint
ALTER TABLE "videos" DROP CONSTRAINT IF EXISTS "videos_user_id_fkey";
--> statement-breakpoint
ALTER TABLE "video_groups" DROP CONSTRAINT IF EXISTS "video_groups_user_id_fkey";
--> statement-breakpoint
ALTER TABLE "tags" DROP CONSTRAINT IF EXISTS "tags_user_id_fkey";
--> statement-breakpoint
ALTER TABLE "chat_logs" DROP CONSTRAINT IF EXISTS "chat_logs_user_id_fkey";
--> statement-breakpoint
ALTER TABLE "group_evaluation_snapshots" DROP CONSTRAINT IF EXISTS "group_evaluation_snapshots_user_id_fkey";
--> statement-breakpoint
ALTER TABLE "learner_concept_states" DROP CONSTRAINT IF EXISTS "learner_concept_states_user_id_fkey";
--> statement-breakpoint
ALTER TABLE "session" DROP CONSTRAINT IF EXISTS "session_user_id_fkey";
--> statement-breakpoint
ALTER TABLE "account" DROP CONSTRAINT IF EXISTS "account_user_id_fkey";
--> statement-breakpoint
ALTER TABLE "oauth_client" DROP CONSTRAINT IF EXISTS "oauth_client_user_id_fkey";
--> statement-breakpoint
ALTER TABLE "oauth_refresh_token" DROP CONSTRAINT IF EXISTS "oauth_refresh_token_user_id_fkey";
--> statement-breakpoint
ALTER TABLE "oauth_access_token" DROP CONSTRAINT IF EXISTS "oauth_access_token_user_id_fkey";
--> statement-breakpoint
ALTER TABLE "oauth_consent" DROP CONSTRAINT IF EXISTS "oauth_consent_user_id_fkey";
--> statement-breakpoint
ALTER TABLE "account_deletion_requests" ADD COLUMN "user_id_new" text;--> statement-breakpoint
UPDATE "account_deletion_requests" t SET "user_id_new" = r."new_id" FROM "_user_id_remap" r WHERE t."user_id" = r."old_id";--> statement-breakpoint
ALTER TABLE "account_deletion_requests" DROP COLUMN "user_id";--> statement-breakpoint
ALTER TABLE "account_deletion_requests" RENAME COLUMN "user_id_new" TO "user_id";--> statement-breakpoint
ALTER TABLE "account_deletion_requests" ALTER COLUMN "user_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "user_id_new" text;--> statement-breakpoint
UPDATE "videos" t SET "user_id_new" = r."new_id" FROM "_user_id_remap" r WHERE t."user_id" = r."old_id";--> statement-breakpoint
ALTER TABLE "videos" DROP COLUMN "user_id";--> statement-breakpoint
ALTER TABLE "videos" RENAME COLUMN "user_id_new" TO "user_id";--> statement-breakpoint
ALTER TABLE "videos" ALTER COLUMN "user_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "video_groups" ADD COLUMN "user_id_new" text;--> statement-breakpoint
UPDATE "video_groups" t SET "user_id_new" = r."new_id" FROM "_user_id_remap" r WHERE t."user_id" = r."old_id";--> statement-breakpoint
ALTER TABLE "video_groups" DROP COLUMN "user_id";--> statement-breakpoint
ALTER TABLE "video_groups" RENAME COLUMN "user_id_new" TO "user_id";--> statement-breakpoint
ALTER TABLE "video_groups" ALTER COLUMN "user_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "tags" ADD COLUMN "user_id_new" text;--> statement-breakpoint
UPDATE "tags" t SET "user_id_new" = r."new_id" FROM "_user_id_remap" r WHERE t."user_id" = r."old_id";--> statement-breakpoint
ALTER TABLE "tags" DROP COLUMN "user_id";--> statement-breakpoint
ALTER TABLE "tags" RENAME COLUMN "user_id_new" TO "user_id";--> statement-breakpoint
ALTER TABLE "tags" ALTER COLUMN "user_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "chat_logs" ADD COLUMN "user_id_new" text;--> statement-breakpoint
UPDATE "chat_logs" t SET "user_id_new" = r."new_id" FROM "_user_id_remap" r WHERE t."user_id" = r."old_id";--> statement-breakpoint
ALTER TABLE "chat_logs" DROP COLUMN "user_id";--> statement-breakpoint
ALTER TABLE "chat_logs" RENAME COLUMN "user_id_new" TO "user_id";--> statement-breakpoint
ALTER TABLE "chat_logs" ALTER COLUMN "user_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "group_evaluation_snapshots" ADD COLUMN "user_id_new" text;--> statement-breakpoint
UPDATE "group_evaluation_snapshots" t SET "user_id_new" = r."new_id" FROM "_user_id_remap" r WHERE t."user_id" = r."old_id";--> statement-breakpoint
ALTER TABLE "group_evaluation_snapshots" DROP COLUMN "user_id";--> statement-breakpoint
ALTER TABLE "group_evaluation_snapshots" RENAME COLUMN "user_id_new" TO "user_id";--> statement-breakpoint
ALTER TABLE "group_evaluation_snapshots" ALTER COLUMN "user_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "learner_concept_states" ADD COLUMN "user_id_new" text;--> statement-breakpoint
UPDATE "learner_concept_states" t SET "user_id_new" = r."new_id" FROM "_user_id_remap" r WHERE t."user_id" = r."old_id";--> statement-breakpoint
ALTER TABLE "learner_concept_states" DROP COLUMN "user_id";--> statement-breakpoint
ALTER TABLE "learner_concept_states" RENAME COLUMN "user_id_new" TO "user_id";--> statement-breakpoint
ALTER TABLE "learner_concept_states" ALTER COLUMN "user_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "scene_embeddings" ADD COLUMN "user_id_new" text;--> statement-breakpoint
UPDATE "scene_embeddings" t SET "user_id_new" = r."new_id" FROM "_user_id_remap" r WHERE t."user_id" = r."old_id";--> statement-breakpoint
ALTER TABLE "scene_embeddings" DROP COLUMN "user_id";--> statement-breakpoint
ALTER TABLE "scene_embeddings" RENAME COLUMN "user_id_new" TO "user_id";--> statement-breakpoint
ALTER TABLE "scene_embeddings" ALTER COLUMN "user_id" SET NOT NULL;
--> statement-breakpoint
DELETE FROM "session";--> statement-breakpoint
DELETE FROM "oauth_access_token";--> statement-breakpoint
DELETE FROM "oauth_refresh_token";--> statement-breakpoint
DELETE FROM "oauth_consent";--> statement-breakpoint
DELETE FROM "device_code";
--> statement-breakpoint
ALTER TABLE "account" ADD COLUMN "user_id_new" text;--> statement-breakpoint
UPDATE "account" t SET "user_id_new" = r."new_id" FROM "_user_id_remap" r WHERE t."user_id" = r."old_id";--> statement-breakpoint
ALTER TABLE "account" DROP COLUMN "user_id";--> statement-breakpoint
ALTER TABLE "account" RENAME COLUMN "user_id_new" TO "user_id";--> statement-breakpoint
ALTER TABLE "account" ALTER COLUMN "user_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "user_id_new" text;--> statement-breakpoint
ALTER TABLE "session" DROP COLUMN "user_id";--> statement-breakpoint
ALTER TABLE "session" RENAME COLUMN "user_id_new" TO "user_id";--> statement-breakpoint
ALTER TABLE "session" ALTER COLUMN "user_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "device_code" ADD COLUMN "user_id_new" text;--> statement-breakpoint
ALTER TABLE "device_code" DROP COLUMN "user_id";--> statement-breakpoint
ALTER TABLE "device_code" RENAME COLUMN "user_id_new" TO "user_id";
--> statement-breakpoint
ALTER TABLE "oauth_client" ADD COLUMN "user_id_new" text;--> statement-breakpoint
UPDATE "oauth_client" t SET "user_id_new" = r."new_id" FROM "_user_id_remap" r WHERE t."user_id" = r."old_id";--> statement-breakpoint
ALTER TABLE "oauth_client" DROP COLUMN "user_id";--> statement-breakpoint
ALTER TABLE "oauth_client" RENAME COLUMN "user_id_new" TO "user_id";
--> statement-breakpoint
ALTER TABLE "oauth_refresh_token" ADD COLUMN "user_id_new" text;--> statement-breakpoint
ALTER TABLE "oauth_refresh_token" DROP COLUMN "user_id";--> statement-breakpoint
ALTER TABLE "oauth_refresh_token" RENAME COLUMN "user_id_new" TO "user_id";--> statement-breakpoint
ALTER TABLE "oauth_refresh_token" ALTER COLUMN "user_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "oauth_access_token" ADD COLUMN "user_id_new" text;--> statement-breakpoint
ALTER TABLE "oauth_access_token" DROP COLUMN "user_id";--> statement-breakpoint
ALTER TABLE "oauth_access_token" RENAME COLUMN "user_id_new" TO "user_id";
--> statement-breakpoint
ALTER TABLE "oauth_consent" ADD COLUMN "user_id_new" text;--> statement-breakpoint
ALTER TABLE "oauth_consent" DROP COLUMN "user_id";--> statement-breakpoint
ALTER TABLE "oauth_consent" RENAME COLUMN "user_id_new" TO "user_id";
--> statement-breakpoint
UPDATE "apikey" a SET "reference_id" = r."new_id" FROM "_user_id_remap" r WHERE a."reference_id" = r."old_id"::text;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "id_new" text;--> statement-breakpoint
UPDATE "users" u SET "id_new" = r."new_id" FROM "_user_id_remap" r WHERE u."id" = r."old_id";--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_pkey";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "id";--> statement-breakpoint
ALTER TABLE "users" RENAME COLUMN "id_new" TO "id";--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD PRIMARY KEY ("id");--> statement-breakpoint
DROP SEQUENCE IF EXISTS "users_id_seq";
--> statement-breakpoint
ALTER TABLE "account_deletion_requests" ADD CONSTRAINT "account_deletion_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "video_groups" ADD CONSTRAINT "video_groups_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "chat_logs" ADD CONSTRAINT "chat_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "group_evaluation_snapshots" ADD CONSTRAINT "group_evaluation_snapshots_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "learner_concept_states" ADD CONSTRAINT "learner_concept_states_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "oauth_client" ADD CONSTRAINT "oauth_client_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "oauth_refresh_token" ADD CONSTRAINT "oauth_refresh_token_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "oauth_access_token" ADD CONSTRAINT "oauth_access_token_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "oauth_consent" ADD CONSTRAINT "oauth_consent_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
--> statement-breakpoint
DROP TABLE "_user_id_remap";
