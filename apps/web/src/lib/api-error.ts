import { isTRPCClientError } from '@trpc/client';
import type { AppRouter } from '@videoq/trpc';

/** Application-level error for raw HTTP and local validation. */
export class ApiError extends Error {
  code: string;
  params?: Record<string, unknown>;
  details?: unknown;

  constructor(message: string, code: string, params?: Record<string, unknown>, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.params = params;
    this.details = details;
  }
}

/** Read application errors consistently without changing tRPC's native error type. */
export function getApiError(error: unknown): ApiError | undefined {
  if (error instanceof ApiError) return error;
  if (!isTRPCClientError<AppRouter>(error)) return undefined;
  return new ApiError(
    error.message,
    error.data?.applicationCode ?? error.data?.code ?? 'UNKNOWN',
    error.data?.params,
    error.data?.details,
  );
}
