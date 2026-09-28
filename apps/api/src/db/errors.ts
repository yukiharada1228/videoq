import { DrizzleQueryError } from "drizzle-orm";

export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  const cause = error instanceof DrizzleQueryError ? error.cause : error;
  return typeof cause === "object" && cause !== null && "code" in cause && cause.code === "23505"
    && (constraint === undefined || ("constraint" in cause && cause.constraint === constraint));
}
