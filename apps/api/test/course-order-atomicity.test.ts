import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  executeFakePgQuery,
  type MatchableSql,
  type PgQueryInput,
  type QueryCall,
} from "./helpers/pg-fake";

const calls: QueryCall[] = [];

vi.mock("pg", () => {
  class FakeClient {
    async connect() {}
    async end() {}
    async query(sqlOrConfig: PgQueryInput, args: unknown[] = []) {
      return executeFakePgQuery({
        calls,
        sqlOrConfig,
        args,
        rowsFor(sql: MatchableSql) {
          if (sql.includes("INSERT INTO video_groups")) return [{ id: 9 }];
          return [];
        },
      });
    }
  }
  return { default: { Client: FakeClient } };
});

import { createGroup } from "../src/repositories/group-repository";

beforeEach(() => calls.splice(0));

describe("グループ表示順の採番", () => {
  it("同じ所有者の作成をuser行ロックで直列化する", async () => {
    await expect(
      createGroup(
        { HYPERDRIVE: { connectionString: "postgres://fake/db" } } as never,
        "user-1",
        "group",
        "",
      ),
    ).resolves.toBe(9);

    const lockIndex = calls.findIndex(
      (call) => call.sql.includes("SELECT 1 FROM users") && call.sql.includes("FOR UPDATE"),
    );
    const insertIndex = calls.findIndex((call) => call.sql.includes("INSERT INTO video_groups"));
    expect(lockIndex).toBeGreaterThanOrEqual(0);
    expect(lockIndex).toBeLessThan(insertIndex);
  });
});
