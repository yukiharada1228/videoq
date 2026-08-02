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

/**
 * Django `create_error_response` 互換のエラー（{"error":{code,message}}）。
 * 移行済みルートの手動エラー（400/403/404 等）で使う。
 */
export const apiError = (
  c: Context<AppEnv>,
  status: ContentfulStatusCode,
  message: string,
  code = "VALIDATION_ERROR",
) => c.json({ error: { code, message } }, status);

/**
 * DRF serializer バリデーションエラー互換（custom_exception_handler 経由）。
 * {"error":{code:"VALIDATION_ERROR", message:<最初のエラー>, fields:{field:[...]}}} を 400 で返す。
 */
export const drfValidationError = (
  c: Context<AppEnv>,
  fields: Record<string, string[]>,
) => {
  const firstField = Object.keys(fields)[0];
  const message = fields[firstField]?.[0] ?? "Invalid input.";
  return c.json(
    { error: { code: "VALIDATION_ERROR", message, fields } },
    400,
  );
};
