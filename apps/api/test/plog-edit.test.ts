import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { plogRoutes } from "../src/features/plog/routes";
import { signAccessToken } from "./helpers/auth";

/**
 * PLOG 編集ルートの結線テスト。pg をモックし、認可・DAG・マージ SQL 順を検証する。
 */
import {
  executeFakePgQuery,
  type PgQueryInput,
  type QueryCall,
  type MatchableSql,
} from "./helpers/pg-fake";

const calls: QueryCall[] = [];
let rowsFor: (sql: MatchableSql, args: unknown[]) => Record<string, unknown>[];

vi.mock("pg", () => {
  class FakeClient {
    async connect() {}
    async end() {}
    async query(sqlOrConfig: unknown, args: unknown[] = []) {
      return executeFakePgQuery({
        calls,
        sqlOrConfig: sqlOrConfig as PgQueryInput,
        args,
        rowsFor,
      });
    }
  }
  return { default: { Client: FakeClient } };
});

const SECRET = "test-jwt-secret-plog-edit";
const ENV = {
  ENVIRONMENT: "development",
  AUTH_JWT_SECRET: SECRET,
  HYPERDRIVE: { connectionString: "postgres://fake/db" },
  OPENAI_API_KEY: "sk-test",
  OPENAI_BASE_URL: "https://openai.test/v1",
} as unknown as Record<string, unknown>;

const conceptNode = {
  id: 10,
  label: "AND",
  node_type: "object",
  intro_sec: 1.5,
  source_quote: "",
  opening_question: "",
  hint_ladder: "[]",
  misconceptions: "[]",
  canonical_order: "[]",
  worked_examples: "[]",
  waypoints: "[]",
};

beforeEach(() => {
  calls.length = 0;
  rowsFor = (sql) => {
    if (sql.includes("videos") && sql.includes("user_id")) return [{ id: 1 }];
    if (sql.includes("plog_build_jobs")) return [{ status: "ready" }];
    if (sql.includes("plog_concepts") && sql.includes("returning")) return [{ id: 10 }];
    if (sql.includes("plog_concepts") && sql.includes("plog_learning_objects"))
      return [conceptNode];
    if (sql.includes("plog_concepts") && sql.includes("node_type"))
      return [{ id: 10, label: "AND", node_type: "object", intro_sec: 1.5, source_quote: "" }];
    if (sql.includes("plog_edges") && sql.includes("returning")) return [{ id: 20 }];
    if (sql.includes("plog_edges") && sql.includes("source_label"))
      return [
        {
          id: 20,
          source_id: 10,
          target_id: 11,
          edge_type: "prerequisite_of",
          quote: "",
          source_label: "AND",
          target_label: "OR",
        },
      ];
    if (sql.includes("plog_edges") && sql.includes("edge_type") && !sql.includes("source_label"))
      return [];
    if (sql.includes("plog_edges") && sql.includes("quote"))
      return [
        { id: 20, source_id: 10, target_id: 11, edge_type: "prerequisite_of", quote: "" },
      ];
    if (sql.includes("plog_concepts") && sql.includes("video_id")) return [{ id: 10 }];
    return [];
  };
  vi.stubGlobal("fetch", async () =>
    new Response(JSON.stringify({ data: [{ embedding: [0.1, 0.2, 0.3] }] }), {
      status: 200,
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

async function token(userId = "00000000-0000-4000-8000-000000000005") {
  return signAccessToken(SECRET, userId);
}

const req = async (
  path: string,
  method: string,
  body?: unknown,
  t?: string,
) =>
  plogRoutes.request(
    path,
    {
      method,
      headers: {
        "content-type": "application/json",
        ...(t ? { "X-VideoQ-Test-User-Id": "00000000-0000-4000-8000-000000000005" } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    ENV,
  );

describe("POST /:id/plog/concepts/", () => {
  it("label 必須・作成で 201", async () => {
    const empty = await req(
      "/1/plog/concepts",
      "POST",
      { label: "  " },
      await token(),
    );
    expect(empty.status).toBe(400);
    expect(await empty.json()).toEqual({
      error: { code: "VALIDATION_ERROR", message: "label is required" },
    });

    const res = await req(
      "/1/plog/concepts",
      "POST",
      { label: "AND", node_type: "object", intro_sec: 1.5 },
      await token(),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    expect(body.id).toBe(10);
    expect(body.label).toBe("AND");
    expect(body.hint_count).toBe(0);
    expect(calls.some((c) => c.sql.includes("plog_concepts") && c.sql.includes("returning"))).toBe(true);
    expect(calls.some((c) => c.sql.includes("plog_learning_objects"))).toBe(
      true,
    );
  });

  it("rebuild 中は 400", async () => {
    rowsFor = (sql) => {
      if (sql.includes("videos") && sql.includes("user_id")) return [{ id: 1 }];
      if (sql.includes("plog_build_jobs")) return [{ status: "running" }];
      return [];
    };
    const res = await req(
      "/1/plog/concepts",
      "POST",
      { label: "X" },
      await token(),
    );
    expect(res.status).toBe(400);
    expect((await res.json()) as any).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "Cannot edit graph while a rebuild is in progress.",
      },
    });
  });

  it("他人の動画は 404", async () => {
    rowsFor = () => [];
    const res = await req(
      "/1/plog/concepts",
      "POST",
      { label: "X" },
      await token(),
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: { code: "VALIDATION_ERROR", message: "Video not found." },
    });
  });
});

describe("POST /:id/plog/edges/", () => {
  it("サイクルになる ordering 辺は 400", async () => {
    rowsFor = (sql, args) => {
      if (sql.includes("videos") && sql.includes("user_id")) return [{ id: 1 }];
      if (sql.includes("plog_build_jobs")) return [{ status: "ready" }];
      if (sql.includes("plog_concepts") && sql.includes("node_type"))
        return [
          { id: Number(args[0]), label: "n", node_type: "object", intro_sec: 0, source_quote: "" },
        ];
      if (sql.includes("plog_edges") && sql.includes("edge_type") && !sql.includes("source_label"))
        return [
          { id: 1, source_id: 11, target_id: 10, edge_type: "prerequisite_of" },
        ];
      return [];
    };
    const res = await req(
      "/1/plog/edges",
      "POST",
      { source_id: 10, target_id: 11, edge_type: "prerequisite_of" },
      await token(),
    );
    expect(res.status).toBe(400);
    expect((await res.json()) as any).toMatchObject({
      error: { message: "Ordering edges must form a DAG (cycle detected)." },
    });
  });

  it("正常作成は 201", async () => {
    rowsFor = (sql, args) => {
      if (sql.includes("videos") && sql.includes("user_id")) return [{ id: 1 }];
      if (sql.includes("plog_build_jobs")) return [{ status: "ready" }];
      if (sql.includes("plog_concepts") && sql.includes("node_type"))
        return [
          {
            id: Number(args[0]),
            label: "n",
            node_type: "object",
            intro_sec: 0,
            source_quote: "",
          },
        ];
      if (sql.includes("plog_edges") && sql.includes("returning")) return [{ id: 20 }];
      if (sql.includes("plog_edges") && sql.includes("edge_type") && !sql.includes("source_label"))
        return [];
      if (sql.includes("plog_edges") && sql.includes("source_label"))
        return [
          {
            id: 20,
            source_id: 10,
            target_id: 11,
            edge_type: "prerequisite_of",
            quote: "",
            source_label: "AND",
            target_label: "OR",
          },
        ];
      return [];
    };
    const res = await req(
      "/1/plog/edges",
      "POST",
      { source_id: 10, target_id: 11, edge_type: "prerequisite_of" },
      await token(),
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({
      id: 20,
      source_id: 10,
      target_id: 11,
      source_label: "AND",
      target_label: "OR",
    });
  });
});

describe("DELETE concept / learner-state", () => {
  it("concept 削除は依存順に消して {deleted:true}", async () => {
    rowsFor = (sql) => {
      if (sql.includes("videos") && sql.includes("user_id")) return [{ id: 1 }];
      if (sql.includes("plog_concepts")) return [{ id: 10 }];
      return [];
    };
    const res = await req(
      "/1/plog/concepts/10",
      "DELETE",
      undefined,
      await token(),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: true, id: 10 });
    const sqls = calls.map((c) => c.sql.replace(/\s+/g, " "));
    expect(sqls.some((s) => s.includes("delete from learner_concept_states"))).toBe(true);
    expect(sqls.some((s) => s.includes("delete from plog_learning_objects"))).toBe(true);
    expect(sqls.some((s) => s.includes("delete from plog_edges"))).toBe(true);
    expect(sqls.some((s) => s.includes("delete from plog_concepts"))).toBe(true);
  });

  it("learner-state リセットは {deleted:N}", async () => {
    rowsFor = (sql) => {
      if (sql.includes("videos") && sql.includes("user_id")) return [{ id: 1 }];
      if (sql.includes("learner_concept_states"))
        return [{}, {}, {}];
      return [];
    };
    const res = await req(
      "/1/plog/learner-state",
      "DELETE",
      undefined,
      await token(),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: 3 });
  });
});

describe("POST merge", () => {
  it("同一 ID は 400、成功時は survivor を返す", async () => {
    const same = await req(
      "/1/plog/concepts/10/merge",
      "POST",
      { absorb_id: 10 },
      await token(),
    );
    expect(same.status).toBe(400);

    rowsFor = (sql) => {
      if (sql.includes("videos") && sql.includes("user_id")) return [{ id: 1 }];
      if (sql.includes("plog_concepts") && sql.includes("node_type"))
        return [
          { id: 10, label: "AND", node_type: "object", intro_sec: 0, source_quote: "" },
        ];
      if (sql.includes("plog_concepts") && sql.includes(" in ("))
        return [{ id: 10 }, { id: 11 }];
      if (sql.includes("plog_concepts") && sql.includes("plog_learning_objects"))
        return [conceptNode];
      if (sql.includes("plog_learning_objects") && sql.includes("concept_id"))
        return [
          {
            opening_question: "",
            hint_ladder: "[]",
            misconceptions: "[]",
            canonical_order: "[]",
            worked_examples: "[]",
            waypoints: "[]",
          },
        ];
      if (sql.includes("plog_edges")) return [];
      if (sql.includes("learner_concept_states")) return [];
      return [];
    };
    const res = await req(
      "/1/plog/concepts/10/merge",
      "POST",
      { absorb_id: 11 },
      await token(),
    );
    expect(res.status).toBe(200);
    expect((await res.json()) as any).toMatchObject({ id: 10, label: "AND" });
    expect(calls.some((c) => c.sql.toLowerCase().includes("begin"))).toBe(true);
    expect(calls.some((c) => c.sql.toLowerCase().includes("commit"))).toBe(true);
  });
});
