-- Align scene_embeddings with PGVectorStore v2 and promote authorization
-- fields to filterable metadata_columns while preserving existing vectors.
ALTER TABLE "scene_embeddings"
	RENAME COLUMN "id" TO "langchain_id";
--> statement-breakpoint
ALTER TABLE "scene_embeddings"
	ALTER COLUMN "user_id" SET NOT NULL,
	ALTER COLUMN "video_id" SET NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scene_embeddings_user_id_idx"
	ON "scene_embeddings" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "scene_embeddings_video_id_idx"
	ON "scene_embeddings" USING btree ("video_id");
