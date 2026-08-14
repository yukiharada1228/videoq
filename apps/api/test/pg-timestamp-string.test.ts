import { describe, expect, it } from "vitest";
import { pgTable, timestamp } from "drizzle-orm/pg-core";
import {
  patchPgTimestampStringMode,
  timestampStringForDriver,
} from "../src/db/pg-timestamp-string";

describe("timestampStringForDriver", () => {
  it("converts Date to an ISO string", () => {
    const d = new Date("2026-08-14T04:00:00.000Z");
    expect(timestampStringForDriver(d)).toBe("2026-08-14T04:00:00.000Z");
  });

  it("leaves strings and nulls unchanged", () => {
    expect(timestampStringForDriver("2026-08-14T04:00:00.000Z")).toBe(
      "2026-08-14T04:00:00.000Z",
    );
    expect(timestampStringForDriver(null)).toBe(null);
    expect(timestampStringForDriver(undefined)).toBe(undefined);
  });
});

describe("patchPgTimestampStringMode", () => {
  patchPgTimestampStringMode();

  const table = pgTable("t", {
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }),
  });

  it("stringifies Date values on string-mode timestamp columns", () => {
    const d = new Date("2026-08-14T04:00:00.000Z");
    expect(table.createdAt.mapToDriverValue(d)).toBe("2026-08-14T04:00:00.000Z");
  });

  it("passes through ISO strings", () => {
    expect(table.createdAt.mapToDriverValue("2026-08-14T04:00:00.000Z")).toBe(
      "2026-08-14T04:00:00.000Z",
    );
  });
});
