import { embedding as testEmbedding } from "./helpers/embedding";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { ProcedureName, RpcInputMap } from "@videoq/trpc";
import { signAccessToken } from "./helpers/auth";
import { requestTrpc, trpcData, trpcError } from "./helpers/trpc";

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
    if (sql.includes("FROM pg_attribute")) return [{ type_name: "vector", dimensions: 1536 }];
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
    new Response(JSON.stringify({ data: [{ index: 0, embedding: testEmbedding(0.1, 0.2, 0.3) }] }), {
      status: 200,
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

async function token(userId = "00000000-0000-4000-8000-000000000005") {
  return signAccessToken(SECRET, userId);
}

const mutate = async <Name extends ProcedureName>(
  procedure: Name,
  input: RpcInputMap[Name],
  t?: string,
) => {
  const headers = t
    ? { "X-VideoQ-Test-User-Id": "00000000-0000-4000-8000-000000000005" }
    : {};
  return requestTrpc(procedure, "mutation", input, { headers }, ENV);
};

describe("plog.createConcept", () => {
  it("label 必須・正常作成", async () => {
    const empty = await mutate(
      "plog.createConcept",
      { videoId: 1, label: "  " },
      await token(),
    );
    expect(empty.status).toBe(400);
    expect(await trpcError(empty)).toMatchObject({
      code: "VALIDATION_ERROR",
      message: "label is required",
    });

    const res = await mutate(
      "plog.createConcept",
      { videoId: 1, label: "AND", nodeType: "object", introSec: 1.5 },
      await token(),
    );
    expect(res.status).toBe(200);
    const body = await trpcData<any>(res);
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
      if (sql.includes("FROM pg_attribute")) return [{ type_name: "vector", dimensions: 1536 }];
      if (sql.includes("videos") && sql.includes("user_id")) return [{ id: 1 }];
      if (sql.includes("plog_build_jobs")) return [{ status: "running" }];
      return [];
    };
    const res = await mutate(
      "plog.createConcept",
      { videoId: 1, label: "X" },
      await token(),
    );
    expect(res.status).toBe(400);
    expect(await trpcError(res)).toEqual({
      code: "VALIDATION_ERROR",
      message: "Cannot edit graph while a rebuild is in progress.",
    });
  });

  it("他人の動画は 404", async () => {
    rowsFor = () => [];
    const res = await mutate(
      "plog.createConcept",
      { videoId: 1, label: "X" },
      await token(),
    );
    expect(res.status).toBe(404);
    expect(await trpcError(res)).toEqual({
      code: "VALIDATION_ERROR",
      message: "Video not found.",
    });
  });
});

describe("plog.createEdge", () => {
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
    const res = await mutate(
      "plog.createEdge",
      { videoId: 1, sourceId: 10, targetId: 11, edgeType: "prerequisite_of" },
      await token(),
    );
    expect(res.status).toBe(400);
    expect(await trpcError(res)).toMatchObject({
      message: "Ordering edges must form a DAG (cycle detected).",
    });
  });

  it("正常作成は 200", async () => {
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
    const res = await mutate(
      "plog.createEdge",
      { videoId: 1, sourceId: 10, targetId: 11, edgeType: "prerequisite_of" },
      await token(),
    );
    expect(res.status).toBe(200);
    expect(await trpcData(res)).toMatchObject({
      id: 20,
      source_id: 10,
      target_id: 11,
      source_label: "AND",
      target_label: "OR",
    });
    expect(
      calls.some(
        (call) => call.sql.includes("SELECT 1 FROM videos") && call.sql.includes("FOR UPDATE"),
      ),
    ).toBe(true);
  });
});

describe("PLOG delete and learner-state procedures", () => {
  it("concept 削除は依存順に消して {deleted:true}", async () => {
    rowsFor = (sql) => {
      if (sql.includes("FROM pg_attribute")) return [{ type_name: "vector", dimensions: 1536 }];
      if (sql.includes("videos") && sql.includes("user_id")) return [{ id: 1 }];
      if (sql.includes("plog_concepts")) return [{ id: 10 }];
      return [];
    };
    const res = await mutate(
      "plog.deleteConcept",
      { videoId: 1, conceptId: 10 },
      await token(),
    );
    expect(res.status).toBe(200);
    expect(await trpcData(res)).toEqual({ deleted: true, id: 10 });
    const sqls = calls.map((c) => c.sql.replace(/\s+/g, " "));
    expect(sqls.some((s) => s.includes("delete from learner_concept_states"))).toBe(true);
    expect(sqls.some((s) => s.includes("delete from plog_learning_objects"))).toBe(true);
    expect(sqls.some((s) => s.includes("delete from plog_edges"))).toBe(true);
    expect(sqls.some((s) => s.includes("delete from plog_concepts"))).toBe(true);
  });

  it("learner-state リセットは {deleted:N}", async () => {
    rowsFor = (sql) => {
      if (sql.includes("FROM pg_attribute")) return [{ type_name: "vector", dimensions: 1536 }];
      if (sql.includes("videos") && sql.includes("user_id")) return [{ id: 1 }];
      if (sql.includes("learner_concept_states"))
        return [{}, {}, {}];
      return [];
    };
    const res = await mutate(
      "plog.resetLearnerState",
      { videoId: 1 },
      await token(),
    );
    expect(res.status).toBe(200);
    expect(await trpcData(res)).toEqual({ deleted: 3 });
  });
});

describe("plog.mergeConcepts", () => {
  it("同一 ID は 400、成功時は survivor を返す", async () => {
    const same = await mutate(
      "plog.mergeConcepts",
      { videoId: 1, survivorId: 10, absorbId: 10 },
      await token(),
    );
    expect(same.status).toBe(400);

    rowsFor = (sql) => {
      if (sql.includes("FROM pg_attribute")) return [{ type_name: "vector", dimensions: 1536 }];
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
    const res = await mutate(
      "plog.mergeConcepts",
      { videoId: 1, survivorId: 10, absorbId: 11 },
      await token(),
    );
    expect(res.status).toBe(200);
    expect(await trpcData(res)).toMatchObject({ id: 10, label: "AND" });
    expect(calls.some((c) => c.sql.toLowerCase().includes("begin"))).toBe(true);
    expect(calls.some((c) => c.sql.toLowerCase().includes("commit"))).toBe(true);
  });
});
