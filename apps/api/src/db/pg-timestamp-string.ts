import { PgTimestampString } from "drizzle-orm/pg-core";

let patched = false;

/**
 * Better Auth passes `Date` for `type: "date"` fields. This schema uses
 * `timestamp({ mode: "string" })`, whose column class does not stringify Dates.
 *
 * On Workers, `pg` may fail to encode a Date (`util/types.isDate` / Buffer
 * path), which Better Auth surfaces as `unable_to_create_user` on Google signup.
 */
export function timestampStringForDriver(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  return value;
}

/** Patch once per isolate so insert/update on any Drizzle client is covered. */
export function patchPgTimestampStringMode(): void {
  if (patched) return;
  patched = true;
  const proto = PgTimestampString.prototype as unknown as {
    mapToDriverValue: (value: unknown) => unknown;
  };
  proto.mapToDriverValue = timestampStringForDriver;
}
