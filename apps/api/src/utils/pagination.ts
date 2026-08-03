import type { Context } from "hono";
import type { AppEnv } from "../types/bindings";

/**
 * DRF StandardLimitOffsetPagination 互換（limit/offset, 既定20/最大100）。
 * レスポンス封筒: { count, next, previous, results }。next/previous は絶対 URL。
 */
export function parseLimitOffset(
  c: Context<AppEnv>,
  opts: { defaultLimit?: number; maxLimit?: number } = {},
): { limit: number; offset: number } {
  const defaultLimit = opts.defaultLimit ?? 20;
  const maxLimit = opts.maxLimit ?? 100;

  let limit = defaultLimit;
  const limitRaw = c.req.query("limit");
  if (limitRaw !== undefined) {
    const n = Number(limitRaw);
    if (Number.isInteger(n) && n > 0) limit = Math.min(n, maxLimit);
  }

  let offset = 0;
  const offsetRaw = c.req.query("offset");
  if (offsetRaw !== undefined) {
    const n = Number(offsetRaw);
    if (Number.isInteger(n) && n >= 0) offset = n;
  }
  return { limit, offset };
}

export type Page<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};

/** DRF LimitOffsetPagination の next/previous URL 生成規則を再現。 */
export function limitOffsetPage<T>(
  c: Context<AppEnv>,
  count: number,
  limit: number,
  offset: number,
  results: T[],
): Page<T> {
  const buildUrl = (newOffset: number): string => {
    const u = new URL(c.req.url);
    u.searchParams.set("limit", String(limit));
    if (newOffset <= 0) u.searchParams.delete("offset");
    else u.searchParams.set("offset", String(newOffset));
    return u.toString();
  };

  const next = offset + limit < count ? buildUrl(offset + limit) : null;
  const previous = offset > 0 ? buildUrl(Math.max(0, offset - limit)) : null;
  return { count, next, previous, results };
}
