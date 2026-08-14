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

export function summarizeAuthApiError(error: unknown): AuthApiErrorSummary {
  const name = error instanceof Error ? error.name : "Error";
  const rec =
    error !== null && typeof error === "object"
      ? (error as Record<string, unknown>)
      : {};
  const summary: AuthApiErrorSummary = { name };

  if (typeof rec.code === "string" && /^[0-9A-Z]{5}$/.test(rec.code)) {
    summary.pgCode = rec.code;
  }

  if (
    typeof rec.constraint === "string" &&
    rec.constraint.length > 0 &&
    rec.constraint.length <= 128
  ) {
    summary.constraint = rec.constraint;
  }

  const body = rec.body;
  if (body && typeof body === "object") {
    const baCode = (body as { code?: unknown }).code;
    if (typeof baCode === "string" && baCode.length > 0 && baCode.length <= 128) {
      summary.baCode = baCode;
    }
  }

  return summary;
}
