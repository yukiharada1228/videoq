import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../drizzle/0009_concurrency_guards.sql", import.meta.url),
  "utf8",
);

describe("concurrency guards migration", () => {
  it("adds idempotent processing reservations to videos", () => {
    expect(migration).toContain(
      'ADD COLUMN "processing_seconds" integer DEFAULT 0 NOT NULL',
    );
    expect(migration).toContain(
      'CONSTRAINT "videos_processing_seconds_check" CHECK (processing_seconds >= 0)',
    );
  });

  it("deduplicates active PLOG jobs before enforcing uniqueness", () => {
    const cleanup = migration.indexOf("WITH ranked AS");
    const uniqueIndex = migration.indexOf(
      'CREATE UNIQUE INDEX "plog_build_jobs_video_active_uniq"',
    );

    expect(cleanup).toBeGreaterThanOrEqual(0);
    expect(uniqueIndex).toBeGreaterThan(cleanup);
    expect(migration).toContain("WHERE status IN ('pending', 'running')");
  });
});
