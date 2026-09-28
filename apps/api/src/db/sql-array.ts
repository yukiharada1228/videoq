import { sql, type SQL } from "drizzle-orm";

/**
 * Drizzle expands JS arrays as Postgres records `($1,$2,…)` — not arrays.
 * Use a vetted `ARRAY[…]::cast[]` literal for ANY/unnest.
 */
export function sqlNumberArray(
  values: readonly number[],
  cast: "int" | "bigint" = "bigint",
): SQL {
  for (const value of values) {
    if (
      !Number.isSafeInteger(value)
      || (cast === "int" && (value < -2147483648 || value > 2147483647))
    ) {
      throw new Error(`invalid integer for sql array: ${value}`);
    }
  }
  return sql.raw(`ARRAY[${values.join(",")}]::${cast}[]`);
}
