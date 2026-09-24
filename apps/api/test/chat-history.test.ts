import { describe, it, expect, beforeEach, vi } from "vitest";
import { chatRoutes } from "../src/features/chat/routes";
import { csvRow, streamChatHistoryCsv } from "../src/shared/csv";
import type { ChatHistoryExportRow } from "../src/repositories/chat-repository";
import { signAccessToken } from "./helpers/auth";
import { requestTrpc, trpcData, trpcError } from "./helpers/trpc";

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
    created_at: new Date("2026-05-01T12:34:56+00:00"),
    user_id: "00000000-0000-4000-8000-000000000006",
    username: "student",
    email: "student@example.com",
    question: "pgvector とは？",
    answer: 'これは "引用" と, カンマ\n改行を含む回答',
    is_shared_origin: false,
    feedback: "good",
    citations: JSON.stringify([
      { video_id: 60, title: "動画 A", start_time: "00:00:10", end_time: "00:00:20" },
    ]),
    id: 1,
  },
  {
    created_at: new Date("2026-05-02T00:00:01.123456+00:00"),
    user_id: "00000000-0000-4000-8000-000000000005",
    username: "owner",
    email: "owner@example.com",
    question: "second",
    answer: "answer",
    is_shared_origin: true,
    feedback: null,
    citations: "[]",
    id: 2,
  },
];

const EXPECTED_CSV =
  "created_at,asked_by_user_id,asked_by_username,asked_by_email,question,answer,is_shared_origin,citations,feedback\r\n" +
  "2026-05-01T12:34:56.000Z,00000000-0000-4000-8000-000000000006,student,student@example.com,pgvector とは？," +
  '"これは ""引用"" と, カンマ\n改行を含む回答",false,' +
  '"[{""id"":1,""video_id"":60,""title"":""動画 A"",""start_time"":""00:00:10"",""end_time"":""00:00:20""}]",good\r\n' +
  "2026-05-02T00:00:01.123Z,,,,second,answer,true,[],\r\n";

const defaultRows = (sql: MatchableSql): Record<string, unknown>[] => {
  if (sql.includes("chat_logs") && sql.includes("ORDER BY chat_logs.created_at ASC"))
    return exportRows;
  if (sql.includes("video_courses")) return [{ id: 1 }];
  return [];
};

beforeEach(() => {
  calls.length = 0;
  rowsFor = defaultRows;
});

async function accessToken(userId = "00000000-0000-4000-8000-000000000005") {
  return signAccessToken(SECRET, userId);
}

const request = async (path: string, method: string, token?: string) => {
  const headers = token
    ? { "X-VideoQ-Test-User-Id": "00000000-0000-4000-8000-000000000005" }
    : {};
  if (path.endsWith(".csv")) {
    return chatRoutes.request(path, { method, headers }, ENV);
  }
  const url = new URL(path, "http://localhost");
  const courseId = Number(url.pathname.split("/")[2]);
  if (method === "GET") {
    return requestTrpc("chat.history", "query", {
      courseId,
      limit: Number(url.searchParams.get("limit") ?? 100),
      offset: Number(url.searchParams.get("offset") ?? 0),
    }, { headers }, ENV);
  }
  return requestTrpc("chat.resetHistory", "mutation", { courseId }, { headers }, ENV);
};

describe("GET /courses/:id/history.csv", () => {
  it("CRLF・最小引用・compact JSON の CSV を返す", async () => {
    const res = await request(
      "/courses/3/history.csv",
      "GET",
      await accessToken(),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("content-disposition")).toBe(
      'attachment; filename="chat_history_course_3.csv"',
    );
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("content-length")).toBeNull();

    const body = await res.text();
    expect(body).toBe(EXPECTED_CSV);
    const pageQuery = calls.find((call) =>
      call.sql.includes("ORDER BY chat_logs.created_at ASC"),
    );
    expect(pageQuery?.args.at(-1)).toBe(100);
  });

  it("100件ずつ keyset pagination しながら全行をストリームする", async () => {
    let pageNumber = 0;
    const makeRow = (id: number) => ({
      created_at:
        id === 100
          ? "2026-01-01 00:01:40.123456+00"
          : new Date(Date.UTC(2026, 0, 1, 0, 0, id)),
      user_id: "00000000-0000-4000-8000-000000000006",
      username: "student",
      email: "student@example.com",
      question: `question-${id}`,
      answer: `answer-${id}`,
      is_shared_origin: false,
      feedback: null,
      citations: "[]",
      id,
    });
    rowsFor = (sql) => {
      if (sql.includes("chat_logs") && sql.includes("ORDER BY chat_logs.created_at ASC")) {
        pageNumber += 1;
        return pageNumber === 1
          ? Array.from({ length: 100 }, (_, index) => makeRow(index + 1))
          : [makeRow(101)];
      }
      if (sql.includes("video_courses")) return [{ id: 3 }];
      return [];
    };

    const response = await request(
      "/courses/3/history.csv",
      "GET",
      await accessToken(),
    );
    const csv = await response.text();

    expect(response.status).toBe(200);
    expect(csv.split("\r\n")).toHaveLength(103);
    expect(csv).toContain("question-1");
    expect(csv).toContain("question-101");
    const pageQueries = calls.filter((call) =>
      call.sql.includes("ORDER BY chat_logs.created_at ASC"),
    );
    expect(pageQueries).toHaveLength(2);
    expect(pageQueries[1].sql.includes("chat_logs.created_at >")).toBe(true);
    expect(pageQueries[1].args).toContain("2026-01-01 00:01:40.123456+00");
    expect(pageQueries.every((call) => call.args.at(-1) === 100)).toBe(true);
  });

  it("他人の講座は 404 Course not found.", async () => {
    rowsFor = (sql) =>
      sql.includes("video_courses") ? [] : defaultRows(sql);
    const res = await request(
      "/courses/3/history.csv",
      "GET",
      await accessToken(),
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: { code: "NOT_FOUND", message: "Course not found." },
    });
  });

  it("未認証は 401", async () => {
    const res = await request("/courses/3/history.csv", "GET");
    expect(res.status).toBe(401);
  });
});

describe("GET /courses/:id/history", () => {
  it("質問者を返し、共有リンク由来は匿名として返す", async () => {
    rowsFor = (sql) => {
      if (sql.includes("video_courses")) return [{ id: 3 }];
      if (sql.includes("count(*)::int")) return [{ c: 2 }];
      if (sql.includes("chat_logs") && sql.includes("order by")) {
        return [
          {
            id: 10,
            course_id: 3,
            user_id: "00000000-0000-4000-8000-000000000006",
            username: "student",
            email: "student@example.com",
            question: "authenticated question",
            answer: "answer",
            citations: "[]",
            is_shared_origin: false,
            feedback: null,
            created_at: "2026-05-01T12:34:56+00:00",
          },
          {
            id: 11,
            course_id: 3,
            user_id: "00000000-0000-4000-8000-000000000005",
            username: "owner",
            email: "owner@example.com",
            question: "shared question",
            answer: "answer",
            citations: "[]",
            is_shared_origin: true,
            feedback: null,
            created_at: "2026-05-01T12:35:56+00:00",
          },
        ];
      }
      return [];
    };

    const res = await request("/courses/3/history?limit=10", "GET", await accessToken());
    expect(res.status).toBe(200);
    const body = await trpcData<{ data: Array<Record<string, unknown>> }>(res);
    expect(body.data[0].asked_by).toEqual({
      user_id: "00000000-0000-4000-8000-000000000006",
      username: "student",
      email: "student@example.com",
    });
    expect(body.data[1].asked_by).toBeNull();
  });
});

describe("CSV の細部", () => {
  it("QUOTE_MINIMAL: 区切り・引用符・改行を含む値だけ引用する", () => {
    expect(csvRow(["a", "b,c", 'q"q', "line\nbreak", "cr\r"])).toBe(
      'a,"b,c","q""q","line\nbreak","cr\r"\r\n',
    );
  });

  it("スプレッドシート数式として解釈される先頭文字を無害化する", () => {
    expect(
      csvRow(["=1+1", "+SUM(A1:A2)", "-2+3", "@command", "  =hidden", "\tformula"]),
    ).toBe(
      "'=1+1,'+SUM(A1:A2),'-2+3,'@command,'  =hidden,'\tformula\r\n",
    );
  });

  it("絵文字・制御文字・CRLF を含む入力を欠損なく出力する", async () => {
    const rows: ChatHistoryExportRow[] = [
      {
        created_at: "2026-05-01T12:34:56+00:00",
        asked_by: {
          user_id: "00000000-0000-4000-8000-000000000006",
          username: "student",
          email: "student@example.com",
        },
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
        asked_by: null,
        question: "",
        answer: "",
        is_shared_origin: true,
        feedback: null,
        citations: [],
      },
      {
        created_at: "2026-12-31T23:59:59.000100+00:00",
        asked_by: {
          user_id: "00000000-0000-4000-8000-000000000007",
          username: "learner",
          email: "learner@example.com",
        },
        question: "surrogate pair 𝕏 と 全角，句読点。",
        answer: "セミコロン; と パイプ| は引用されない",
        is_shared_origin: false,
        feedback: "bad",
        citations: [
          { id: 1, video_id: 7, title: "", start_time: "0:00:00", end_time: "0:00:00" },
        ],
      },
    ];
    const csv = await new Response(streamChatHistoryCsv((async function* () {
      yield* rows;
    })())).text();
    expect(csv).toContain("絵文字 🎥");
    expect(csv).toContain("surrogate pair 𝕏");
    expect(csv).toContain('""video_id"":60');
  });
});

describe("chat.resetHistory", () => {
  it("chat log の連鎖削除で評価も削除して success を返す", async () => {
    const res = await request("/courses/3/history", "DELETE", await accessToken());
    expect(res.status).toBe(200);
    expect(await trpcData(res)).toEqual({ success: true });

    const txnCalls = calls.filter((c) => !c.sql.includes("FROM session"));
    const sqls = txnCalls.map((c) => c.sql.replace(/\s+/g, " ").trim());
    expect(sqls[0]).toBe("begin");
    expect(sqls[1]).toContain("video_courses");
    expect(sqls[2]).toContain("chat_logs");
    expect(sqls[3]).toBe("commit");
    expect(txnCalls[1].args.slice(0, 2)).toEqual([3, "00000000-0000-4000-8000-000000000005"]);
  });

  it("講座が無ければ ROLLBACK して 404", async () => {
    rowsFor = () => [];
    const res = await request("/courses/3/history", "DELETE", await accessToken());
    expect(res.status).toBe(404);
    expect(await trpcError(res)).toEqual({
      code: "NOT_FOUND",
      message: "Course not found.",
    });
    expect(calls.some((c) => c.sql.includes("delete from"))).toBe(false);
  });

  it("未認証は 401", async () => {
    const res = await request("/courses/3/history", "DELETE");
    expect(res.status).toBe(401);
  });
});
