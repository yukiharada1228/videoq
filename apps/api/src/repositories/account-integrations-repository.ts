import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { RpcOutputMap } from "@videoq/trpc";
import { withDb } from "../db/pool";
import { apikey, oauthClient, oauthConsent } from "../db/schema";
import { toUtcIso } from "../shared/datetime";
import type { Bindings } from "../types/bindings";

const permissionsSchema = z.object({ videoq: z.array(z.string()) });

/** Session-owned display metadata only. Never select key hashes or client secrets. */
export async function listIntegrationApiKeys(
  env: Bindings, userId: string,
): Promise<RpcOutputMap["account.integrationApiKeys"]> {
  return withDb(env, async (db) => {
    const rows = await db.select({
      id: apikey.id, config_id: apikey.configId, name: apikey.name,
      start: apikey.start, prefix: apikey.prefix, permissions: apikey.permissions,
      last_used_at: apikey.lastRequest, created_at: apikey.createdAt,
    }).from(apikey).where(and(
      eq(apikey.referenceId, userId), inArray(apikey.configId, ["default", "read-write"]),
    )).orderBy(desc(apikey.createdAt), apikey.id);
    return rows.map((row) => {
      let permissions: unknown;
      try { permissions = JSON.parse(row.permissions ?? "null"); } catch { /* Unknown permissions display as read-only. */ }
      const parsed = permissionsSchema.safeParse(permissions);
      return {
        id: row.id, config_id: row.config_id, name: row.name ?? "",
        prefix: row.start ?? row.prefix ?? "vq_",
        access_level: parsed.success && parsed.data.videoq.includes("read") && parsed.data.videoq.includes("write")
          ? "all" as const : "read_only" as const,
        last_used_at: row.last_used_at ? toUtcIso(row.last_used_at) : null,
        created_at: toUtcIso(row.created_at),
      };
    });
  });
}

/** One query also resolves client names; the auth adapter's implicit 100-row cap is not used. */
export async function listConnectedApps(
  env: Bindings, userId: string,
): Promise<RpcOutputMap["account.connectedApps"]> {
  return withDb(env, async (db) => {
    const rows = await db.select({
      id: oauthConsent.id, client_id: oauthConsent.clientId,
      client_name: oauthClient.name, scopes: oauthConsent.scopes,
      created_at: oauthConsent.createdAt,
    }).from(oauthConsent)
      .leftJoin(oauthClient, eq(oauthClient.clientId, oauthConsent.clientId))
      .where(eq(oauthConsent.userId, userId))
      .orderBy(desc(oauthConsent.createdAt), oauthConsent.id);
    return rows.map((row) => ({
      id: row.id, client_id: row.client_id, client_name: row.client_name || row.client_id,
      scope: row.scopes.join(" "),
      issued_at: row.created_at ? toUtcIso(row.created_at) : null,
    }));
  });
}
