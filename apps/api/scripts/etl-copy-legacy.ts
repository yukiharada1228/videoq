#!/usr/bin/env npx tsx
/**
 * Copy legacy Django-era tables into modern schema (ID-preserving).
 *
 * Usage:
 *   DATABASE_URL=... npx tsx scripts/etl-copy-legacy.ts [--dry-run] [--truncate] [--verify]
 */
import pg from "pg";

const { Client } = pg;

type TableCopy = {
	label: string;
	oldTable: string;
	newTable: string;
	/** Explicit column list for INSERT; defaults to SELECT * */
	insertSql?: string;
	sequence?: string;
};

const COPIES: TableCopy[] = [
	{
		label: "users",
		oldTable: "app_user",
		newTable: "users",
		sequence: "users_id_seq",
	},
	{
		label: "api_keys",
		oldTable: "app_userapikey",
		newTable: "api_keys",
		sequence: "api_keys_id_seq",
	},
	{
		label: "account_deletion_requests",
		oldTable: "app_accountdeletionrequest",
		newTable: "account_deletion_requests",
		sequence: "account_deletion_requests_id_seq",
	},
	{
		label: "videos",
		oldTable: "app_video",
		newTable: "videos",
		sequence: "videos_id_seq",
	},
	{
		label: "video_groups",
		oldTable: "app_videogroup",
		newTable: "video_groups",
		sequence: "video_groups_id_seq",
	},
	{
		label: "video_group_members",
		oldTable: "app_videogroupmember",
		newTable: "video_group_members",
		sequence: "video_group_members_id_seq",
	},
	{
		label: "tags",
		oldTable: "app_tag",
		newTable: "tags",
		sequence: "tags_id_seq",
	},
	{
		label: "video_tags",
		oldTable: "app_videotag",
		newTable: "video_tags",
		sequence: "video_tags_id_seq",
	},
	{
		label: "chat_logs",
		oldTable: "app_chatlog",
		newTable: "chat_logs",
		sequence: "chat_logs_id_seq",
	},
	{
		label: "chat_log_evaluations",
		oldTable: "app_chatlogevaluation",
		newTable: "chat_log_evaluations",
		sequence: "chat_log_evaluations_id_seq",
	},
	{
		label: "group_evaluation_snapshots",
		oldTable: "app_groupevaluationsnapshot",
		newTable: "group_evaluation_snapshots",
		sequence: "group_evaluation_snapshots_id_seq",
	},
	{
		label: "plog_build_jobs",
		oldTable: "app_plogbuildjob",
		newTable: "plog_build_jobs",
		sequence: "plog_build_jobs_id_seq",
	},
	{
		label: "plog_summary_nodes",
		oldTable: "app_plogsummarynode",
		newTable: "plog_summary_nodes",
		sequence: "plog_summary_nodes_id_seq",
	},
	{
		label: "plog_concepts",
		oldTable: "app_plogconcept",
		newTable: "plog_concepts",
		sequence: "plog_concepts_id_seq",
	},
	{
		label: "plog_edges",
		oldTable: "app_plogedge",
		newTable: "plog_edges",
		sequence: "plog_edges_id_seq",
	},
	{
		label: "plog_learning_objects",
		oldTable: "app_ploglearningobject",
		newTable: "plog_learning_objects",
		sequence: "plog_learning_objects_id_seq",
	},
	{
		label: "learner_concept_states",
		oldTable: "app_learnerconceptstate",
		newTable: "learner_concept_states",
		sequence: "learner_concept_states_id_seq",
	},
	{
		label: "scene_embeddings",
		oldTable: "videoq_scenes",
		newTable: "scene_embeddings",
		insertSql: `INSERT INTO scene_embeddings
  (langchain_id, content, embedding, user_id, video_id, langchain_metadata)
SELECT langchain_id, content, embedding, user_id::bigint, video_id::bigint,
       langchain_metadata
FROM videoq_scenes`,
	},
];

/** Truncate modern tables in reverse FK order (CASCADE). */
const TRUNCATE_TABLES = [...COPIES].reverse().map((c) => c.newTable);

const ORPHAN_CHECKS: { label: string; sql: string; legacySql?: string }[] = [
	{
		label: "videos.user_id → users",
		sql: `SELECT COUNT(*) AS n FROM videos v LEFT JOIN users u ON v.user_id = u.id WHERE u.id IS NULL`,
	},
	{
		label: "video_group_members.group_id → video_groups",
		sql: `SELECT COUNT(*) AS n FROM video_group_members m LEFT JOIN video_groups g ON m.group_id = g.id WHERE g.id IS NULL`,
	},
	{
		label: "video_group_members.video_id → videos",
		sql: `SELECT COUNT(*) AS n FROM video_group_members m LEFT JOIN videos v ON m.video_id = v.id WHERE v.id IS NULL`,
	},
	{
		label: "chat_logs.group_id → video_groups",
		sql: `SELECT COUNT(*) AS n FROM chat_logs c LEFT JOIN video_groups g ON c.group_id = g.id WHERE g.id IS NULL`,
	},
	{
		label: "plog_concepts.video_id → videos",
		sql: `SELECT COUNT(*) AS n FROM plog_concepts p LEFT JOIN videos v ON p.video_id = v.id WHERE v.id IS NULL`,
	},
	{
		label: "scene_embeddings.video_id → videos (non-null)",
		sql: `SELECT COUNT(*) AS n FROM scene_embeddings s LEFT JOIN videos v ON s.video_id = v.id WHERE v.id IS NULL`,
		legacySql: `SELECT COUNT(*) AS n FROM videoq_scenes s LEFT JOIN app_video v ON s.video_id = v.id WHERE s.video_id IS NOT NULL AND v.id IS NULL`,
	},
];

function parseArgs(argv: string[]) {
	return {
		dryRun: argv.includes("--dry-run"),
		truncate: argv.includes("--truncate"),
		verify: argv.includes("--verify"),
	};
}

async function tableExists(client: pg.Client, table: string): Promise<boolean> {
	const { rows } = await client.query<{ exists: boolean }>(
		`SELECT to_regclass($1) IS NOT NULL AS exists`,
		[`public.${table}`],
	);
	return Boolean(rows[0]?.exists);
}

async function countTable(client: pg.Client, table: string): Promise<number> {
	const { rows } = await client.query<{ count: string }>(
		`SELECT COUNT(*)::text AS count FROM ${quoteIdent(table)}`,
	);
	return Number(rows[0]?.count ?? 0);
}

function quoteIdent(name: string): string {
	return `"${name.replace(/"/g, '""')}"`;
}

async function main() {
	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) {
		console.error("DATABASE_URL is required");
		process.exit(1);
	}

	const { dryRun, truncate, verify } = parseArgs(process.argv.slice(2));
	// --verify alone: compare counts/orphans without INSERT.
	const verifyOnly = verify && !truncate && !dryRun;
	const client = new Client({ connectionString: databaseUrl });
	await client.connect();

	try {
		if (truncate && !dryRun) {
			console.log("Truncating modern tables (CASCADE)...");
			await client.query(
				`TRUNCATE ${TRUNCATE_TABLES.map(quoteIdent).join(", ")} RESTART IDENTITY CASCADE`,
			);
		} else if (truncate && dryRun) {
			console.log("[dry-run] Would truncate:", TRUNCATE_TABLES.join(", "));
		}

		if (!verifyOnly) {
			for (const copy of COPIES) {
				if (!(await tableExists(client, copy.oldTable))) {
					const msg = `${copy.label}: skip (missing ${copy.oldTable})`;
					console.log(dryRun ? `[dry-run] ${msg}` : msg);
					continue;
				}
				const oldCount = await countTable(client, copy.oldTable);
				if (dryRun) {
					console.log(
						`[dry-run] ${copy.label}: ${copy.oldTable} → ${copy.newTable} (${oldCount} rows)`,
					);
					continue;
				}

				const sql =
					copy.insertSql ??
					`INSERT INTO ${quoteIdent(copy.newTable)} SELECT * FROM ${quoteIdent(copy.oldTable)}`;
				const result = await client.query(sql);
				console.log(`Copied ${copy.label}: ${result.rowCount ?? oldCount} rows`);

				if (copy.sequence) {
					await client.query(
						`SELECT setval(pg_get_serial_sequence($1, 'id'), COALESCE((SELECT MAX(id) FROM ${quoteIdent(copy.newTable)}), 1), (SELECT COUNT(*) > 0 FROM ${quoteIdent(copy.newTable)}))`,
						[copy.newTable],
					);
				}
			}
			if (truncate && !dryRun) {
				console.log("Invalidating all legacy authentication credentials...");
				await client.query(`
					UPDATE users
					   SET password = '!reset-required$' || gen_random_uuid()::text,
					       password_reset_required = true,
					       searchapi_api_key_encrypted = NULL;
					TRUNCATE session, account, verification, apikey,
					         oauth_device_grants, oauth_refresh_tokens,
					         oauth_access_tokens, oauth_id_tokens,
					         oauth_grants, oauth_applications
					RESTART IDENTITY CASCADE;
				`);
			}
		} else {
			console.log("Verify-only mode (no copy)");
		}

		if (verify || dryRun || verifyOnly) {
			console.log("\n--- Count comparison ---");
			let mismatches = 0;
			for (const copy of COPIES) {
				if (!(await tableExists(client, copy.oldTable))) {
					console.log(`SKIP ${copy.label.padEnd(28)} missing ${copy.oldTable}`);
					continue;
				}
				const oldCount = await countTable(client, copy.oldTable);
				const newCount = dryRun
					? 0
					: (await tableExists(client, copy.newTable))
						? await countTable(client, copy.newTable)
						: 0;
				const ok = dryRun || oldCount === newCount;
				const mark = ok ? "OK" : "MISMATCH";
				console.log(`${mark}  ${copy.label.padEnd(28)} old=${oldCount} new=${newCount}`);
				if (!ok) mismatches++;
			}

			if (!dryRun) {
				console.log("\n--- Orphan FK checks ---");
				for (const check of ORPHAN_CHECKS) {
					const { rows } = await client.query<{ n: string }>(check.sql);
					const n = Number(rows[0]?.n ?? 0);
					let legacyN = 0;
					if (check.legacySql) {
						const legacyRows = await client.query<{ n: string }>(check.legacySql);
						legacyN = Number(legacyRows.rows[0]?.n ?? 0);
					}
					const ok = check.legacySql ? n === legacyN : n === 0;
					const mark = ok ? "OK" : "FAIL";
					const suffix = check.legacySql ? ` (legacy=${legacyN})` : "";
					console.log(`${mark}  ${check.label}: ${n} orphans${suffix}`);
					if (!ok) mismatches++;
				}
				if (truncate) {
				console.log("\n--- Credential invalidation checks ---");
				const credentialChecks = [
					{
						label: "users require password reset and have no encrypted SearchAPI key",
						sql: `SELECT COUNT(*) AS n FROM users
						      WHERE password_reset_required = false
						         OR searchapi_api_key_encrypted IS NOT NULL`,
					},
					{
						label: "browser sessions and action tokens are empty",
						sql: `SELECT
						        (SELECT COUNT(*) FROM session) +
						        (SELECT COUNT(*) FROM auth_action_tokens) AS n`,
					},
					{
						label: "OAuth credentials are empty",
						sql: `SELECT
						        (SELECT COUNT(*) FROM oauth_applications) +
						        (SELECT COUNT(*) FROM oauth_grants) +
						        (SELECT COUNT(*) FROM oauth_access_tokens) +
						        (SELECT COUNT(*) FROM oauth_refresh_tokens) +
						        (SELECT COUNT(*) FROM oauth_id_tokens) +
						        (SELECT COUNT(*) FROM oauth_device_grants) AS n`,
					},
				];
				for (const check of credentialChecks) {
					const { rows } = await client.query<{ n: string }>(check.sql);
					const n = Number(rows[0]?.n ?? 0);
					console.log(`${n === 0 ? "OK" : "FAIL"}  ${check.label}: ${n}`);
					if (n !== 0) mismatches++;
				}
				}
			}

			if (mismatches > 0 && !dryRun) {
				console.error(`\nVerification failed: ${mismatches} issue(s)`);
				process.exit(1);
			}
			console.log(dryRun ? "\n[dry-run] Count comparison skipped for new tables." : "\nVerification passed.");
		}
	} finally {
		await client.end();
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
