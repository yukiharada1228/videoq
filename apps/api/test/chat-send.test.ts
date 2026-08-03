import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { SignJWT } from "jose";
import { chatRoutes } from "../src/routes/chat";

/**
 * ルート全体（認証 → 検証 → group/quota → RAG → ChatLog → 応答）の結線テスト。
 * SQL は pg をモックして「どの文が・どの引数で」発行されたかを検証する
 * （実 SQL の意味論は docs の psql 検証で別途確認済み）。
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

const SECRET = "test-jwt-secret-chat";
const ENV = {
  ENVIRONMENT: "development",
  JWT_SECRET: SECRET,
  LEGACY_API_ORIGIN: "https://legacy.test",
  HYPERDRIVE: { connectionString: "postgres://fake/db" },
} as unknown as Record<string, unknown>;

const defaultRows = (sql: MatchableSql): Record<string, unknown>[] => {
  if (sql.includes("is_over_quota") || sql.includes("ai_answers_limit"))
    return [{ isOverQuota: false, aiAnswersLimit: null, usedAiAnswers: 0 }];
  if (sql.includes("app_videogroupmember"))
    return [{ videoId: 60 }, { videoId: 61 }];
  if (sql.includes("app_videogroup"))
    return [{ id: 3, userId: 5, description: "Group about pgvector" }];
  if (sql.includes("videoq_scenes"))
    return [
      {
        content: "scene text A",
        video_id: 60,
        langchain_metadata: {
          video_title: "Video A",
          start_time: "00:00:10",
          end_time: "00:00:20",
        },
      },
    ];
  if (sql.includes("app_chatlog") && sql.includes("returning"))
    return [{ id: 99, feedback: null }];
  return [];
};

beforeEach(() => {
  calls.length = 0;
  rowsFor = defaultRows;
});
afterEach(() => vi.unstubAllGlobals());

async function accessToken(userId = 5) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ token_type: "access", user_id: userId, jti: "j" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(new TextEncoder().encode(SECRET));
}

async function post(
  path: string,
  body: unknown,
  opts: { token?: string; env?: Record<string, unknown>; headers?: Record<string, string> } = {},
) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...(opts.headers ?? {}),
  };
  if (opts.token) headers["authorization"] = `Bearer ${opts.token}`;
  return chatRoutes.request(
    path,
    { method: "POST", headers, body: JSON.stringify(body) },
    { ...ENV, ...(opts.env ?? {}) },
  );
}

const OPENAI_ENV = { OPENAI_API_KEY: "sk-test", OPENAI_BASE_URL: "https://openai.test/v1" };
const SQS_ENV = {
  SQS_QUEUE_URL: "https://sqs.ap-northeast-1.amazonaws.com/1/videoq",
  AWS_ACCESS_KEY_ID: "AKIA",
  AWS_SECRET_ACCESS_KEY: "secret",
};

/** 埋め込み → チャット生成の順で応答するスタブ。 */
function stubOpenAi(opts: { stream?: boolean; content?: string }) {
  const requests: { url: string; body: Record<string, unknown>; raw: string }[] = [];
  vi.stubGlobal("fetch", async (input: string | Request, init?: RequestInit) => {
    // aws4fetch は Request オブジェクトで呼ぶため両形に対応する。
    const isRequest = typeof input !== "string";
    const url = isRequest ? (input as Request).url : input;
    const raw = isRequest
      ? await (input as Request).clone().text()
      : String(init?.body ?? "");
    let body: Record<string, unknown> = {};
    try {
      body = JSON.parse(raw);
    } catch {
      body = {}; // SQS は form-encoded
    }
    requests.push({ url, body, raw });
    if (url.includes("sqs")) {
      return new Response("<MessageId>m-1</MessageId>", { status: 200 });
    }
    if (url.endsWith("/embeddings")) {
      return new Response(JSON.stringify({ data: [{ embedding: [0.1, 0.2] }] }), {
        status: 200,
      });
    }
    const text = opts.content ?? "Answer [1].";
    if (!opts.stream) {
      return new Response(JSON.stringify({ choices: [{ message: { content: text } }] }), {
        status: 200,
      });
    }
    const enc = new TextEncoder();
    return new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          for (const part of [text.slice(0, 3), text.slice(3)]) {
            controller.enqueue(
              enc.encode(
                `data: ${JSON.stringify({ choices: [{ delta: { content: part } }] })}\n\n`,
              ),
            );
          }
          controller.enqueue(enc.encode("data: [DONE]\n\n"));
          controller.close();
        },
      }),
      { status: 200 },
    );
  });
  return requests;
}

const sseEvents = (text: string) =>
  text
    .split("\n\n")
    .filter((f) => f.startsWith("data: "))
    .map((f) => JSON.parse(f.slice(6)));

describe("POST /api/chat/messages（非ストリーミング）", () => {
  it("認証なしは 401", async () => {
    const res = await post("/api/chat/messages", {
      messages: [{ role: "user", content: "hi" }],
    });
    expect(res.status).toBe(401);
  });

  it("バリデーション失敗は {error:{code,message,fields}}", async () => {
    const res = await post("/api/chat/messages", {}, { token: await accessToken() });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "This field is required.",
        fields: { messages: ["This field is required."] },
      },
    });
  });

  it("messages が空配列なら 400 Messages are empty.（DB 到達前）", async () => {
    const res = await post("/api/chat/messages", { messages: [] }, { token: await accessToken() });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: { code: "VALIDATION_ERROR", message: "Messages are empty." },
    });
  });

  it("mode=study は Worker 内 PLOG gateway（ready グラフ無しは 409 PLOG_NOT_READY）", async () => {
    const prev = rowsFor;
    rowsFor = (sql, args) => {
      if (sql.includes("app_plogbuildjob")) return [{ status: "pending" }];
      return prev(sql, args);
    };
    const kv = {
      get: async () => null,
      put: async () => {},
    };
    const res = await post(
      "/api/chat/messages",
      {
        messages: [{ role: "user", content: "hi" }],
        group_id: 3,
        mode: "study",
        study_session_id: "s1",
      },
      {
        token: await accessToken(),
        env: { ...ENV, OPENAI_API_KEY: "sk-test", STUDY_SESSION: kv },
      },
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: {
        code: "PLOG_NOT_READY",
        message: "PLOG is not ready for this group's videos. Wait for build or rebuild.",
      },
    });
  });

  it("group_id ありで RAG → citations / chat_log_id を返し、利用量を記録する", async () => {
    const requests = stubOpenAi({});
    const res = await post(
      "/api/chat/messages",
      { messages: [{ role: "user", content: "何が起きた?" }], group_id: 3 },
      {
        token: await accessToken(),
        env: { ...OPENAI_ENV, ...SQS_ENV },
        headers: { "Accept-Language": "ja,en;q=0.8" },
      },
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      role: "assistant",
      content: "Answer [1].",
      citations: [
        {
          id: 1,
          video_id: 60,
          title: "Video A",
          start_time: "00:00:10",
          end_time: "00:00:20",
        },
      ],
      chat_log_id: 99,
      feedback: null,
    });

    // 検索は user_id + 許可 video_id + k=20 で絞る
    const search = calls.find((c) => c.sql.includes("videoq_scenes"))!;
    expect(search.args).toEqual([5, 60, 61, "[0.1,0.2]", 20]);

    // プロンプトは ja ロケール + group_context + 参照シーンを含む
    const chat = requests.find((r) => r.url.endsWith("/chat/completions"))!;
    const messages = chat.body.messages as { role: string; content: string }[];
    expect(messages[0].content).toContain("# グループ情報");
    expect(messages[0].content).toContain("Group about pgvector");
    expect(messages[0].content).toContain("[1] Video A 00:00:10 - 00:00:20\nscene text A");
    expect(messages[1]).toEqual({ role: "user", content: "何が起きた?" });

    // ChatLog は citations（id なし）と retrieved_contexts を保存
    const insert = calls.find((c) => c.sql.includes("app_chatlog") && c.sql.includes("returning"))!;
    const citationsArg = insert.args.find(
      (a) => typeof a === "string" && a.includes("Video A"),
    ) as string;
    expect(JSON.parse(citationsArg)).toEqual([
      { video_id: 60, title: "Video A", start_time: "00:00:10", end_time: "00:00:20" },
    ]);
    const contextsArg = insert.args.find(
      (a) => typeof a === "string" && a.includes("scene text A"),
    ) as string;
    expect(JSON.parse(contextsArg)).toEqual(["scene text A"]);
    expect(insert.args).toContain(false);

    expect(calls.some((c) => c.sql.includes("used_ai_answers") && c.sql.includes("+ 1"))).toBe(true);

    // ChatLog 保存後に RAGAS 評価タスクを SQS へ投入（Django の on_commit 相当）
    const sqs = requests.find((r) => r.url.includes("sqs"))!;
    const message = JSON.parse(
      decodeURIComponent(sqs.raw.split("MessageBody=")[1].replace(/\+/g, " ")),
    );
    expect(message.headers.task).toBe("app.entrypoints.tasks.evaluation.evaluate_chat_log");
    expect(JSON.parse(atob(message.body))[0]).toEqual([99]);
  });

  it("グループが解決できなければ 404", async () => {
    rowsFor = (sql) => (sql.includes("app_videogroup") ? [] : defaultRows(sql));
    const res = await post(
      "/api/chat/messages",
      { messages: [{ role: "user", content: "hi" }], group_id: 3 },
      { token: await accessToken(), env: OPENAI_ENV },
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: { code: "VALIDATION_ERROR", message: "Group not found." },
    });
  });

  it("AI 回答上限に達していれば 400 AI_ANSWERS_LIMIT_EXCEEDED", async () => {
    rowsFor = (sql) =>
      sql.includes("is_over_quota") || sql.includes("ai_answers_limit")
        ? [{ is_over_quota: false, ai_answers_limit: 100, used_ai_answers: 100 }]
        : defaultRows(sql);
    const res = await post(
      "/api/chat/messages",
      { messages: [{ role: "user", content: "hi" }] },
      { token: await accessToken(), env: OPENAI_ENV },
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: {
        code: "AI_ANSWERS_LIMIT_EXCEEDED",
        message: "AI answers limit exceeded. Limit: 100.",
      },
    });
  });

  it("ストレージ超過なら 403 OVER_QUOTA", async () => {
    rowsFor = (sql) =>
      sql.includes("is_over_quota") || sql.includes("ai_answers_limit")
        ? [{ isOverQuota: true, aiAnswersLimit: null, usedAiAnswers: 0 }]
        : defaultRows(sql);
    const res = await post(
      "/api/chat/messages",
      { messages: [{ role: "user", content: "hi" }] },
      { token: await accessToken(), env: OPENAI_ENV },
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: {
        code: "OVER_QUOTA",
        message: "AI chat is unavailable: account storage is over the configured limit.",
      },
    });
  });

  it("LLM プロバイダ障害は 500 でメッセージをマスクする", async () => {
    vi.stubGlobal("fetch", async () => new Response("upstream boom", { status: 503 }));
    const res = await post(
      "/api/chat/messages",
      { messages: [{ role: "user", content: "hi" }] },
      { token: await accessToken(), env: OPENAI_ENV },
    );
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      error: { code: "INTERNAL_ERROR", message: "An internal server error occurred." },
    });
  });

  it("共有アクセス（share_slug）は group 所有者で処理し is_shared_origin=true で保存", async () => {
    stubOpenAi({});
    const res = await chatRoutes.request(
      "/api/chat/messages?share_slug=abc123",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: "hi" }],
          group_id: 3,
        }),
      },
      { ...ENV, ...OPENAI_ENV },
    );
    expect(res.status).toBe(200);

    const group = calls.find(
      (c) => c.sql.includes("share_slug") && c.sql.includes("app_videogroup"),
    )!;
    expect(group.args).toContain("abc123");
    expect(calls.some((c) => c.sql.includes("share_slug") && c.args.includes(3))).toBe(true);

    const quota = calls.find((c) => c.sql.includes("is_over_quota") || c.sql.includes("ai_answers_limit"))!;
    expect(quota.args[0]).toBe(5); // 共有訪問者ではなくグループ所有者

    const insert = calls.find((c) => c.sql.includes("app_chatlog") && c.sql.includes("returning"))!;
    expect(insert.args).toContain(true);
  });

  it("共有アクセスで group_id が無ければ 400", async () => {
    const res = await chatRoutes.request(
      "/api/chat/messages?share_token=abc123",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
      },
      { ...ENV, ...OPENAI_ENV },
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: { code: "VALIDATION_ERROR", message: "Group ID not specified." },
    });
  });
});

describe("POST /api/chat/messages/stream（SSE）", () => {
  it("バリデーション失敗は serializer.errors の辞書をそのまま message に入れる", async () => {
    const res = await post(
      "/api/chat/messages/stream",
      { messages: [{ role: "bad", content: "hi" }] },
      { token: await accessToken() },
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: { messages: [{ role: ['"bad" is not a valid choice.'] }] },
      },
    });
  });

  it("messages が空配列なら 400 INVALID_REQUEST（ストリーム開始前）", async () => {
    const res = await post(
      "/api/chat/messages/stream",
      { messages: [] },
      { token: await accessToken() },
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: { code: "INVALID_REQUEST", message: "Messages are empty." },
    });
  });

  it("チャンク → done（citations 付き）の順で流す", async () => {
    stubOpenAi({ stream: true, content: "Hello!" });
    const res = await post(
      "/api/chat/messages/stream",
      { messages: [{ role: "user", content: "hi" }], group_id: 3 },
      { token: await accessToken(), env: OPENAI_ENV },
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    expect(res.headers.get("cache-control")).toBe("no-cache");
    expect(res.headers.get("x-accel-buffering")).toBe("no");

    expect(sseEvents(await res.text())).toEqual([
      { type: "content_chunk", text: "Hel" },
      { type: "content_chunk", text: "lo!" },
      {
        type: "done",
        chat_log_id: 99,
        feedback: null,
        citations: [
          {
            id: 1,
            video_id: 60,
            title: "Video A",
            start_time: "00:00:10",
            end_time: "00:00:20",
          },
        ],
      },
    ]);

    const insert = calls.find((c) => c.sql.includes("app_chatlog") && c.sql.includes("returning"))!;
    expect(insert.args).toContain("Hello!");
  });

  it("クォータ超過は 200 + SSE error イベント（HTTP は 4xx にしない）", async () => {
    rowsFor = (sql) =>
      sql.includes("is_over_quota") || sql.includes("ai_answers_limit")
        ? [{ isOverQuota: true, aiAnswersLimit: null, usedAiAnswers: 0 }]
        : defaultRows(sql);
    const res = await post(
      "/api/chat/messages/stream",
      { messages: [{ role: "user", content: "hi" }] },
      { token: await accessToken(), env: OPENAI_ENV },
    );
    expect(res.status).toBe(200);
    expect(sseEvents(await res.text())).toEqual([
      {
        type: "error",
        code: "OVER_QUOTA",
        message: "AI chat is unavailable: account storage is over the configured limit.",
      },
    ]);
  });

  it("OpenAI キー未設定は SSE の LLM_CONFIGURATION_ERROR", async () => {
    const res = await post(
      "/api/chat/messages/stream",
      { messages: [{ role: "user", content: "hi" }] },
      { token: await accessToken() },
    );
    expect(res.status).toBe(200);
    expect(sseEvents(await res.text())).toEqual([
      {
        type: "error",
        code: "LLM_CONFIGURATION_ERROR",
        message:
          "OpenAI API key is required when using OpenAI LLM. " +
          "Please set OPENAI_API_KEY in the server environment.",
      },
    ]);
  });

  it("生成中のプロバイダ障害は SSE の LLM_PROVIDER_ERROR（メッセージはマスク）", async () => {
    vi.stubGlobal("fetch", async () => new Response("boom", { status: 502 }));
    const res = await post(
      "/api/chat/messages/stream",
      { messages: [{ role: "user", content: "hi" }] },
      { token: await accessToken(), env: OPENAI_ENV },
    );
    expect(sseEvents(await res.text())).toEqual([
      {
        type: "error",
        code: "LLM_PROVIDER_ERROR",
        message: "An internal server error occurred.",
      },
    ]);
  });
});
