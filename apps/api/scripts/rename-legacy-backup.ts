#!/usr/bin/env npx tsx
/**
 * After cutover soak: rename Django-era tables to legacy_* (keeps data as backup).
 *
 *   DATABASE_URL=... npx tsx scripts/rename-legacy-backup.ts --dry-run
 *   DATABASE_URL=... npx tsx scripts/rename-legacy-backup.ts --confirm
 */
import pg from "pg";

const databaseUrl =
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@127.0.0.1:55432/postgres";

const RENAMES: Array<[string, string]> = [
  ["app_user", "legacy_app_user"],
  ["app_userapikey", "legacy_app_userapikey"],
  ["app_accountdeletionrequest", "legacy_app_accountdeletionrequest"],
  ["app_video", "legacy_app_video"],
  ["app_videogroup", "legacy_app_videogroup"],
  ["app_videogroupmember", "legacy_app_videogroupmember"],
  ["app_tag", "legacy_app_tag"],
  ["app_videotag", "legacy_app_videotag"],
  ["app_chatlog", "legacy_app_chatlog"],
  ["app_chatlogevaluation", "legacy_app_chatlogevaluation"],
  ["app_groupevaluationsnapshot", "legacy_app_groupevaluationsnapshot"],
  ["app_plogbuildjob", "legacy_app_plogbuildjob"],
  ["app_plogsummarynode", "legacy_app_plogsummarynode"],
  ["app_plogconcept", "legacy_app_plogconcept"],
  ["app_plogedge", "legacy_app_plogedge"],
  ["app_ploglearningobject", "legacy_app_ploglearningobject"],
  ["app_learnerconceptstate", "legacy_app_learnerconceptstate"],
  ["videoq_scenes", "legacy_videoq_scenes"],
  ["oauth2_provider_application", "legacy_oauth2_provider_application"],
  ["oauth2_provider_grant", "legacy_oauth2_provider_grant"],
  ["oauth2_provider_accesstoken", "legacy_oauth2_provider_accesstoken"],
  ["oauth2_provider_refreshtoken", "legacy_oauth2_provider_refreshtoken"],
  ["oauth2_provider_idtoken", "legacy_oauth2_provider_idtoken"],
  ["oauth2_provider_devicegrant", "legacy_oauth2_provider_devicegrant"],
  // Unused Django leftovers
  ["django_admin_log", "legacy_django_admin_log"],
  ["django_session", "legacy_django_session"],
  ["django_cache", "legacy_django_cache"],
  ["django_content_type", "legacy_django_content_type"],
  ["auth_permission", "legacy_auth_permission"],
  ["auth_group", "legacy_auth_group"],
  ["auth_group_permissions", "legacy_auth_group_permissions"],
  ["app_user_groups", "legacy_app_user_groups"],
  ["app_user_user_permissions", "legacy_app_user_user_permissions"],
  ["app_document", "legacy_app_document"],
  ["app_documentgroupmember", "legacy_app_documentgroupmember"],
  ["app_documenttag", "legacy_app_documenttag"],
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
  for (const [from, to] of RENAMES) {
    const exists = await client.query(
      `SELECT to_regclass('public.${from}') IS NOT NULL AS ok`,
    );
    if (!exists.rows[0]?.ok) {
      console.log(`skip (missing): ${from}`);
      continue;
    }
    const dest = await client.query(
      `SELECT to_regclass('public.${to}') IS NOT NULL AS ok`,
    );
    if (dest.rows[0]?.ok) {
      console.log(`skip (dest exists): ${from} → ${to}`);
      continue;
    }
    if (dryRun) {
      console.log(`would rename: ${from} → ${to}`);
    } else {
      await client.query(`ALTER TABLE "${from}" RENAME TO "${to}"`);
      console.log(`renamed: ${from} → ${to}`);
    }
  }
} finally {
  await client.end();
}
