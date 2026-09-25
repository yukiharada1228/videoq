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
import { checkStudyRemovalMaintenance } from "../scripts/check-study-removal.mjs";

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
        "chat_logs", "chat_log_evaluations", "scene_embeddings",
      ];
      const preservedRows: Record<string, unknown[]> = {};
      await checkStudyRemovalMaintenance(targetClient, undefined);
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
        await expect(checkStudyRemovalMaintenance(targetClient, undefined)).rejects.toThrow("requires maintenance");
        await checkStudyRemovalMaintenance(targetClient, "true");
        for (const table of preservedTables) {
          preservedRows[table] = (await targetClient.query(`SELECT to_jsonb(t) AS row FROM ${table} t`)).rows;
          expect(preservedRows[table]).toHaveLength(1);
        }
        // Verify the real deployment entrypoint stops before running any SQL.
        const runMigration = (maintenance: string) => spawnSync("sh", [
          fileURLToPath(new URL("../scripts/db-migrate.sh", import.meta.url)),
        ], {
          encoding: "utf8",
          env: { ...process.env, DATABASE_URL: targetUrl.toString(), STUDY_REMOVAL_MAINTENANCE: maintenance },
          timeout: 15_000,
        });
        const blocked = runMigration("false");
        expect(blocked.status).toBe(1);
        expect(blocked.stderr).toContain("requires maintenance");
        expect((await targetClient.query("SELECT count(*)::integer AS count FROM plog_concepts")).rows[0].count).toBe(2);
        const allowed = runMigration("true");
        expect(allowed.error).toBeUndefined();
        expect(allowed.status, allowed.stdout + allowed.stderr).toBe(0);
      }
      await migrate(db, { migrationsFolder: migrationDirectory });
      await checkStudyRemovalMaintenance(targetClient, undefined);
      if (initialState === "populated") {
        for (const table of preservedTables) {
          expect((await targetClient.query(`SELECT to_jsonb(t) AS row FROM ${table} t`)).rows)
            .toEqual(preservedRows[table]);
        }
        // Retrying after a deployment failure must not reapply the table drops.
        await migrate(db, { migrationsFolder: migrationDirectory });
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
          AND (tablename LIKE 'plog_%' OR tablename = 'learner_concept_states')
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
  }, 30_000);
});
