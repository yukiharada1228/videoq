import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import type { Bindings } from "../types/bindings";
import { patchPgTimestampStringMode } from "./pg-timestamp-string";
import { schema } from "./schema";

patchPgTimestampStringMode();

export type Db = NodePgDatabase<typeof schema>;

/**
 * Neon への接続（Hyperdrive 経由）。
 *
 * 重要（要件 §11.4 / PoC #01d）: **接続 Client はリクエストごとに生成**し、
 * リクエストをまたいで使い回さない（global Pool 禁止）。
 * Drizzle は `withDb` 内でのみ `drizzle(client)` する。
 */
export async function withClient<T>(
  env: Bindings,
  fn: (client: pg.Client) => Promise<T>,
): Promise<T> {
  const client = new pg.Client({
    connectionString: env.HYPERDRIVE.connectionString,
  });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

/** Drizzle DB を per-request Client に載せる。 */
export async function withDb<T>(
  env: Bindings,
  fn: (db: Db, client: pg.Client) => Promise<T>,
): Promise<T> {
  return withClient(env, async (client) => {
    const db = drizzle(client, { schema });
    return fn(db, client);
  });
}

/** /ready 用の軽量な疎通チェック。 */
export async function pingDb(env: Bindings): Promise<boolean> {
  return withClient(env, async (client) => {
    const { rows } = await client.query("SELECT 1 AS ok");
    return rows[0]?.ok === 1;
  });
}
