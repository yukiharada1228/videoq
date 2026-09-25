import { readFileSync } from "node:fs";
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

const databaseUrl = process.env.QUOTA_TEST_DATABASE_URL;
const migrationDirectory = fileURLToPath(
  new URL("../drizzle", import.meta.url),
);
const journal = JSON.parse(
  readFileSync(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8"),
) as { entries: unknown[] };
const migrationDescribe = databaseUrl ? describe : describe.skip;

migrationDescribe("Drizzle greenfield migration chain", () => {
  it("applies every migration to an empty PostgreSQL database", async () => {
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

    try {
      await adminDb.execute(sql.raw(`CREATE DATABASE "${databaseName}"`));
      targetPool = new Pool({ connectionString: targetUrl.toString(), max: 1 });
      targetPool.on("error", () => {});
      // Match production's request-scoped Client: hooks and nested adapter
      // transactions must use the same connection, not wait for another slot.
      targetClient = await targetPool.connect();
      const db = drizzle(targetClient, { schema });

      await migrate(db, { migrationsFolder: migrationDirectory });

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
    }
  }, 30_000);
});
