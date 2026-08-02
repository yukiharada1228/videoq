-- Baseline: existing Neon / local schema (Django migrations 0001–0041 + langchain videoq_scenes)
-- is treated as already applied. Do NOT run this SQL against a populated database.
-- Record only: drizzle-kit migrate after inserting into drizzle.__drizzle_migrations manually
-- or use `drizzle-kit push` never on prod.
--
-- Ownership: schema changes from here on are authored in backend-hono (drizzle-kit generate).
SELECT 1;
