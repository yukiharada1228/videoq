import type { Context } from "hono";
import type { AppEnv, Bindings } from "../types/bindings";

/**
 * VideoQ API のスコープ別レート制限。
 */
export const THROTTLE_RATES = {
  chat_share_token_ip: { limit: 100, periodSec: 3600 },
  chat_authenticated: { limit: 300, periodSec: 3600 },
  login_ip: { limit: 5, periodSec: 60 },
  login_username: { limit: 5, periodSec: 60 },
  signup_ip: { limit: 3, periodSec: 3600 },
  signup_email: { limit: 3, periodSec: 3600 },
  password_reset_ip: { limit: 3, periodSec: 3600 },
  password_reset_email: { limit: 3, periodSec: 3600 },
  email_change_user: { limit: 3, periodSec: 3600 },
  email_change_email: { limit: 3, periodSec: 3600 },
} as const;

export type ThrottleScope = keyof typeof THROTTLE_RATES;

export type ThrottleCheck = {
  scope: ThrottleScope;
  /** キャッシュキーの ident 部分（user id / IP / email 等）。空ならスキップ。 */
  ident: string | null | undefined;
};

export type ConsumeResult = { allowed: boolean; retryAfterSec: number };

export type RateLimitBackend = {
  consume(key: string, limit: number, windowSec: number): Promise<ConsumeResult>;
};

/** Unit tests must explicitly inject this isolated backend through Bindings. */
export function createMemoryRateLimitBackend(): RateLimitBackend {
  const store = new Map<string, number[]>();
  return {
    async consume(key, limit, windowSec) {
      const now = Date.now() / 1000;
      const history = store.get(key) ?? [];
      const cutoff = now - windowSec;
      while (history.length > 0 && history[history.length - 1]! <= cutoff) {
        history.pop();
      }
      if (history.length >= limit) {
        const oldest = history[history.length - 1]!;
        return {
          allowed: false,
          retryAfterSec: Math.max(1, Math.ceil(windowSec - (now - oldest))),
        };
      }
      history.unshift(now);
      store.set(key, history);
      return { allowed: true, retryAfterSec: 0 };
    },
  };
}

let injectedTestBackend: RateLimitBackend | undefined;

/** Explicit process-local injection for unit tests. Never call from Worker code. */
export function setRateLimitBackendForTests(
  backend: RateLimitBackend | undefined,
): void {
  injectedTestBackend = backend;
}

const unavailableBackend: RateLimitBackend = {
  async consume() {
    // Missing rate limiting must never turn into unlimited access.
    return { allowed: false, retryAfterSec: 60 };
  },
};

function getBackend(env: Bindings): RateLimitBackend {
  const ns = env.RATE_LIMITER;
  if (!ns) return injectedTestBackend ?? unavailableBackend;
  return {
    async consume(key, limit, windowSec) {
      const stub = ns.get(ns.idFromName(key));
      return stub.consume(limit, windowSec);
    },
  };
}

/** Cloudflare / プロキシの転送ヘッダーからクライアント IP を解決する。 */
export function clientIp(c: Context<AppEnv>): string {
  return (
    c.req.header("CF-Connecting-IP")?.trim() ||
    c.req.header("True-Client-IP")?.trim() ||
    c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

export function normalizeThrottleIdent(value: string, lowercase: boolean): string {
  const trimmed = value.trim();
  return lowercase ? trimmed.toLowerCase() : trimmed;
}

/**
 * 複数スコープを順に消費し、最初の超過結果を返す。
 * ident が null または空のチェックはスキップする。
 */
export async function enforceThrottles(
  env: Bindings,
  checks: ThrottleCheck[],
): Promise<ConsumeResult | null> {
  const backend = getBackend(env);
  for (const check of checks) {
    if (check.ident === null || check.ident === undefined || check.ident === "") {
      continue;
    }
    const rate = THROTTLE_RATES[check.scope];
    const key = `throttle_${check.scope}_${check.ident}`;
    const result = await backend.consume(key, rate.limit, rate.periodSec);
    if (!result.allowed) return result;
  }
  return null;
}

/** レート制限超過を共通エラー形式で返す。 */
export function throttledResponse(
  c: Context<AppEnv>,
  result: ConsumeResult,
): Response {
  const message = `Request was throttled. Expected available in ${result.retryAfterSec} seconds.`;
  return c.json(
    { error: { code: "LIMIT_EXCEEDED", message } },
    429,
    { "Retry-After": String(result.retryAfterSec) },
  );
}
