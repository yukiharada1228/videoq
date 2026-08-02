import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { SignJWT } from "jose";
import { plogRoutes } from "../src/routes/plog";

/**
 * PLOG 編集ルートの結線テスト。pg をモックし、認可・DAG・マージ SQL 順を検証する。
 */
type QueryCall = { sql: string; args: unknown[] };
const calls: QueryCall[] = [];
let rowsFor: (sql: string, args: unknown[]) => Record<string, unknown>[];

vi.mock("pg", () => {
  class FakeClient {
    async connect() {}
    async end() {}
    async query(sql: string, args: unknown[] = []) {
      calls.push({ sql, args });
      const rows = rowsFor(sql, args);
      return { rows, rowCount: rows.length };
    }
  }
  return { default: { Client: FakeClient } };
});

const SECRET = "test-jwt-secret-plog-edit";
const ENV = {
  ENVIRONMENT: "development",
  JWT_SECRET: SECRET,
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
    if (sql.includes("SELECT 1 FROM app_video")) return [{ "?column?": 1 }];
    if (sql.includes("FROM app_plogbuildjob")) return [{ status: "ready" }];
    if (sql.includes("INSERT INTO app_plogconcept")) return [{ id: 10 }];
    if (sql.includes("FROM app_plogconcept c") && sql.includes("LEFT JOIN"))
      return [conceptNode];
    if (sql.includes("SELECT id, label, node_type"))
      return [{ id: 10, label: "AND", node_type: "object", intro_sec: 1.5, source_quote: "" }];
    if (sql.includes("INSERT INTO app_plogedge")) return [{ id: 20 }];
    if (sql.includes("FROM app_plogedge e") && sql.includes("JOIN app_plogconcept"))
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
    if (sql.includes("SELECT id, source_id, target_id, edge_type FROM app_plogedge"))
      return [];
    if (sql.includes("SELECT id, source_id, target_id, edge_type, quote"))
      return [
        { id: 20, source_id: 10, target_id: 11, edge_type: "prerequisite_of", quote: "" },
      ];
    if (sql.includes("SELECT id FROM app_plogconcept WHERE id = $1 AND video_id = $2"))
      return [{ id: 10 }];
    if (sql.includes("SELECT 1 FROM app_plogconcept WHERE id = $1 AND video_id = $2"))
      return [{ "?column?": 1 }];
    return [];
  };
  vi.stubGlobal("fetch", async () =>
    new Response(JSON.stringify({ data: [{ embedding: [0.1, 0.2, 0.3] }] }), {
      status: 200,
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

async function token(userId = 5) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ token_type: "access", user_id: userId, jti: "j" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(new TextEncoder().encode(SECRET));
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
        ...(t ? { authorization: `Bearer ${t}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    ENV,
  );

describe("POST /api/videos/:id/plog/concepts/", () => {
  it("label 必須・作成で 201", async () => {
    const empty = await req(
      "/api/videos/1/plog/concepts/",
      "POST",
      { label: "  " },
      await token(),
    );
    expect(empty.status).toBe(400);
    expect(await empty.json()).toEqual({
      error: { code: "VALIDATION_ERROR", message: "label is required" },
    });

    const res = await req(
      "/api/videos/1/plog/concepts/",
      "POST",
      { label: "AND", node_type: "object", intro_sec: 1.5 },
      await token(),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    expect(body.id).toBe(10);
    expect(body.label).toBe("AND");
    expect(body.hint_count).toBe(0);
    expect(calls.some((c) => c.sql.includes("INSERT INTO app_plogconcept"))).toBe(true);
    expect(calls.some((c) => c.sql.includes("INSERT INTO app_ploglearningobject"))).toBe(
      true,
    );
  });

  it("rebuild 中は 400", async () => {
    rowsFor = (sql) => {
      if (sql.includes("SELECT 1 FROM app_video")) return [{ "?column?": 1 }];
      if (sql.includes("FROM app_plogbuildjob")) return [{ status: "running" }];
      return [];
    };
    const res = await req(
      "/api/videos/1/plog/concepts/",
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
      "/api/videos/1/plog/concepts/",
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

describe("POST /api/videos/:id/plog/edges/", () => {
  it("サイクルになる ordering 辺は 400", async () => {
    rowsFor = (sql, args) => {
      if (sql.includes("SELECT 1 FROM app_video")) return [{ "?column?": 1 }];
      if (sql.includes("FROM app_plogbuildjob")) return [{ status: "ready" }];
      if (sql.includes("SELECT id, label, node_type"))
        return [
          { id: Number(args[0]), label: "n", node_type: "object", intro_sec: 0, source_quote: "" },
        ];
      if (sql.includes("SELECT id, source_id, target_id, edge_type FROM app_plogedge"))
        return [
          { id: 1, source_id: 11, target_id: 10, edge_type: "prerequisite_of" },
        ];
      return [];
    };
    const res = await req(
      "/api/videos/1/plog/edges/",
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
      if (sql.includes("SELECT 1 FROM app_video")) return [{ "?column?": 1 }];
      if (sql.includes("FROM app_plogbuildjob")) return [{ status: "ready" }];
      if (sql.includes("SELECT id, label, node_type"))
        return [
          {
            id: Number(args[0]),
            label: "n",
            node_type: "object",
            intro_sec: 0,
            source_quote: "",
          },
        ];
      if (sql.includes("SELECT id, source_id, target_id, edge_type FROM app_plogedge"))
        return [];
      if (sql.includes("INSERT INTO app_plogedge")) return [{ id: 20 }];
      if (sql.includes("FROM app_plogedge e") && sql.includes("JOIN"))
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
      "/api/videos/1/plog/edges/",
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
      if (sql.includes("SELECT 1 FROM app_video")) return [{ "?column?": 1 }];
      if (sql.includes("SELECT 1 FROM app_plogconcept")) return [{ "?column?": 1 }];
      return [];
    };
    const res = await req(
      "/api/videos/1/plog/concepts/10/",
      "DELETE",
      undefined,
      await token(),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: true, id: 10 });
    const sqls = calls.map((c) => c.sql.replace(/\s+/g, " "));
    expect(sqls.some((s) => s.includes("DELETE FROM app_learnerconceptstate"))).toBe(true);
    expect(sqls.some((s) => s.includes("DELETE FROM app_ploglearningobject"))).toBe(true);
    expect(sqls.some((s) => s.includes("DELETE FROM app_plogedge"))).toBe(true);
    expect(sqls.some((s) => s.includes("DELETE FROM app_plogconcept"))).toBe(true);
  });

  it("learner-state リセットは {deleted:N}", async () => {
    rowsFor = (sql) => {
      if (sql.includes("SELECT 1 FROM app_video")) return [{ "?column?": 1 }];
      // DELETE の rowCount は FakeClient が rows.length を返すので、削除件数を模す
      if (sql.includes("DELETE FROM app_learnerconceptstate"))
        return [{}, {}, {}]; // rowCount=3
      return [];
    };
    const res = await req(
      "/api/videos/1/plog/learner-state/",
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
      "/api/videos/1/plog/concepts/10/merge/",
      "POST",
      { absorb_id: 10 },
      await token(),
    );
    expect(same.status).toBe(400);

    rowsFor = (sql) => {
      if (sql.includes("SELECT 1 FROM app_video")) return [{ "?column?": 1 }];
      if (sql.includes("SELECT id, label, node_type"))
        return [
          { id: 10, label: "AND", node_type: "object", intro_sec: 0, source_quote: "" },
        ];
      if (sql.includes("id = ANY($2::bigint[])")) return [{ id: 10 }, { id: 11 }];
      if (sql.includes("FROM app_plogconcept c") && sql.includes("LEFT JOIN"))
        return [conceptNode];
      if (sql.includes("FROM app_ploglearningobject WHERE concept_id"))
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
      // edge/learner loops: empty lists
      if (sql.includes("FROM app_plogedge")) return [];
      if (sql.includes("FROM app_learnerconceptstate")) return [];
      return [];
    };
    const res = await req(
      "/api/videos/1/plog/concepts/10/merge/",
      "POST",
      { absorb_id: 11 },
      await token(),
    );
    expect(res.status).toBe(200);
    expect((await res.json()) as any).toMatchObject({ id: 10, label: "AND" });
    expect(calls.some((c) => c.sql === "BEGIN")).toBe(true);
    expect(calls.some((c) => c.sql === "COMMIT")).toBe(true);
  });
});
