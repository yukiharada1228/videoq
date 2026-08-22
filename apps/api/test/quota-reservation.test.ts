import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  releaseAiAnswerReservation,
  reserveAiAnswerUsage,
} from "../src/repositories/quota-repository";
import {
  executeFakePgQuery,
  type MatchableSql,
  type PgQueryInput,
  type QueryCall,
} from "./helpers/pg-fake";

const calls: QueryCall[] = [];
const USER_ID = "00000000-0000-4000-8000-000000000005";
const PERIOD_START = "2026-08-01T00:00:00.000Z";
let remaining: number;

const rowsFor = (sql: MatchableSql): Record<string, unknown>[] => {
  if (sql.includes("UPDATE users") && sql.includes("RETURNING usage_period_start")) {
    if (remaining === 0) return [];
    remaining -= 1;
    return [{ usage_period_start: PERIOD_START }];
  }
  if (sql.includes("SELECT is_over_quota")) {
    return [{
      is_over_quota: false,
      ai_answers_limit: 1,
      used_ai_answers: 1 - remaining,
    }];
  }
  if (sql.includes("GREATEST") && sql.includes("usage_period_start")) {
    remaining += 1;
    return [];
  }
  return [];
};

vi.mock("pg", () => {
  class FakeClient {
    async connect() {}
    async end() {}
    async query(sqlOrConfig: PgQueryInput, args: unknown[] = []) {
      return executeFakePgQuery({ calls, sqlOrConfig, args, rowsFor });
    }
  }
  return { default: { Client: FakeClient } };
});

const env = {
  HYPERDRIVE: { connectionString: "postgres://fake/db" },
} as never;

describe("AI回答枠の原子的な予約", () => {
  beforeEach(() => {
    calls.length = 0;
    remaining = 1;
  });

  it("残り1件へ同時に2件予約しても成功するのは1件だけ", async () => {
    const results = await Promise.all([
      reserveAiAnswerUsage(env, USER_ID),
      reserveAiAnswerUsage(env, USER_ID),
    ]);

    expect(results.filter((result) => "reservation" in result)).toHaveLength(1);
    expect(results.filter((result) => "exceeded" in result)).toHaveLength(1);
    const reservationUpdates = calls.filter(
      (call) => call.sql.includes("UPDATE users") && call.sql.includes("RETURNING usage_period_start"),
    );
    expect(reservationUpdates).toHaveLength(2);
    expect(reservationUpdates.every((call) => call.args[0] === USER_ID)).toBe(true);
    expect(reservationUpdates[0].sql.includes("CASE")).toBe(true);
  });

  it("失敗時は同じ利用期間の予約を返却する", async () => {
    const result = await reserveAiAnswerUsage(env, USER_ID);
    expect("reservation" in result).toBe(true);
    if (!("reservation" in result)) return;

    await releaseAiAnswerReservation(env, result.reservation);

    expect(remaining).toBe(1);
    const release = calls.find((call) => call.sql.includes("GREATEST"))!;
    expect(release.args).toEqual([USER_ID, PERIOD_START]);
  });
});
