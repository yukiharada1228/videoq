import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { z } from "@hono/zod-openapi";
import type { AppEnv } from "../types/bindings";

/** 新 API 契約のエラー封筒。 */
export const errorBodySchema = z
  .object({
    error: z.object({
      code: z.string().openapi({ example: "VALIDATION_ERROR" }),
      message: z.string().openapi({ example: "Invalid request" }),
      details: z.unknown().optional(),
    }),
  })
  .openapi("ErrorResponse");

export type ErrorBody = z.infer<typeof errorBodySchema>;

export function toErrorBody(
  code: string,
  message: string,
  details?: unknown,
): ErrorBody {
  return {
    error: {
      code,
      message,
      ...(details !== undefined ? { details } : {}),
    },
  };
}

/**
 * OpenAPI feature 向けの typed error。error-handler が `{ error: { code, message, details? } }` へ変換する。
 */
export class ApiError extends Error {
  readonly status: ContentfulStatusCode;
  readonly code: string;
  readonly expose: boolean;
  readonly details?: unknown;

  constructor(
    status: ContentfulStatusCode,
    code: string,
    message: string,
    opts: { expose?: boolean; details?: unknown } = {},
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.expose = opts.expose ?? true;
    this.details = opts.details;
  }
}

export const apiBadRequest = (message: string, code = "VALIDATION_ERROR", details?: unknown) =>
  new ApiError(400, code, message, { details });

export const apiUnauthorized = (message = "Unauthorized", code = "UNAUTHORIZED") =>
  new ApiError(401, code, message);

export const apiForbidden = (message = "Forbidden", code = "FORBIDDEN") =>
  new ApiError(403, code, message);

export const apiNotFound = (message = "Not found", code = "NOT_FOUND") =>
  new ApiError(404, code, message);

export const apiServiceUnavailable = (
  message: string,
  code = "SERVICE_UNAVAILABLE",
  details?: unknown,
) => new ApiError(503, code, message, { details });

/** ハンドラから直接 JSON エラーを返す（throw しない multipart / auth 等向け）。 */
export const apiError = (
  c: Context<AppEnv>,
  status: ContentfulStatusCode,
  message: string,
  code = "VALIDATION_ERROR",
  details?: unknown,
) => c.json(toErrorBody(code, message, details), status);

/** フィールドバリデーション。details は field → string[]。 */
export const validationError = (
  c: Context<AppEnv>,
  fields: Record<string, readonly string[]>,
) => {
  const firstField = Object.keys(fields)[0];
  const message = fields[firstField]?.[0] ?? "Invalid input.";
  return apiError(c, 400, message, "VALIDATION_ERROR", fields);
};
