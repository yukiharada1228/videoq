import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import { Pool, type PoolClient } from "pg";
import { describe, expect, it } from "vitest";
import { hashPassword } from "better-auth/crypto";
import { createAuth } from "../src/lib/auth";
import { patchFlags } from "../src/features/admin/service";
import { getAdminUser, isSuperuser } from "../src/repositories/admin-repository";
import { getCurrentUser } from "../src/repositories/user-repository";
import { schema, users, account } from "../src/db/schema";
import type { Bindings } from "../src/types/bindings";
import { purgeRetiredStudyData } from "../scripts/purge-retired-study-data.mjs";

const legacyStudyTables = [
  "app_learnerconceptstate", "app_plogbuildjob", "app_plogconcept",
  "app_plogedge", "app_ploglearningobject", "app_plogsummarynode",
];

const databaseUrl = process.env.QUOTA_TEST_DATABASE_URL;
const migrationDirectory = fileURLToPath(
  new URL("../drizzle", import.meta.url),
);
const journal = JSON.parse(
  readFileSync(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8"),
) as { entries: { idx: number; tag: string }[] };
const migrationDescribe = databaseUrl ? describe : describe.skip;

migrationDescribe("Drizzle migration chain", () => {
  it.each(["empty", "populated"] as const)("applies migrations to a PostgreSQL database (%s)", async (initialState) => {
    const databaseName = `videoq_drizzle_${crypto.randomUUID().replaceAll("-", "")}`;
    const adminPool = new Pool({ connectionString: databaseUrl });
    // node-postgres requires a Pool error listener; without one, a background
    // error on an idle client crashes the process instead of just being ignored.
    // `DROP DATABASE ... WITH (FORCE)` in the `finally` block below races with our
    // own `pool.end()` above it and can surface exactly such an error here.
    adminPool.on("error", () => {});
    const adminDb = drizzle(adminPool);
    const targetUrl = new URL(databaseUrl!);
    targetUrl.pathname = `/${databaseName}`;
    let targetPool: Pool | undefined;
    let targetClient: PoolClient | undefined;
    let stagedMigrations: string | undefined;

    try {
      await adminDb.execute(sql.raw(`CREATE DATABASE "${databaseName}"`));
      targetPool = new Pool({ connectionString: targetUrl.toString(), max: 1 });
      targetPool.on("error", () => {});
      // Match production's request-scoped Client: hooks and nested adapter
      // transactions must use the same connection, not wait for another slot.
      targetClient = await targetPool.connect();
      const db = drizzle(targetClient, { schema });

      const preservedTables = [
        "users", "videos", "video_courses", "video_course_members",
        "chat_logs", "chat_log_evaluations", "scene_embeddings", "videoq_scenes",
        "app_user", "app_video",
      ];
      const preservedRows: Record<string, unknown[]> = {};
      if (initialState === "populated") {
        const removal = journal.entries.find((entry) => entry.tag === "0023_remove_study_mode")!;
        // Use the real pre-removal migrations, including all FK constraints.
        stagedMigrations = mkdtempSync(join(tmpdir(), "videoq-pre-removal-"));
        cpSync(migrationDirectory, stagedMigrations, { recursive: true });
        writeFileSync(join(stagedMigrations, "meta/_journal.json"), JSON.stringify({
          ...journal, entries: journal.entries.filter((entry) => entry.idx < removal.idx),
        }));
        await migrate(db, { migrationsFolder: stagedMigrations });
        await targetClient.query(readFileSync(new URL("./fixtures/study-removal.sql", import.meta.url), "utf8"));
        await expect(purgeRetiredStudyData(targetClient)).rejects.toThrow("Apply 0023");
        for (const table of legacyStudyTables) {
          expect((await targetClient.query(`SELECT count(*)::integer AS n FROM ${table}`)).rows[0].n).toBeGreaterThan(0);
          await targetClient.query(`CREATE TABLE legacy_${table} AS TABLE ${table}`);
        }
        for (const table of preservedTables) {
          preservedRows[table] = (await targetClient.query(`SELECT to_jsonb(t) AS row FROM ${table} t`)).rows;
          expect(preservedRows[table]).toHaveLength(1);
        }
        preservedRows.external_tasks = (await targetClient.query("SELECT to_jsonb(t) AS row FROM external_tasks t WHERE dedupe_key LIKE 'keep-%' ORDER BY dedupe_key")).rows;
        preservedRows.job_executions = (await targetClient.query("SELECT to_jsonb(t) AS row FROM job_executions t WHERE job_id LIKE 'keep-%' ORDER BY job_id")).rows;

        await migrate(db, { migrationsFolder: migrationDirectory });
        // A failure after DROP and outbox deletion must restore both. It can be
        // retried after the fault is resolved, even with 0023 already applied.
        await targetClient.query(`
          CREATE FUNCTION reject_test_job_delete() RETURNS trigger LANGUAGE plpgsql AS $$
          BEGIN RAISE EXCEPTION 'simulated cleanup failure'; END $$;
          CREATE TRIGGER reject_test_job_delete BEFORE DELETE ON job_executions
            FOR EACH ROW EXECUTE FUNCTION reject_test_job_delete();
        `);
        await expect(purgeRetiredStudyData(targetClient)).rejects.toThrow("simulated cleanup failure");
        for (const table of legacyStudyTables.flatMap((name) => [name, `legacy_${name}`])) {
          expect((await targetClient.query(`SELECT count(*)::integer AS n FROM ${table}`)).rows[0].n).toBeGreaterThan(0);
        }
        expect((await targetClient.query("SELECT count(*)::integer AS n FROM external_tasks WHERE dedupe_key LIKE 'retired-%'")).rows[0].n).toBe(3);
        expect((await targetClient.query("SELECT count(*)::integer AS n FROM job_executions WHERE job_type = 'build_plog'")).rows[0].n).toBe(3);
        await targetClient.query("DROP TRIGGER reject_test_job_delete ON job_executions; DROP FUNCTION reject_test_job_delete()");
      }
      // Exercise the real production entrypoint, including legacy cleanup, for
      // both fresh installs and already populated databases, then retry it.
      const runMigration = () => spawnSync("sh", [
        fileURLToPath(new URL("../scripts/db-migrate.sh", import.meta.url)),
      ], {
        encoding: "utf8",
        env: { ...process.env, DATABASE_URL: targetUrl.toString() },
        timeout: 20_000,
      });
      for (let attempt = 0; attempt < 2; attempt++) {
        const migrated = runMigration();
        expect(migrated.error).toBeUndefined();
        expect(migrated.status, migrated.stdout + migrated.stderr).toBe(0);
      }
      if (initialState === "populated") {
        for (const table of preservedTables) {
          expect((await targetClient.query(`SELECT to_jsonb(t) AS row FROM ${table} t`)).rows)
            .toEqual(preservedRows[table]);
        }
        expect((await targetClient.query("SELECT job_id FROM job_executions ORDER BY job_id")).rows)
          .toEqual([{ job_id: "keep-indexing" }, { job_id: "keep-transcription" }]);
        expect((await targetClient.query("SELECT dedupe_key FROM external_tasks ORDER BY dedupe_key")).rows)
          .toEqual([{ dedupe_key: "keep-indexing" }, { dedupe_key: "keep-storage-cleanup" }]);
        expect((await targetClient.query("SELECT to_jsonb(t) AS row FROM external_tasks t ORDER BY dedupe_key")).rows)
          .toEqual(preservedRows.external_tasks);
        expect((await targetClient.query("SELECT to_jsonb(t) AS row FROM job_executions t ORDER BY job_id")).rows)
          .toEqual(preservedRows.job_executions);
      }

      const result = await db.execute(sql.raw(`
        SELECT
          (SELECT count(*)::integer FROM drizzle.__drizzle_migrations) AS migration_count,
          to_regclass('public.users')::text AS users_table,
          to_regclass('public.mcp_idempotency_records')::text AS mcp_table,
          to_regclass('public.oauth_resource')::text AS oauth_resource_table
      `));
      expect(result.rows[0]).toEqual({
        migration_count: journal.entries.length,
        users_table: "users",
        mcp_table: "mcp_idempotency_records",
        oauth_resource_table: "oauth_resource",
      });

      const retiredTables = await db.execute(sql.raw(`
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public'
          AND (tablename LIKE '%plog%' OR tablename LIKE '%learner%')
      `));
      expect(retiredTables.rows).toEqual([]);
      const retainedTables = await db.execute(sql.raw(`
        SELECT to_regclass('public.videos')::text AS videos,
               to_regclass('public.chat_logs')::text AS chat_logs,
               to_regclass('public.scene_embeddings')::text AS scene_embeddings
      `));
      expect(retainedTables.rows[0]).toEqual({
        videos: "videos", chat_logs: "chat_logs", scene_embeddings: "scene_embeddings",
      });

      // Verify the migrated schema with the real Admin API and transaction
      // adapter used by the existing settings/admin UI.
      const adminId = crypto.randomUUID();
      const targetId = crypto.randomUUID();
      const base = "https://native-auth.example.test";
      const env = {
        ENVIRONMENT: "test", BETTER_AUTH_URL: base, FRONTEND_URL: base, CORS_ALLOW_ORIGIN: base,
        BETTER_AUTH_SECRET: "native-auth-test-secret-012345678901234567890123456789",
        HYPERDRIVE: { connectionString: targetUrl.toString() },
      } as Bindings;
      const password = "native-auth-test-password-123";
      const quota = { maxVideoUploadSizeMb: 500, isOverQuota: false, usedAiAnswers: 0, usedProcessingSeconds: 0, usedStorageBytes: 0 };
      await db.insert(users).values([
        { ...quota, id: adminId, username: "admin", email: "admin@example.test", emailVerified: true, role: "admin" },
        // Stale legacy values must have no effect after the migration.
        { ...quota, id: targetId, username: "target", email: "target@example.test", emailVerified: true, role: "user", isSuperuser: true, isActive: false },
      ]);
      await db.insert(account).values({
        id: crypto.randomUUID(), accountId: adminId, userId: adminId,
        issuer: "local:credential", providerId: "credential", password: await hashPassword(password),
      });
      const auth = createAuth(env, db);
      const createdAdmin = await auth.api.createUser({ body: {
        name: "Native Admin", email: "created-admin@example.test", role: "admin",
      } });
      expect(createdAdmin.user.role).toBe("admin");
      const signedIn = await auth.api.signInEmail({ body: { email: "admin@example.test", password }, asResponse: true });
      expect(signedIn.status).toBe(200);
      const headers = new Headers({ cookie: signedIn.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ") });
      expect(await isSuperuser(env, targetId)).toBe(false);
      expect(await getCurrentUser(env, targetId)).toMatchObject({ is_superuser: false });
      expect(await getAdminUser(env, targetId)).toMatchObject({ is_active: true, is_superuser: false });

      expect(await patchFlags(env, adminId, targetId, { is_active: false, is_superuser: true }, headers))
        .toMatchObject({ user: { is_active: false, is_superuser: true } });
      expect(await patchFlags(env, adminId, targetId, { is_active: true, is_superuser: false, is_staff: true }, headers))
        .toMatchObject({ user: { is_active: true, is_superuser: false, is_staff: true } });
      expect(await isSuperuser(env, targetId)).toBe(false);
      expect(await getCurrentUser(env, targetId)).toMatchObject({ is_superuser: false });

      await expect(patchFlags(env, adminId, targetId, { is_active: false }, new Headers()))
        .rejects.toMatchObject({ statusCode: 401 });
      expect(await getAdminUser(env, targetId)).toMatchObject({ is_active: true });
    } finally {
      targetClient?.release();
      await targetPool?.end();
      await adminDb.execute(
        sql.raw(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`),
      );
      await adminPool.end();
      if (stagedMigrations) rmSync(stagedMigrations, { recursive: true, force: true });
    }
  }, 60_000);
});
