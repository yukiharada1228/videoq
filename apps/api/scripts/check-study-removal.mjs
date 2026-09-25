#!/usr/bin/env node
/** Prevent 0023 from dropping tables while the previous API/worker is serving. */
import { pathToFileURL } from "node:url";
import pg from "pg";

export async function checkStudyRemovalMaintenance(client, maintenance) {
  const { rows } = await client.query(`
    SELECT EXISTS (
      SELECT 1 FROM pg_tables
      WHERE schemaname = 'public' AND tablename = ANY($1::text[])
    ) AS has_study_tables
  `, [[
    "learner_concept_states", "plog_build_jobs", "plog_concepts",
    "plog_edges", "plog_learning_objects", "plog_summary_nodes",
  ]]);
  // Fresh databases and databases already migrated need no maintenance window.
  if (!rows[0].has_study_tables || maintenance === "true") return;
  throw new Error(
    "0023_remove_study_mode requires maintenance: stop API traffic and SQS consumption, " +
    "wait for in-flight work to finish, then set STUDY_REMOVAL_MAINTENANCE=true. " +
    "Keep traffic paused until API, web and worker deployments all succeed. " +
    "See docs/design/deployment-diagram.md.",
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL ||
    "postgresql://postgres:postgres@127.0.0.1:55432/postgres" });
  await client.connect();
  try {
    await checkStudyRemovalMaintenance(client, process.env.STUDY_REMOVAL_MAINTENANCE);
  } finally {
    await client.end();
  }
}
