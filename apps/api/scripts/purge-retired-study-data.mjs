#!/usr/bin/env node
/** Remove untracked Django-era learning storage after the generated table drop. */
import { pathToFileURL } from "node:url";
import pg from "pg";

const modernTables = [
  "learner_concept_states", "plog_build_jobs", "plog_concepts",
  "plog_edges", "plog_learning_objects", "plog_summary_nodes",
];
const legacyTables = [
  "app_learnerconceptstate", "app_plogbuildjob", "app_plogconcept",
  "app_plogedge", "app_ploglearningobject", "app_plogsummarynode",
].flatMap((name) => [name, `legacy_${name}`]);

export async function purgeRetiredStudyData(client) {
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '60s'");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('videoq:retired-study-data'))");
    const { rows } = await client.query(`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND tablename = ANY($1::text[])
    `, [modernTables]);
    if (rows.length) {
      throw new Error("Apply 0023_remove_study_mode before purging retired study data.");
    }

    // These tables predate the current Drizzle schema. Keep the allowlist exact;
    // videoq_scenes and other shared video/Q&A storage must remain untouched.
    await client.query(`DROP TABLE IF EXISTS ${legacyTables.map((name) => `public."${name}"`).join(", ")} RESTRICT`);
    const outbox = await client.query(`
      DELETE FROM public.external_tasks
      WHERE kind = 'sqs_job' AND payload->'message'->>'type' = 'build_plog'
    `);
    const executions = await client.query(`
      DELETE FROM public.job_executions WHERE job_type = 'build_plog'
    `);
    await client.query("COMMIT");
    return { outbox: outbox.rowCount, executions: executions.rowCount };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL ||
    "postgresql://postgres:postgres@127.0.0.1:55432/postgres" });
  await client.connect();
  try {
    console.log("Retired study data removed:", await purgeRetiredStudyData(client));
  } finally { await client.end(); }
}
