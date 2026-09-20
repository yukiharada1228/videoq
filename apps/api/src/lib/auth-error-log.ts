import type { BetterAuthOptions } from "better-auth";

/**
 * Fields safe to put in Workers logs for Better Auth failures (SEC-9).
 * Omit message/detail: Postgres unique violations include the email in DETAIL.
 */
export type AuthApiErrorSummary = {
  name: string;
  pgCode?: string;
  constraint?: string;
  baCode?: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value !== null && typeof value === "object") {
    return value as Record<string, unknown>;
  }
  return null;
}

/** Walk Error.cause so DrizzleQueryError still yields the Postgres SQLSTATE. */
function pgFields(error: unknown): { pgCode?: string; constraint?: string } {
  let current: unknown = error;
  for (let i = 0; i < 4; i++) {
    const rec = asRecord(current);
    if (!rec) break;
    const out: { pgCode?: string; constraint?: string } = {};
    if (typeof rec.code === "string" && /^[0-9A-Z]{5}$/.test(rec.code)) {
      out.pgCode = rec.code;
    }
    if (
      typeof rec.constraint === "string" &&
      rec.constraint.length > 0 &&
      rec.constraint.length <= 128
    ) {
      out.constraint = rec.constraint;
    }
    if (out.pgCode || out.constraint) return out;
    current = rec.cause;
  }
  return {};
}

export function summarizeAuthApiError(error: unknown): AuthApiErrorSummary {
  const name = error instanceof Error ? error.name : "Error";
  const rec = asRecord(error) ?? {};
  const summary: AuthApiErrorSummary = { name, ...pgFields(error) };

  const body = rec.body;
  if (body && typeof body === "object") {
    const baCode = (body as { code?: unknown }).code;
    if (typeof baCode === "string" && baCode.length > 0 && baCode.length <= 128) {
      summary.baCode = baCode;
    }
  }

  return summary;
}

// Only exact, static library messages may reach logs. Other messages can embed
// callback URLs, provider responses, account ids or token-bearing SQL.
const SAFE_LIBRARY_MESSAGES = new Set([
  "Failed to parse state",
  "State not found",
  "INVALID_CALLBACK_REQUEST",
  "Code not found",
  "Invalid id token",
  "OAuth issuer mismatch",
  "Failed to create verification",
  "Failed to create session",
  "Failed to get user info",
  "Unable to get user info",
  "Unable to link account",
  "User not found",
  "Password not found",
  "Invalid password",
  "Introspection error:",
  "authorization code replay cleanup failed",
  "refresh token rotation replay failed",
  "failed to store refresh token rotation replay",
]);

/** Covers internal library catches that never reach onAPIError. */
export const authLogger: NonNullable<BetterAuthOptions["logger"]> = {
  level: "warn",
  log: (level, message, ...args) => {
    const entry = JSON.stringify({
      level,
      event: "better_auth_library_log",
      message: SAFE_LIBRARY_MESSAGES.has(message) ? message : "Authentication library event",
      // No raw message, stack, cause, request, provider data or string arguments.
      errors: args.filter((arg): arg is Error => arg instanceof Error)
        .slice(0, 3).map(summarizeAuthApiError),
    });
    if (level === "error") console.error(entry);
    else if (level === "warn") console.warn(entry);
    else console.log(entry);
  },
};
