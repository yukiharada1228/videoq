#!/usr/bin/env npx tsx
/**
 * After soak period: DROP legacy_* backup tables (and leftover django_migrations if desired).
 *
 *   DATABASE_URL=... npx tsx scripts/drop-legacy.ts --dry-run
 *   DATABASE_URL=... npx tsx scripts/drop-legacy.ts --confirm
 *
 * Prefers dropping rename-backed legacy_* tables. Also drops original names if still present.
 */
import pg from "pg";

const databaseUrl =
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@127.0.0.1:55432/postgres";

const TABLES = [
  "legacy_app_user",
  "legacy_app_userapikey",
  "legacy_app_accountdeletionrequest",
  "legacy_app_video",
  "legacy_app_videogroup",
  "legacy_app_videogroupmember",
  "legacy_app_tag",
  "legacy_app_videotag",
  "legacy_app_chatlog",
  "legacy_app_chatlogevaluation",
  "legacy_app_groupevaluationsnapshot",
  "legacy_app_plogbuildjob",
  "legacy_app_plogsummarynode",
  "legacy_app_plogconcept",
  "legacy_app_plogedge",
  "legacy_app_ploglearningobject",
  "legacy_app_learnerconceptstate",
  "legacy_videoq_scenes",
  "legacy_oauth2_provider_application",
  "legacy_oauth2_provider_grant",
  "legacy_oauth2_provider_accesstoken",
  "legacy_oauth2_provider_refreshtoken",
  "legacy_oauth2_provider_idtoken",
  "legacy_oauth2_provider_devicegrant",
  "legacy_django_admin_log",
  "legacy_django_session",
  "legacy_django_cache",
  "legacy_django_content_type",
  "legacy_auth_permission",
  "legacy_auth_group",
  "legacy_auth_group_permissions",
  "legacy_app_user_groups",
  "legacy_app_user_user_permissions",
  "legacy_app_document",
  "legacy_app_documentgroupmember",
  "legacy_app_documenttag",
  // originals if rename was skipped
  "app_documenttag",
  "app_documentgroupmember",
  "app_document",
  "app_user_user_permissions",
  "app_user_groups",
  "auth_group_permissions",
  "auth_permission",
  "auth_group",
  "django_admin_log",
  "django_cache",
  "django_session",
  "django_content_type",
  // DO NOT drop django_migrations / drizzle schema — migrate history
];

const dryRun = process.argv.includes("--dry-run");
const confirm = process.argv.includes("--confirm");

if (!dryRun && !confirm) {
  console.error("Specify --dry-run or --confirm");
  process.exit(1);
}

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();
try {
  for (const table of TABLES) {
    const exists = await client.query(
      `SELECT to_regclass('public.${table}') IS NOT NULL AS ok`,
    );
    if (!exists.rows[0]?.ok) {
      console.log(`skip (missing): ${table}`);
      continue;
    }
    if (dryRun) {
      console.log(`would drop: ${table}`);
    } else {
      await client.query(`DROP TABLE IF EXISTS "${table}" CASCADE`);
      console.log(`dropped: ${table}`);
    }
  }
} finally {
  await client.end();
}
