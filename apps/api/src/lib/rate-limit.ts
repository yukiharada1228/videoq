import type { Context } from "hono";
import type { AppEnv, Bindings } from "../types/bindings";

/**
 * Django `DEFAULT_THROTTLE_RATES` と同一（settings.py）。
 * `chat_share_token_global` は settings にあるがコード未使用のため未移植。
 */
export const THROTTLE_RATES = {
  chat_share_token_ip: { limit: 100, windowSec: 3600 },
  chat_authenticated: { limit: 300, windowSec: 3600 },
  login_ip: { limit: 5, windowSec: 60 },
  login_username: { limit: 5, windowSec: 60 },
  signup_ip: { limit: 3, windowSec: 3600 },
  signup_email: { limit: 3, windowSec: 3600 },
  password_reset_ip: { limit: 3, windowSec: 3600 },
  password_reset_email: { limit: 3, windowSec: 3600 },
  email_change_user: { limit: 3, windowSec: 3600 },
  email_change_email: { limit: 3, windowSec: 3600 },
} as const;

export type ThrottleScope = keyof typeof THROTTLE_RATES;

export type ThrottleCheck = {
  scope: ThrottleScope;
  /** キャッシュキーの ident 部分（user id / IP / email 等）。空ならスキップ。 */
  ident: string | null | undefined;
};

export type ConsumeResult = { allowed: boolean; retryAfterSec: number };

type RateLimitBackend = {
  consume(key: string, limit: number, windowSec: number): Promise<ConsumeResult>;
};

/** テスト用メモリ実装（プロセス内。DO 未バインド時のフォールバックでもある）。 */
const memoryStore = new Map<string, number[]>();

export function resetMemoryRateLimits(): void {
  memoryStore.clear();
}

const memoryBackend: RateLimitBackend = {
  async consume(key, limit, windowSec) {
    const now = Date.now() / 1000;
    const history = memoryStore.get(key) ?? [];
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
    memoryStore.set(key, history);
    return { allowed: true, retryAfterSec: 0 };
  },
};

function getBackend(env: Bindings): RateLimitBackend {
  const ns = env.RATE_LIMITER;
  if (!ns) return memoryBackend;
  return {
    async consume(key, limit, windowSec) {
      const stub = ns.get(ns.idFromName(key));
      return stub.consume(limit, windowSec);
    },
  };
}

/** CF / プロキシ越しのクライアント IP（Django `get_ident` 相当の簡易版）。 */
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
 * 複数スコープを順に消費。いずれか超過なら最初の超過結果を返す（DRF と同順）。
 * ident が null/空のチェックはスキップ（ShareTokenIPThrottle が share 無しで None を返すのと同じ）。
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
    const result = await backend.consume(key, rate.limit, rate.windowSec);
    if (!result.allowed) return result;
  }
  return null;
}

/** DRF Throttled → custom_exception_handler（LIMIT_EXCEEDED）。 */
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
