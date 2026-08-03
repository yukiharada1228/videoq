-- pgvector PoC — modern schema の列・index・件数を採取（READ-ONLY）
-- 実行: psql "$DATABASE_URL" -f 0_schema_probe.sql

\echo '=== columns ==='
SELECT column_name, data_type, udt_name, is_nullable
FROM information_schema.columns
WHERE table_name = 'scene_embeddings'
ORDER BY ordinal_position;

\echo '=== embedding vector dimension ==='
SELECT a.attname,
       format_type(a.atttypid, a.atttypmod) AS type
FROM pg_attribute a
JOIN pg_class c ON c.oid = a.attrelid
WHERE c.relname = 'scene_embeddings' AND a.attname = 'embedding';

\echo '=== indexes (HNSW / IVFFlat の有無) ==='
SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'scene_embeddings';

\echo '=== row / user / video counts ==='
SELECT count(*) AS rows,
       count(DISTINCT user_id) AS users,
       count(DISTINCT video_id) AS videos
FROM scene_embeddings;

\echo '=== JSON メタに user_id/video_id が漏れていないか（DR-4 前提の確認）==='
-- 列型は JSON（JSONB ではない）ため、? 演算子を使うには jsonb へキャストする
SELECT (langchain_metadata::jsonb ? 'user_id') AS meta_has_user,
       (langchain_metadata::jsonb ? 'video_id') AS meta_has_video,
       count(*)
FROM scene_embeddings
GROUP BY 1, 2;

\echo '=== JSON メタのキー例（1 行）==='
SELECT jsonb_object_keys(langchain_metadata::jsonb) AS meta_keys
FROM scene_embeddings
LIMIT 20;
