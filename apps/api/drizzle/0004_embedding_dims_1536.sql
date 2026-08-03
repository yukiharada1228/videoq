-- Production legacy vectors are 1536-d (text-embedding-3-small / ada family).
-- Widen scene_embeddings to match before ETL copy from videoq_scenes.
ALTER TABLE "scene_embeddings" ALTER COLUMN "embedding" TYPE vector(1536);
