import { createHash } from "node:crypto";
import type pg from "pg";
import { pruneExpiredHistory, type ConsumeResult, type RateLimitBackend } from "../lib/rate-limit";

/** Row locks serialize the same key across replicas, including first use. */
export function postgresRateLimitBackend(pool: pg.Pool): RateLimitBackend {
  const digest = (key: string) => createHash("sha256").update(key).digest("hex");
  async function locked<T>(key: string, windowSec: number,
    update: (history: number[], now: number) => { history: number[]; result: T }) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const hashed = digest(key);
      const { rows } = await client.query<{ history: number[]; now_sec: number }>(`INSERT INTO runtime_rate_limits (key, history, window_sec, expires_at)
        VALUES ($1, '[]'::jsonb, $2, now())
        ON CONFLICT (key) DO UPDATE SET key = EXCLUDED.key
        RETURNING history, EXTRACT(EPOCH FROM clock_timestamp())::float8 AS now_sec`, [hashed, windowSec]);
      // Use the database clock after acquiring the row lock, so clock skew
      // between Kubernetes nodes cannot change the shared window.
      const now = rows[0].now_sec;
      const { history, result } = update(pruneExpiredHistory(rows[0].history, now, windowSec), now);
      // Keep even empty rows until expiry: deleting them here can race with a
      // concurrent first-use INSERT waiting on the unique constraint.
      await client.query(`UPDATE runtime_rate_limits SET history = $2::jsonb, window_sec = $3,
        expires_at = to_timestamp($4) WHERE key = $1`,
      [hashed, JSON.stringify(history), windowSec, (history[0] ?? now) + windowSec]);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  }
  const backend: RateLimitBackend = {
    async consume(key, limit, windowSec, cost = 1) {
      if (!Number.isSafeInteger(cost) || cost < 1 || !Number.isSafeInteger(limit) || limit < 1
        || !Number.isSafeInteger(windowSec) || windowSec < 1) throw new Error("Invalid rate limit");
      return locked<ConsumeResult>(key, windowSec, (history, now) => {
        if (history.length + cost > limit) {
          const oldest = history.at(-1);
          return { history, result: { allowed: false, retryAfterSec: oldest === undefined
            ? windowSec : Math.max(1, Math.ceil(windowSec - (now - oldest))) } };
        }
        return { history: [...Array<number>(cost).fill(now), ...history],
          result: { allowed: true, retryAfterSec: 0 } };
      });
    },
    async release(key, windowSec, cost) {
      await locked(key, windowSec, history => ({ history: history.slice(cost), result: undefined }));
    },
    async snapshot(key) {
      const { rows } = await pool.query<{ history: number[]; window_sec: number; now_sec: number }>(
        `SELECT history, window_sec, EXTRACT(EPOCH FROM clock_timestamp())::float8 AS now_sec
         FROM runtime_rate_limits WHERE key = $1`, [digest(key)]);
      if (!rows.length) return null;
      const history = pruneExpiredHistory(rows[0].history, rows[0].now_sec, rows[0].window_sec);
      return history.length ? { count: history.length, lastRequestMs: history[0] * 1000 } : null;
    },
    async record(key, windowSec) { await backend.consume(key, Number.MAX_SAFE_INTEGER, windowSec); },
  };
  return backend;
}
