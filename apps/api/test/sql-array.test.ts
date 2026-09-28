import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { sqlNumberArray } from "../src/db/sql-array";

const dialect = new PgDialect();

describe("PostgreSQL numeric arrays", () => {
  it.each([
    { values: [], cast: "bigint" as const, expected: "ARRAY[]::bigint[]" },
    { values: [1, Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER], cast: "bigint" as const,
      expected: "ARRAY[1,9007199254740991,-9007199254740991]::bigint[]" },
    { values: [-2147483648, 0, 2147483647], cast: "int" as const, expected: "ARRAY[-2147483648,0,2147483647]::int[]" },
  ])("preserves supported integers in $expected", ({ values, cast, expected }) => {
    expect(dialect.sqlToQuery(sqlNumberArray(values, cast))).toMatchObject({ sql: expected, params: [] });
  });

  it.each([NaN, Infinity, -Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1, 1e100])(
    "rejects %s before constructing an invalid or rounded array", value => {
      expect(() => sqlNumberArray([value])).toThrow(/invalid integer/);
    },
  );

  it.each([-2147483649, 2147483648])("rejects out-of-range int4 value %s", value => {
    expect(() => sqlNumberArray([value], "int")).toThrow(/invalid integer/);
    expect(() => sqlNumberArray([value], "bigint")).not.toThrow();
  });
});
