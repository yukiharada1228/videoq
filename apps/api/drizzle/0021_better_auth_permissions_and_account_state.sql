-- drizzle-kit:custom
-- Run before deploying the application: native permissions / banned / role
-- become authoritative. Pause legacy auth/admin writes during this cutover.
-- Copy the policy enforced by the old application, even if an unused native
-- permission value was already present; the migration must not expand access.
WITH decoded AS (
  SELECT id, metadata,
    CASE WHEN metadata IS JSON THEN metadata::jsonb ELSE NULL END AS value
  FROM apikey
), normalized AS (
  SELECT id, metadata, CASE
    WHEN jsonb_typeof(value) = 'string' AND (value #>> '{}') IS JSON
      THEN (value #>> '{}')::jsonb
    ELSE value END AS value
  FROM decoded
), levels AS (
  SELECT id, metadata, value,
    COALESCE(NULLIF(value->'accessLevel', 'null'::jsonb), value->'access_level') AS level
  FROM normalized
)
UPDATE apikey SET permissions = CASE
  WHEN level = '"all"'::jsonb THEN '{"videoq":["read","write"]}'
  WHEN (levels.metadata IS NOT NULL AND value IS NULL)
    OR (jsonb_typeof(level) = 'string' AND level <> '"read_only"'::jsonb)
    THEN '{"videoq":[]}'
  ELSE '{"videoq":["read"]}'
END
FROM levels WHERE apikey.id = levels.id;
--> statement-breakpoint
UPDATE users SET banned = true, ban_expires = NULL
WHERE is_active = false;
--> statement-breakpoint
UPDATE users SET role = 'admin' WHERE is_superuser = true;
