import type { ContentfulStatusCode } from "hono/utils/http-status";
import { z } from "zod";

/** 新 API 契約のエラー封筒。 */
export const errorBodySchema = z
  .object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.unknown().optional(),
    }),
  });

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
 * Application error converted to the shared JSON envelope by error-handler.
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

export const apiNotFound = (message = "Not found", code = "NOT_FOUND") =>
  new ApiError(404, code, message);

export const apiConflict = (message: string, code = "CONFLICT") =>
  new ApiError(409, code, message);

export const apiServiceUnavailable = (
  message: string,
  code = "SERVICE_UNAVAILABLE",
  details?: unknown,
) => new ApiError(503, code, message, { details });
