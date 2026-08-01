import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { AppEnv } from "../types/bindings";

/**
 * 統一レスポンス封筒。移行後 API（Worker が自前で扱うルート）で使う。
 * プロキシ応答（未移行ルート）はそのまま透過し、この封筒では包まない。
 */
export type Ok<T> = { ok: true; data: T; requestId: string };
export type Err = {
  ok: false;
  error: { code: string; message: string };
  requestId: string;
};

export const ok = <T>(
  c: Context<AppEnv>,
  data: T,
  status: ContentfulStatusCode = 200,
) => c.json<Ok<T>>({ ok: true, data, requestId: c.get("requestId") }, status);

export const err = (
  c: Context<AppEnv>,
  status: ContentfulStatusCode,
  code: string,
  message: string,
) =>
  c.json<Err>(
    { ok: false, error: { code, message }, requestId: c.get("requestId") },
    status,
  );
