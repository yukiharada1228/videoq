import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { chatRoutes } from "../src/features/chat/routes";
import { signAccessToken } from "./helpers/auth";

/**
 * ルート全体（認証 → 検証 → course/quota → RAG → ChatLog → 応答）の結線テスト。
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
  AUTH_JWT_SECRET: SECRET,
  HYPERDRIVE: { connectionString: "postgres://fake/db" },
} as unknown as Record<string, unknown>;
const QUOTA_PERIOD_START = "2026-08-01 00:00:00+00";
let lastExternalPayload: Record<string, unknown> | null = null;

const defaultRows = (sql: MatchableSql, args: unknown[] = []): Record<string, unknown>[] => {
  if (sql.includes("UPDATE users") && sql.includes("RETURNING usage_period_start"))
    return [{ usage_period_start: QUOTA_PERIOD_START }];
  if (sql.includes("SELECT is_over_quota"))
    return [{ is_over_quota: false, ai_answers_limit: null, used_ai_answers: 0 }];
  if (sql.includes("video_courses"))
    return [{ id: 3, userId: "00000000-0000-4000-8000-000000000005", description: "Course about pgvector" }];
  if (sql.includes("video_course_members"))
    return [{ videoId: 60 }, { videoId: 61 }];
  if (sql.includes("scene_embeddings"))
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
  if (sql.includes("chat_logs") && sql.includes("returning"))
    return [{ id: 99, feedback: null }];
  if (sql.toLowerCase().includes("insert into") && sql.includes("external_tasks")) {
    const payload = args.find(
      (arg) =>
        (typeof arg === "string" && arg.includes('"message"')) ||
        (typeof arg === "object" && arg !== null && "message" in arg),
    );
    lastExternalPayload =
      typeof payload === "string"
        ? (JSON.parse(payload) as Record<string, unknown>)
        : (payload as Record<string, unknown> | null);
    return [{ id: 199 }];
  }
  if (sql.includes("WITH candidates") || sql.includes("with candidates")) {
    return lastExternalPayload
      ? [{ id: 199, kind: "sqs_job", payload: lastExternalPayload }]
      : [];
  }
  return [];
};

beforeEach(() => {
  calls.length = 0;
  lastExternalPayload = null;
  rowsFor = defaultRows;
});
afterEach(() => vi.unstubAllGlobals());

async function accessToken(userId = "00000000-0000-4000-8000-000000000005") {
  return signAccessToken(SECRET, userId);
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
  if (opts.token) headers["X-VideoQ-Test-User-Id"] = String(opts.token).replace(/^test-user-/, "") || "00000000-0000-4000-8000-000000000005";
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
function stubOpenAi(opts: {
  stream?: boolean;
  content?: string;
  failAfterFirstChunk?: boolean;
}) {
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
    if (opts.failAfterFirstChunk) {
      let pullCount = 0;
      return new Response(
        new ReadableStream<Uint8Array>({
          pull(controller) {
            if (pullCount++ === 0) {
              controller.enqueue(
                enc.encode(
                  `data: ${JSON.stringify({ choices: [{ delta: { content: text.slice(0, 3) } }] })}\n\n`,
                ),
              );
              return;
            }
            controller.error(new Error("stream interrupted"));
          },
        }),
        { status: 200 },
      );
    }
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

describe("POST /messages（非ストリーミング）", () => {
  it("認証なしは 401", async () => {
    const res = await post("/messages", {
      messages: [{ role: "user", content: "hi" }],
    });
    expect(res.status).toBe(401);
  });

  it("バリデーション失敗は {error:{code,message,details}}", async () => {
    const res = await post("/messages", {}, { token: await accessToken() });
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.error.code).toBe("VALIDATION_ERROR");
    expect(j.error.details.messages).toBeTruthy();
  });

  it("messages が空配列なら 400（Zod min(1)）", async () => {
    const res = await post("/messages", { messages: [] }, { token: await accessToken() });
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.error.code).toBe("VALIDATION_ERROR");
    expect(j.error.details.messages).toBeTruthy();
  });

  it("mode=study は Worker 内 PLOG gateway（ready グラフ無しは 409 PLOG_NOT_READY）", async () => {
    const prev = rowsFor;
    rowsFor = (sql, args) => {
      if (sql.includes("plog_build_jobs")) return [{ status: "pending" }];
      return prev(sql, args);
    };
    const studySessions = {
      getByName: () => ({
        tryAcquire: async () => ({ acquired: true, retryAfterMs: 0 }),
        getSnapshot: async () => ({ revision: 0, states: {} }),
        commit: async () => true,
        release: async () => undefined,
      }),
    };
    const res = await post(
      "/messages",
      {
        messages: [{ role: "user", content: "hi" }],
        course_id: 3,
        mode: "study",
        study_session_id: "s1",
      },
      {
        token: await accessToken(),
        env: { ...ENV, OPENAI_API_KEY: "sk-test", STUDY_SESSION: studySessions },
      },
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: {
        code: "PLOG_NOT_READY",
        message: "PLOG is not ready for this course's videos. Wait for build or rebuild.",
      },
    });
  });

  it("course_id ありで RAG → citations / chat_log_id を返し、利用量を記録する", async () => {
    const requests = stubOpenAi({});
    const res = await post(
      "/messages",
      { messages: [{ role: "user", content: "何が起きた?" }], course_id: 3 },
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

    const search = calls.find((call) => call.sql.includes("scene_embeddings"))!;
    expect(search.args).toEqual(["00000000-0000-4000-8000-000000000005", "[0.1,0.2]", 20]);
    expect(String(search.sql)).toMatch(/ARRAY\[60,61\]::bigint\[\]/);

    // プロンプトは ja ロケール + course_context + 参照シーンを含む
    const chat = requests.find((r) => r.url.endsWith("/chat/completions"))!;
    const messages = chat.body.messages as { role: string; content: string }[];
    expect(messages[0].content).toContain("# 講座情報");
    expect(messages[0].content).toContain("Course about pgvector");
    expect(messages[0].content).toContain("[1] Video A 00:00:10 - 00:00:20\nscene text A");
    expect(messages[1]).toEqual({ role: "user", content: "何が起きた?" });

    // ChatLog は citations（id なし）と retrieved_contexts を保存
    const insert = calls.find((c) => c.sql.includes("chat_logs") && c.sql.includes("returning"))!;
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

    expect(calls.some(
      (c) => c.sql.includes("RETURNING usage_period_start") && c.sql.includes("+ 1"),
    )).toBe(true);

    // ChatLog保存後にRAGAS評価タスクをSQSへ投入。
    const sqs = requests.find((r) => r.url.includes("sqs"))!;
    const message = JSON.parse(
      decodeURIComponent(sqs.raw.split("MessageBody=")[1].replace(/\+/g, " ")),
    );
    expect(message.type).toBe("evaluate_chat_log");
    expect(message.payload).toEqual({ chat_log_id: 99 });
    expect(typeof message.job_id).toBe("string");
  });

  it("参加メンバーは講座所有者の割当でチャットし、履歴は本人名義で保存する", async () => {
    stubOpenAi({});
    const memberUserId = "00000000-0000-4000-8000-000000000006";

    const res = await post(
      "/messages",
      { messages: [{ role: "user", content: "member question" }], course_id: 3 },
      { token: await accessToken(memberUserId), env: { ...OPENAI_ENV, ...SQS_ENV } },
    );

    expect(res.status).toBe(200);
    const courseLookup = calls.find(
      (call) => call.sql.includes("video_courses") && call.sql.includes("video_course_memberships"),
    );
    expect(courseLookup).toBeTruthy();

    const search = calls.find((call) => call.sql.includes("scene_embeddings"))!;
    expect(search.args[0]).toBe("00000000-0000-4000-8000-000000000005");

    const reservation = calls.find(
      (call) => call.sql.includes("UPDATE users") && call.sql.includes("RETURNING usage_period_start"),
    )!;
    expect(reservation.args[0]).toBe("00000000-0000-4000-8000-000000000005");
    expect(reservation.args).not.toContain(memberUserId);

    const insert = calls.find(
      (call) => call.sql.includes("chat_logs") && call.sql.includes("returning"),
    )!;
    expect(insert.args).toContain(memberUserId);
  });

  it("講座が解決できなければ 404", async () => {
    rowsFor = (sql) => (sql.includes("video_courses") ? [] : defaultRows(sql));
    const res = await post(
      "/messages",
      { messages: [{ role: "user", content: "hi" }], course_id: 3 },
      { token: await accessToken(), env: OPENAI_ENV },
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: { code: "VALIDATION_ERROR", message: "Course not found." },
    });
  });

  it("AI 回答上限に達していれば 400 AI_ANSWERS_LIMIT_EXCEEDED", async () => {
    rowsFor = (sql) => {
      if (sql.includes("UPDATE users") && sql.includes("RETURNING usage_period_start")) {
        return [];
      }
      if (sql.includes("SELECT is_over_quota")) {
        return [{ is_over_quota: false, ai_answers_limit: 100, used_ai_answers: 100 }];
      }
      return defaultRows(sql);
    };
    const res = await post(
      "/messages",
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
    rowsFor = (sql) => {
      if (sql.includes("UPDATE users") && sql.includes("RETURNING usage_period_start")) {
        return [];
      }
      if (sql.includes("SELECT is_over_quota")) {
        return [{ is_over_quota: true, ai_answers_limit: null, used_ai_answers: 0 }];
      }
      return defaultRows(sql);
    };
    const res = await post(
      "/messages",
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
      "/messages",
      { messages: [{ role: "user", content: "hi" }] },
      { token: await accessToken(), env: OPENAI_ENV },
    );
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      error: { code: "INTERNAL_ERROR", message: "An internal server error occurred." },
    });
    const release = calls.find((call) => call.sql.includes("GREATEST"))!;
    expect(release.args).toEqual([
      "00000000-0000-4000-8000-000000000005",
      QUOTA_PERIOD_START,
    ]);
  });

  it("回答生成後の保存失敗では消費済みの利用枠を返却しない", async () => {
    stubOpenAi({ content: "Generated answer" });
    const previousRowsFor = rowsFor;
    rowsFor = (sql, args) => {
      if (sql.includes("chat_logs") && sql.includes("returning")) {
        throw new Error("database unavailable");
      }
      return previousRowsFor(sql, args);
    };

    const res = await post(
      "/messages",
      { messages: [{ role: "user", content: "hi" }], course_id: 3 },
      { token: await accessToken(), env: OPENAI_ENV },
    );

    expect(res.status).toBe(500);
    expect(calls.some((call) => call.sql.includes("GREATEST"))).toBe(false);
  });

  it("共有アクセス（share_slug）は course 所有者で処理し is_shared_origin=true で保存", async () => {
    stubOpenAi({});
    const res = await chatRoutes.request(
      "/messages?share_slug=abc123",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: "hi" }],
          course_id: 3,
        }),
      },
      { ...ENV, ...OPENAI_ENV },
    );
    expect(res.status).toBe(200);

    const course = calls.find(
      (c) => c.sql.includes("share_slug") && c.sql.includes("video_courses"),
    )!;
    expect(course.args).toContain("abc123");
    expect(calls.some((c) => c.sql.includes("share_slug") && c.args.includes(3))).toBe(true);

    const quota = calls.find(
      (c) => c.sql.includes("UPDATE users") && c.sql.includes("RETURNING usage_period_start"),
    )!;
    expect(quota.args[0]).toBe("00000000-0000-4000-8000-000000000005"); // 共有訪問者ではなく講座所有者

    const insert = calls.find((c) => c.sql.includes("chat_logs") && c.sql.includes("returning"))!;
    expect(insert.args).toContain(true);
  });

  it("共有アクセスで course_id が無ければ 400", async () => {
    const res = await chatRoutes.request(
      "/messages?share_token=abc123",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
      },
      { ...ENV, ...OPENAI_ENV },
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: { code: "VALIDATION_ERROR", message: "Course ID not specified." },
    });
  });
});

describe("POST /messages/stream（SSE）", () => {
  it("バリデーション失敗は非ストリームと同じ {error:{code,message,details}}", async () => {
    const res = await post(
      "/messages/stream",
      { messages: [{ role: "bad", content: "hi" }] },
      { token: await accessToken() },
    );
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.error.code).toBe("VALIDATION_ERROR");
    expect(j.error.details).toBeTruthy();
  });

  it("messages が空配列なら 400（Zod min(1)、ストリーム開始前）", async () => {
    const res = await post(
      "/messages/stream",
      { messages: [] },
      { token: await accessToken() },
    );
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.error.code).toBe("VALIDATION_ERROR");
    expect(j.error.details.messages).toBeTruthy();
  });

  it("チャンク → done（citations 付き）の順で流す", async () => {
    stubOpenAi({ stream: true, content: "Hello!" });
    const res = await post(
      "/messages/stream",
      { messages: [{ role: "user", content: "hi" }], course_id: 3 },
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

    const insert = calls.find((c) => c.sql.includes("chat_logs") && c.sql.includes("returning"))!;
    expect(insert.args).toContain("Hello!");
  });

  it("クォータ超過は 200 + SSE error イベント（HTTP は 4xx にしない）", async () => {
    rowsFor = (sql) => {
      if (sql.includes("UPDATE users") && sql.includes("RETURNING usage_period_start")) {
        return [];
      }
      if (sql.includes("SELECT is_over_quota")) {
        return [{ is_over_quota: true, ai_answers_limit: null, used_ai_answers: 0 }];
      }
      return defaultRows(sql);
    };
    const res = await post(
      "/messages/stream",
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
      "/messages/stream",
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
      "/messages/stream",
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
    const release = calls.find((call) => call.sql.includes("GREATEST"))!;
    expect(release.args[0]).toBe("00000000-0000-4000-8000-000000000005");
  });

  it("回答を一部生成した後の中断では消費済みの利用枠を返却しない", async () => {
    stubOpenAi({ stream: true, content: "Hello!", failAfterFirstChunk: true });

    const res = await post(
      "/messages/stream",
      { messages: [{ role: "user", content: "hi" }] },
      { token: await accessToken(), env: OPENAI_ENV },
    );

    expect(sseEvents(await res.text())).toEqual([
      { type: "content_chunk", text: "Hel" },
      {
        type: "error",
        code: "LLM_PROVIDER_ERROR",
        message: "An internal server error occurred.",
      },
    ]);
    expect(calls.some((call) => call.sql.includes("GREATEST"))).toBe(false);
  });
});
