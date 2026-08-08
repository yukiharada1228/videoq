/**
 * Fake pg.Client helpers for Vitest.
 * Drizzle passes QueryConfig `{ text, values, rowMode: "array" }` (not a bare SQL string).
 */

export type PgQueryInput =
  | string
  | { text?: string; values?: unknown[]; name?: string; rowMode?: string };

/** Case-insensitive, quote-stripped `includes` for matcher-friendly SQL. */
export type MatchableSql = string & {
  includes(search: string): boolean;
};

export function normalizePgQuery(
  sqlOrConfig: PgQueryInput,
  args: unknown[] = [],
): { sql: string; args: unknown[]; rowMode?: string } {
  if (typeof sqlOrConfig === "string") {
    return { sql: sqlOrConfig, args };
  }
  return {
    sql: String(sqlOrConfig?.text ?? ""),
    args: Array.isArray(sqlOrConfig?.values) ? sqlOrConfig.values : args,
    rowMode: sqlOrConfig?.rowMode,
  };
}

export function matchableSql(sql: string): MatchableSql {
  const stripped = sql.replace(/"/g, "");
  const upper = stripped.toUpperCase();
  return Object.assign(new String(stripped) as unknown as string, {
    includes(search: string) {
      return upper.includes(String(search).replace(/"/g, "").toUpperCase());
    },
    toString() {
      return stripped;
    },
    valueOf() {
      return stripped;
    },
  }) as MatchableSql;
}

export type QueryCall = { sql: MatchableSql; args: unknown[] };

function toPgRows(
  rawRows: Record<string, unknown>[] | unknown[][],
  rowMode?: string,
): unknown[] {
  if (rowMode !== "array") return rawRows;
  return rawRows.map((r) => (Array.isArray(r) ? r : Object.values(r as Record<string, unknown>)));
}

/** JWT test helper (`helpers/auth.ts`) が埋め込む既定 sid。 */
export const TEST_AUTH_SESSION_ID = "test-session";

/** @deprecated Legacy JWT session probe — always false after Better Auth migration. */
export function isAuthSessionActiveSql(_sql: MatchableSql): boolean {
  return false;
}

/**
 * Shared FakeClient.query implementation. Call from inside `vi.mock("pg")` factories.
 */
export function executeFakePgQuery(opts: {
  calls?: QueryCall[];
  sqlOrConfig: PgQueryInput;
  args?: unknown[];
  rowsFor: (sql: MatchableSql, args: unknown[]) => Record<string, unknown>[] | unknown[][];
  rowCountFor?: (
    sql: MatchableSql,
    args: unknown[],
    rows: Record<string, unknown>[],
  ) => number;
  /** When true (default), empty rows for `test-session` sid probes count as active. */
  defaultActiveTestSession?: boolean;
}) {
  const { sql, args: a, rowMode } = normalizePgQuery(opts.sqlOrConfig, opts.args ?? []);
  const matchSql = matchableSql(sql);
  opts.calls?.push({ sql: matchSql, args: a });
  if (/^\s*(BEGIN|COMMIT|ROLLBACK)\s*$/i.test(sql)) {
    return { rows: [], rowCount: 0 };
  }
  let rawRows = opts.rowsFor(matchSql, a);
  if (
    opts.defaultActiveTestSession !== false &&
    rawRows.length === 0 &&
    isAuthSessionActiveSql(matchSql) &&
    a[0] === TEST_AUTH_SESSION_ID
  ) {
    rawRows = [{ ok: 1 }];
  }
  const objectRows = rawRows.every(Array.isArray)
    ? []
    : (rawRows as Record<string, unknown>[]);
  const rows = toPgRows(rawRows, rowMode);
  const rowCount = opts.rowCountFor
    ? opts.rowCountFor(matchSql, a, objectRows)
    : rows.length;
  return { rows, rowCount };
}

/**
 * Build a FakeClient class that records calls and delegates rows via `rowsFor`.
 * Use inside `vi.mock("pg", ...)`.
 */
export function createFakeClientClass(opts: {
  calls: QueryCall[];
  rowsFor: (sql: MatchableSql, args: unknown[]) => Record<string, unknown>[] | unknown[][];
  rowCountFor?: (
    sql: MatchableSql,
    args: unknown[],
    rows: Record<string, unknown>[],
  ) => number;
}) {
  return class FakeClient {
    async connect() {}
    async end() {}
    async query(sqlOrConfig: PgQueryInput, args: unknown[] = []) {
      return executeFakePgQuery({
        calls: opts.calls,
        sqlOrConfig,
        args,
        rowsFor: opts.rowsFor,
        rowCountFor: opts.rowCountFor,
      });
    }
  };
}
