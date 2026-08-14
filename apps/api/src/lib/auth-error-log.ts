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
