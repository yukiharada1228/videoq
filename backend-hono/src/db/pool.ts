import pg from "pg";
import type { Bindings } from "../types/bindings";

/**
 * Neon への接続（Hyperdrive 経由）。
 *
 * 重要（要件 §11.4 / PoC #01d）: Cloudflare の指針に従い、**接続 Client は
 * リクエストごとに生成**し、リクエストをまたいで使い回さない（global Pool 禁止）。
 * Hyperdrive がコネクションプーリングを担うため、Worker 側は都度 Client でよい。
 *
 * 使い方:
 *   await withClient(env, async (client) => {
 *     const { rows } = await client.query("SELECT 1");
 *   });
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

/** /ready 用の軽量な疎通チェック。 */
export async function pingDb(env: Bindings): Promise<boolean> {
  return withClient(env, async (client) => {
    const { rows } = await client.query("SELECT 1 AS ok");
    return rows[0]?.ok === 1;
  });
}
