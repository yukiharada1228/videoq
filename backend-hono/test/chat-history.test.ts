import { describe, it, expect, beforeEach, vi } from "vitest";
import { SignJWT } from "jose";
import { chatRoutes } from "../src/routes/chat";
import { buildChatHistoryCsv, csvDocument } from "../src/utils/csv";
import { pyJsonDumps } from "../src/utils/py-json";

/**
 * GET ?download=csv（ExportChatHistoryUseCase + write_chat_history_csv）と
 * DELETE（ResetChatHistoryUseCase）の結線テスト。pg はモックする。
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

const SECRET = "test-jwt-secret-history";
const ENV = {
  ENVIRONMENT: "development",
  JWT_SECRET: SECRET,
  LEGACY_API_ORIGIN: "https://legacy.test",
  HYPERDRIVE: { connectionString: "postgres://fake/db" },
} as unknown as Record<string, unknown>;

const exportRows = [
  {
    ts: "2026-05-01T12:34:56",
    micros: "000000",
    question: "pgvector とは？",
    answer: 'これは "引用" と, カンマ\n改行を含む回答',
    is_shared_origin: false,
    feedback: "good",
    citations: JSON.stringify([
      { video_id: 60, title: "動画 A", start_time: "00:00:10", end_time: "00:00:20" },
    ]),
  },
  {
    ts: "2026-05-02T00:00:01",
    micros: "123456",
    question: "second",
    answer: "answer",
    is_shared_origin: true,
    feedback: null,
    citations: "[]",
  },
];

/** Python 側 (csv.writer + json.dumps) の出力そのもの。 */
const PYTHON_CSV =
  "created_at,question,answer,is_shared_origin,citations,feedback\r\n" +
  "2026-05-01T12:34:56+00:00,pgvector とは？," +
  '"これは ""引用"" と, カンマ\n改行を含む回答",false,' +
  '"[{""id"": 1, ""video_id"": 60, ""title"": ""動画 A"", ""start_time"": ""00:00:10"", ""end_time"": ""00:00:20""}]",good\r\n' +
  "2026-05-02T00:00:01.123456+00:00,second,answer,true,[],\r\n";

const sha256Hex = async (text: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
};

const defaultRows = (sql: string): Record<string, unknown>[] => {
  if (sql.includes("SELECT 1 FROM app_videogroup")) return [{ "?column?": 1 }];
  if (sql.includes("FROM app_chatlog") && sql.includes("ORDER BY created_at ASC"))
    return exportRows;
  return [];
};

beforeEach(() => {
  calls.length = 0;
  rowsFor = defaultRows;
});

async function accessToken(userId = 5) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ token_type: "access", user_id: userId, jti: "j" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(new TextEncoder().encode(SECRET));
}

const request = async (path: string, method: string, token?: string) =>
  chatRoutes.request(
    path,
    { method, headers: token ? { authorization: `Bearer ${token}` } : {} },
    ENV,
  );

describe("GET /api/chat/groups/:id/history/?download=csv", () => {
  it("Python csv.writer と同じ CSV（CRLF・最小引用・UTC isoformat）を返す", async () => {
    const res = await request(
      "/api/chat/groups/3/history/?download=csv",
      "GET",
      await accessToken(),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("content-disposition")).toBe(
      'attachment; filename="chat_history_group_3.csv"',
    );

    // 固定ベクタ: 同じ入力を Python の csv.writer + json.dumps(ensure_ascii=False)
    // に通した実出力。CRLF・最小引用・引用符の二重化まで一致させる。
    const body = await res.text();
    expect(body).toBe(PYTHON_CSV);
    expect(await sha256Hex(body)).toBe(
      "2641f6d29584c37037e96cbe268aa767b85b93dd0a2dd50e1b59ce5013d9c6e5",
    );
  });

  it("他人のグループは 404 Group not found.", async () => {
    rowsFor = (sql) =>
      sql.includes("SELECT 1 FROM app_videogroup") ? [] : defaultRows(sql);
    const res = await request(
      "/api/chat/groups/3/history/?download=csv",
      "GET",
      await accessToken(),
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: { code: "VALIDATION_ERROR", message: "Group not found." },
    });
  });

  it("未認証は 401", async () => {
    const res = await request("/api/chat/groups/3/history/?download=csv", "GET");
    expect(res.status).toBe(401);
  });
});

describe("CSV / json.dumps の細部", () => {
  it("QUOTE_MINIMAL: 区切り・引用符・改行を含む値だけ引用する", () => {
    expect(csvDocument([["a", "b,c", 'q"q', "line\nbreak", "cr\r"]])).toBe(
      'a,"b,c","q""q","line\nbreak","cr\r"\r\n',
    );
  });

  it("json.dumps 既定の区切り（', ' / ': '）と非 ASCII そのまま出力", () => {
    expect(pyJsonDumps([{ a: 1, b: "日本語", c: null }])).toBe(
      '[{"a": 1, "b": "日本語", "c": null}]',
    );
  });

  it("絵文字・制御文字・CRLF を含む入力でも Python 出力と SHA-256 が一致する", async () => {
    const csv = buildChatHistoryCsv([
      {
        created_at: "2026-05-01T12:34:56+00:00",
        question: '改行\nと\r\nCRLF, カンマ "引用" を含む',
        answer: "絵文字 🎥 と タブ\t と バックスラッシュ \\ と 制御文字\u0001",
        is_shared_origin: false,
        feedback: "good",
        citations: [
          {
            id: 1,
            video_id: 60,
            title: '動画 "A", 第1回',
            start_time: "00:00:10,500",
            end_time: "00:00:20,000",
          },
          { id: 2, video_id: 61, title: "改行\nタイトル", start_time: null, end_time: null },
        ],
      },
      {
        created_at: "2026-05-02T00:00:01.123456+00:00",
        question: "",
        answer: "",
        is_shared_origin: true,
        feedback: null,
        citations: [],
      },
      {
        created_at: "2026-12-31T23:59:59.000100+00:00",
        question: "surrogate pair 𝕏 と 全角，句読点。",
        answer: "セミコロン; と パイプ| は引用されない",
        is_shared_origin: false,
        feedback: "bad",
        citations: [
          { id: 1, video_id: 7, title: "", start_time: "0:00:00", end_time: "0:00:00" },
        ],
      },
    ]);
    // 同じ行を Python の csv.writer + json.dumps に通した出力の SHA-256。
    expect(await sha256Hex(csv)).toBe(
      "588ae5b2f13f1d1236b73ec9ca78c91e53fde2b626ed2653c811b01b7098ee71",
    );
  });
});

describe("DELETE /api/chat/groups/:id/history/", () => {
  it("評価 → chat log の順に削除して 204 を返す", async () => {
    const res = await request("/api/chat/groups/3/history/", "DELETE", await accessToken());
    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");

    const sqls = calls.map((c) => c.sql.replace(/\s+/g, " ").trim());
    expect(sqls[0]).toBe("BEGIN");
    expect(sqls[1]).toContain("SELECT 1 FROM app_videogroup WHERE id = $1 AND user_id = $2");
    expect(sqls[2]).toContain("DELETE FROM app_chatlogevaluation");
    expect(sqls[3]).toContain("DELETE FROM app_chatlog WHERE group_id = $1");
    expect(sqls[4]).toBe("COMMIT");
    expect(calls[1].args).toEqual([3, 5]);
  });

  it("グループが無ければ ROLLBACK して 404", async () => {
    rowsFor = () => [];
    const res = await request("/api/chat/groups/3/history/", "DELETE", await accessToken());
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: { code: "VALIDATION_ERROR", message: "Group not found." },
    });
    expect(calls.map((c) => c.sql)).toContain("ROLLBACK");
    expect(calls.some((c) => c.sql.includes("DELETE FROM"))).toBe(false);
  });

  it("未認証は 401", async () => {
    const res = await request("/api/chat/groups/3/history/", "DELETE");
    expect(res.status).toBe(401);
  });
});
