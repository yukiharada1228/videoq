import { describe, it, expect, beforeEach, vi } from "vitest";
import { chatRoutes } from "../src/features/chat/routes";
import { buildChatHistoryCsv, csvDocument } from "../src/shared/csv";
import { signAccessToken } from "./helpers/auth";

/**
 * GET ?download=csv（ExportChatHistoryUseCase + write_chat_history_csv）と
 * DELETE（ResetChatHistoryUseCase）の結線テスト。pg はモックする。
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

const SECRET = "test-jwt-secret-history";
const ENV = {
  ENVIRONMENT: "development",
  AUTH_JWT_SECRET: SECRET,
  HYPERDRIVE: { connectionString: "postgres://fake/db" },
} as unknown as Record<string, unknown>;

const exportRows = [
  {
    created_at: "2026-05-01T12:34:56+00:00",
    question: "pgvector とは？",
    answer: 'これは "引用" と, カンマ\n改行を含む回答',
    is_shared_origin: false,
    feedback: "good",
    citations: JSON.stringify([
      { video_id: 60, title: "動画 A", start_time: "00:00:10", end_time: "00:00:20" },
    ]),
  },
  {
    created_at: "2026-05-02T00:00:01.123456+00:00",
    question: "second",
    answer: "answer",
    is_shared_origin: true,
    feedback: null,
    citations: "[]",
  },
];

const EXPECTED_CSV =
  "created_at,question,answer,is_shared_origin,citations,feedback\r\n" +
  "2026-05-01T12:34:56.000Z,pgvector とは？," +
  '"これは ""引用"" と, カンマ\n改行を含む回答",false,' +
  '"[{""id"":1,""video_id"":60,""title"":""動画 A"",""start_time"":""00:00:10"",""end_time"":""00:00:20""}]",good\r\n' +
  "2026-05-02T00:00:01.123Z,second,answer,true,[],\r\n";

const defaultRows = (sql: MatchableSql): Record<string, unknown>[] => {
  if (sql.includes("video_groups")) return [{ id: 1 }];
  if (sql.includes("chat_logs") && sql.includes("ORDER BY created_at ASC"))
    return exportRows;
  return [];
};

beforeEach(() => {
  calls.length = 0;
  rowsFor = defaultRows;
});

async function accessToken(userId = 5) {
  return signAccessToken(SECRET, userId);
}

const request = async (path: string, method: string, token?: string) =>
  chatRoutes.request(
    path,
    { method, headers: token ? { authorization: `Bearer ${token}` } : {} },
    ENV,
  );

describe("GET /api/chat/groups/:id/history/?download=csv", () => {
  it("CRLF・最小引用・compact JSON の CSV を返す", async () => {
    const res = await request(
      "/api/chat/groups/3/history?download=csv",
      "GET",
      await accessToken(),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("content-disposition")).toBe(
      'attachment; filename="chat_history_group_3.csv"',
    );

    const body = await res.text();
    expect(body).toBe(EXPECTED_CSV);
  });

  it("他人のグループは 404 Group not found.", async () => {
    rowsFor = (sql) =>
      sql.includes("video_groups") ? [] : defaultRows(sql);
    const res = await request(
      "/api/chat/groups/3/history?download=csv",
      "GET",
      await accessToken(),
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: { code: "VALIDATION_ERROR", message: "Group not found." },
    });
  });

  it("未認証は 401", async () => {
    const res = await request("/api/chat/groups/3/history?download=csv", "GET");
    expect(res.status).toBe(401);
  });
});

describe("CSV の細部", () => {
  it("QUOTE_MINIMAL: 区切り・引用符・改行を含む値だけ引用する", () => {
    expect(csvDocument([["a", "b,c", 'q"q', "line\nbreak", "cr\r"]])).toBe(
      'a,"b,c","q""q","line\nbreak","cr\r"\r\n',
    );
  });

  it("絵文字・制御文字・CRLF を含む入力を欠損なく出力する", () => {
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
    expect(csv).toContain("絵文字 🎥");
    expect(csv).toContain("surrogate pair 𝕏");
    expect(csv).toContain('""video_id"":60');
  });
});

describe("DELETE /api/chat/groups/:id/history/", () => {
  it("評価 → chat log の順に削除して 204 を返す", async () => {
    const res = await request("/api/chat/groups/3/history", "DELETE", await accessToken());
    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");

    const txnCalls = calls.filter((c) => !c.sql.includes("FROM auth_sessions"));
    const sqls = txnCalls.map((c) => c.sql.replace(/\s+/g, " ").trim());
    expect(sqls[0]).toBe("begin");
    expect(sqls[1]).toContain("video_groups");
    expect(sqls[2]).toContain("chat_log_evaluations");
    expect(sqls[3]).toContain("chat_logs");
    expect(sqls[4]).toBe("commit");
    expect(txnCalls[1].args.slice(0, 2)).toEqual([3, 5]);
  });

  it("グループが無ければ ROLLBACK して 404", async () => {
    rowsFor = () => [];
    const res = await request("/api/chat/groups/3/history", "DELETE", await accessToken());
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: { code: "VALIDATION_ERROR", message: "Group not found." },
    });
    expect(calls.some((c) => c.sql.includes("delete from"))).toBe(false);
  });

  it("未認証は 401", async () => {
    const res = await request("/api/chat/groups/3/history", "DELETE");
    expect(res.status).toBe(401);
  });
});
