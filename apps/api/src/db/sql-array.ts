import { sql, type SQL } from "drizzle-orm";

/**
 * Drizzle expands JS arrays as Postgres records `($1,$2,…)` — not arrays.
 * Use a vetted `ARRAY[…]::cast[]` literal for ANY/unnest.
 */
export function sqlNumberArray(
  values: readonly number[],
  cast: "int" | "bigint" = "bigint",
): SQL {
  const nums = values.map((v) => {
    const n = Number(v);
    if (!Number.isInteger(n)) {
      throw new Error(`invalid integer for sql array: ${v}`);
    }
    return n;
  });
  if (nums.length === 0) return sql.raw(`ARRAY[]::${cast}[]`);
  return sql.raw(`ARRAY[${nums.join(",")}]::${cast}[]`);
}
