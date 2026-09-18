import { embedding as testEmbedding } from "./helpers/embedding";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import {
  CHAT_REQUEST_MAX_BYTES,
  TRPC_MAX_BATCH_SIZE,
} from "@videoq/trpc/schema";
import { chatRoutes } from "../src/features/chat/routes";
import { signAccessToken } from "./helpers/auth";
import { createApp } from "../src/app";

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
  // vector-repository.ts (@yukiharada1228/langchain-postgres の PGEngine.fromPool) 用。
  class FakePool {
    async query(sqlOrConfig: unknown, args: unknown[] = []) {
      return executeFakePgQuery({
        calls,
        sqlOrConfig: sqlOrConfig as PgQueryInput,
        args,
        rowsFor,
      });
    }
    async connect() {
      return {
        query: async (sqlOrConfig: unknown, args: unknown[] = []) =>
          executeFakePgQuery({
            calls,
            sqlOrConfig: sqlOrConfig as PgQueryInput,
            args,
            rowsFor,
          }),
        release: () => {},
      };
    }
    async end() {}
  }
  return { default: { Client: FakeClient, Pool: FakePool } };
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
  if (sql.includes("FROM pg_attribute")) return [{ type_name: "vector", dimensions: 1536 }];
  if (sql.includes("UPDATE users") && sql.includes("RETURNING usage_period_start"))
    return [{ usage_period_start: QUOTA_PERIOD_START }];
  if (sql.includes("SELECT is_over_quota"))
    return [{ is_over_quota: false, ai_answers_limit: null, used_ai_answers: 0 }];
  if (sql.includes("video_courses"))
    return [{ id: 3, userId: "00000000-0000-4000-8000-000000000005", description: "Course about pgvector" }];
  if (sql.includes("video_course_members"))
    return [{ videoId: 60 }, { videoId: 61 }];
  if (sql.includes("information_schema.columns"))
    return [
      { column_name: "langchain_id", data_type: "uuid" },
      { column_name: "content", data_type: "text" },
      { column_name: "embedding", data_type: "USER-DEFINED" },
      { column_name: "user_id", data_type: "text" },
      { column_name: "video_id", data_type: "bigint" },
      { column_name: "langchain_metadata", data_type: "json" },
    ];
  if (sql.includes("scene_embeddings"))
    return [
      {
        langchain_id: "11111111-1111-4111-8111-111111111111",
        content: "scene text A",
        video_id: 60,
        user_id: "00000000-0000-4000-8000-000000000005",
        langchain_metadata: {
          video_title: "Video A",
          start_time: "00:00:10",
          end_time: "00:00:20",
        },
        distance: 0.1234,
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
  if (path === "/messages" || path.startsWith("/messages?")) {
    const payload = body as Record<string, unknown>;
    const query = new URL(path, "http://localhost").searchParams;
    return createApp().request(
      "/api/trpc/chat.send",
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          messages: payload.messages,
          courseId: payload.course_id,
          mode: payload.mode,
          studySessionId: payload.study_session_id,
          shareSlug: query.get("share_slug") ?? query.get("share_token") ?? undefined,
        }),
      },
      { ...ENV, ...(opts.env ?? {}) } as never,
    );
  }
  return chatRoutes.request(
    path,
    { method: "POST", headers, body: JSON.stringify(body) },
    { ...ENV, ...(opts.env ?? {}) },
  );
}

async function trpcData<T>(response: Response): Promise<T> {
  const payload = await response.json() as { result: { data: T } };
  return payload.result.data;
}

async function trpcError(response: Response): Promise<{
  code: string;
  message: string;
  details?: unknown;
}> {
  const payload = await response.json() as {
    error: {
      message: string;
      data: { code: string; applicationCode?: string; details?: unknown };
    };
  };
  return {
    code: payload.error.data.applicationCode ?? payload.error.data.code,
    message: payload.error.message,
    ...(payload.error.data.details !== undefined
      ? { details: payload.error.data.details }
      : {}),
  };
}

const OPENAI_ENV = { OPENAI_API_KEY: "sk-test", OPENAI_BASE_URL: "https://openai.test/v1" };
const SQS_ENV = {
  SQS_QUEUE_URL: "https://sqs.ap-northeast-1.amazonaws.com/1/videoq",
  AWS_ACCESS_KEY_ID: "AKIA",
  AWS_SECRET_ACCESS_KEY: "secret",
};

const jsonBody = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

const SEARCH_TOOL_CALL = {
  id: "call_search_1",
  type: "function",
  function: {
    name: "search_scenes",
    arguments: JSON.stringify({ query: "scene" }),
  },
};

/**
 * ReAct を含むチャット生成のスタブ。
 * tools 付き かつ まだツール結果が無い要求には search_scenes の呼び出しを返し、
 * 次の要求（ツール結果あり）で回答本文を返す。
 */
function stubOpenAi(opts: {
  stream?: boolean;
  content?: string;
  failAfterFirstChunk?: boolean;
  failOllamaEmbedding?: boolean;
  preamble?: string;
  toolCall?: typeof SEARCH_TOOL_CALL;
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
    if (url.endsWith("/embeddings") || url.endsWith("/api/embed")) {
      if (url.endsWith("/api/embed")) {
        if (opts.failOllamaEmbedding) throw new TypeError("Ollama connection refused");
        return jsonBody({ embeddings: [testEmbedding(0.1, 0.2)] });
      }
      return jsonBody({ data: [{ index: 0, embedding: testEmbedding(0.1, 0.2) }] });
    }

    const enc = new TextEncoder();
    const messages = (body.messages ?? []) as { role?: string }[];
    if (Array.isArray(body.tools) && !messages.some((m) => m.role === "tool")) {
      if (!opts.stream) {
        return jsonBody({
          choices: [
            {
              finish_reason: "tool_calls",
              message: { role: "assistant", content: opts.preamble ?? null, tool_calls: [opts.toolCall ?? SEARCH_TOOL_CALL] },
            },
          ],
        });
      }
      return new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            if (opts.preamble) {
              controller.enqueue(enc.encode(
                `data: ${JSON.stringify({ choices: [{ delta: { role: "assistant", content: opts.preamble } }] })}\n\n`,
              ));
            }
            controller.enqueue(
              enc.encode(
                `data: ${JSON.stringify({
                  choices: [
                    {
                      delta: {
                        role: "assistant",
                        tool_calls: [{ index: 0, ...(opts.toolCall ?? SEARCH_TOOL_CALL) }],
                      },
                    },
                  ],
                })}\n\n`,
              ),
            );
            controller.enqueue(enc.encode("data: [DONE]\n\n"));
            controller.close();
          },
        }),
        { status: 200, headers: { "content-type": "text/event-stream" } },
      );
    }

    const text = opts.content ?? "Answer [1].";
    if (!opts.stream) {
      return jsonBody({ choices: [{ message: { role: "assistant", content: text } }] });
    }
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
          for (const [i, part] of [text.slice(0, 3), text.slice(3)].entries()) {
            controller.enqueue(
              enc.encode(
                `data: ${JSON.stringify({
                  choices: [
                    { delta: i === 0 ? { role: "assistant", content: part } : { content: part } },
                  ],
                })}\n\n`,
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

describe.each([false, true])("講座メタ情報のチャット経路（stream=%s）", (stream) => {
  it.each(["owner", "member", "public"])("%s でメタ情報を取得し、検索なしで回答・根拠を保存する", async (access) => {
    rowsFor = (sql, args) => {
      if (sql.includes("video_courses") && sql.includes("video_count")) {
        return [{
          id: 3, name: "Digital circuits", description: "Registered description", display_order: 0,
          created_at: "2026-09-14T00:00:00Z", updated_at: "2026-09-14T00:00:00Z",
          share_slug: "abc123", video_count: 1, owner_user_id: "00000000-0000-4000-8000-000000000005",
        }];
      }
      if (sql.includes("video_course_members") && sql.includes("inner join videos")) {
        return [{
          member_order: 10, id: 60, file: "private.mp4", title: "Lecture 7", description: "",
          uploaded_at: "2026-09-14T00:00:00Z", status: "processing", source_type: "uploaded",
          source_url: "", youtube_video_id: "", tags: "[]",
        }];
      }
      return defaultRows(sql, args);
    };
    const answer = "Digital circuits has one video.";
    const requests = stubOpenAi({ stream, content: answer, toolCall: {
      id: "call_course", type: "function", function: { name: "get_course_info", arguments: "{}" },
    } });
    const path = (stream ? "/messages/stream" : "/messages") + (access === "public" ? "?share_slug=abc123" : "");
    const res = await post(path, {
      messages: [{ role: "user", content: "講座名と動画数は？" }], course_id: 3,
    }, {
      token: access === "public" ? undefined : await accessToken(access === "member"
        ? "00000000-0000-4000-8000-000000000006" : "00000000-0000-4000-8000-000000000005"),
      env: { ...OPENAI_ENV, ...SQS_ENV },
    });
    expect(res.status).toBe(200);
    if (stream) {
      const events = sseEvents(await res.text());
      expect(events.filter((event) => event.type === "content_chunk").map((event) => event.text).join("")).toBe(answer);
      expect(events.at(-1)).toMatchObject({ type: "done" });
      expect(events.at(-1)).not.toHaveProperty("citations");
      expect(events.some((event) => event.type === "searching")).toBe(false);
    } else {
      const data = await trpcData(res);
      expect(data).toMatchObject({ content: answer });
      expect(data).not.toHaveProperty("citations");
    }
    expect(calls.some((call) => call.sql.includes("scene_embeddings"))).toBe(false);
    expect(requests.some((request) => request.url.includes("embeddings"))).toBe(false);
    const stored = calls.find((call) => call.sql.includes("chat_logs") && call.sql.includes("returning"))!;
    expect(JSON.stringify(stored.args)).toContain("Course metadata");
    const modelRequests = requests.filter((request) => request.url.endsWith("/chat/completions"));
    expect(JSON.stringify(modelRequests)).toContain("Digital circuits");
    expect(JSON.stringify(modelRequests)).not.toContain("abc123");
    expect(JSON.stringify(modelRequests)).not.toContain("private.mp4");
  });
});

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
    const error = await trpcError(res);
    expect(error.code).toBe("VALIDATION_ERROR");
    expect((error.details as Record<string, unknown>).messages).toBeTruthy();
  });

  it("messages が空配列なら 400（Zod min(1)）", async () => {
    const res = await post("/messages", { messages: [] }, { token: await accessToken() });
    expect(res.status).toBe(400);
    const error = await trpcError(res);
    expect(error.code).toBe("VALIDATION_ERROR");
    expect((error.details as Record<string, unknown>).messages).toBeTruthy();
  });

  it("body 上限を超えた入力は JSON parse・認証より前に 413 にする", async () => {
    const res = await post("/messages", {
      messages: [
        { role: "user", content: "x".repeat(CHAT_REQUEST_MAX_BYTES + 1) },
      ],
    });

    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({
      error: {
        code: "PAYLOAD_TOO_LARGE",
        message: `Chat request body must not exceed ${CHAT_REQUEST_MAX_BYTES} bytes.`,
      },
    });
  });

  it("percent-encoded comma の tRPC batch でも body 上限を回避できない", async () => {
    const oversizedInput = {
      messages: [
        { role: "user", content: "x".repeat(CHAT_REQUEST_MAX_BYTES) },
      ],
    };
    const res = await createApp().request(
      "/api/trpc/chat.send%2Cchat.send?batch=1",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ 0: oversizedInput, 1: oversizedInput }),
      },
      ENV as never,
    );

    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({
      error: {
        code: "PAYLOAD_TOO_LARGE",
        message: `Chat request body must not exceed ${CHAT_REQUEST_MAX_BYTES} bytes.`,
      },
    });
  });

  it("tRPC batch の procedure 件数を制限する", async () => {
    const batchSize = TRPC_MAX_BATCH_SIZE + 1;
    const procedurePath = Array.from(
      { length: batchSize },
      () => "chat.send",
    ).join(",");
    const input = Object.fromEntries(
      Array.from({ length: batchSize }, (_, index) => [
        index,
        { messages: [{ role: "user", content: "hi" }] },
      ]),
    );
    const res = await createApp().request(
      `/api/trpc/${procedurePath}?batch=1`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "X-VideoQ-Test-User-Id":
            "00000000-0000-4000-8000-000000000005",
        },
        body: JSON.stringify(input),
      },
      ENV as never,
    );

    expect(res.status).toBe(400);
    expect(await res.text()).toContain("Batch call exceeds maximum size");
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
    expect(await trpcError(res)).toEqual({
      code: "PLOG_NOT_READY",
      message: "PLOG is not ready for this course's videos. Wait for build or rebuild.",
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
    expect(await trpcData(res)).toEqual({
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

    const search = calls.find(
      (call) => call.sql.includes("scene_embeddings") && call.sql.includes("SELECT"),
    )!;
    expect(search.args).toEqual([
      "00000000-0000-4000-8000-000000000005",
      [60, 61],
      JSON.stringify(testEmbedding(0.1, 0.2)),
      20,
    ]);
    expect(String(search.sql)).toMatch(/user_id = \$1 AND video_id = ANY\(\$2\)/);

    // 講座の説明文は必要時にツールで取得する。system は日英の根拠の使い分けを指示。
    const chatRequests = requests.filter((r) => r.url.endsWith("/chat/completions"));
    const first = chatRequests[0].body.messages as { role: string; content: string }[];
    expect(first[0].content).toContain("get_course_info");
    expect(first[0].content).not.toContain("Course about pgvector");
    expect(first[0].content).toContain("# シーン検索");
    expect(first[1]).toEqual({ role: "user", content: "何が起きた?" });
    expect(
      (chatRequests[0].body.tools as { function: { name: string } }[]).map(
        (t) => t.function.name,
      ),
    ).toEqual(["search_scenes", "get_course_info"]);

    // 参照シーンは 2 通目でツール結果として渡る（[N] 付き）
    const second = chatRequests[1].body.messages as { role: string; content: string }[];
    const toolMessage = second.find((m) => m.role === "tool")!;
    expect(toolMessage.content).toContain("[1] Video A 00:00:10 - 00:00:20\nscene text A");

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
    expect(await trpcError(res)).toEqual({
      code: "VALIDATION_ERROR",
      message: "Course not found.",
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
    expect(await trpcError(res)).toEqual({
      code: "AI_ANSWERS_LIMIT_EXCEEDED",
      message: "AI answers limit exceeded. Limit: 100.",
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
    expect(await trpcError(res)).toEqual({
      code: "OVER_QUOTA",
      message: "AI chat is unavailable: account storage is over the configured limit.",
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
    expect(await trpcError(res)).toEqual({
      code: "INTERNAL_ERROR",
      message: "An internal server error occurred.",
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
    const res = await post(
      "/messages?share_slug=abc123",
      {
        messages: [{ role: "user", content: "hi" }],
        course_id: 3,
      },
      { env: { ...ENV, ...OPENAI_ENV } },
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
    const res = await post(
      "/messages?share_token=abc123",
      { messages: [{ role: "user", content: "hi" }] },
      { env: { ...ENV, ...OPENAI_ENV } },
    );
    expect(res.status).toBe(400);
    expect(await trpcError(res)).toEqual({
      code: "VALIDATION_ERROR",
      message: "Course ID not specified.",
    });
  });
});

describe.each([false, true])("Ollama 検索障害の利用枠返却（stream=%s）", (stream) => {
  it("DB次元の不一致は埋め込み呼び出し前に失敗し、利用枠を返す", async () => {
    const requests = stubOpenAi({ stream });
    rowsFor = (sql, args) => sql.includes("FROM pg_attribute")
      ? [{ type_name: "vector", dimensions: 1024 }] : defaultRows(sql, args);
    const res = await post(
      stream ? "/messages/stream" : "/messages",
      { messages: [{ role: "user", content: "scene" }], course_id: 3 },
      { token: await accessToken(), env: OPENAI_ENV },
    );
    if (stream) {
      const events = sseEvents(await res.text());
      expect(events.at(-1)).toMatchObject({ type: "error", code: "LLM_CONFIGURATION_ERROR" });
      expect(events.some((event) => event.type === "content_chunk" || event.type === "done")).toBe(false);
    } else {
      expect(res.status).toBe(400);
      expect(await trpcError(res)).toMatchObject({ code: "VALIDATION_ERROR" });
    }
    expect(requests.some((request) => request.url.endsWith("/embeddings"))).toBe(false);
    expect(calls.filter((call) => call.sql.includes("GREATEST")).map((call) => call.args))
      .toEqual([["00000000-0000-4000-8000-000000000005", QUOTA_PERIOD_START]]);
    expect(calls.some((call) => call.sql.includes("chat_logs") && call.sql.includes("returning"))).toBe(false);
  });

  it("エラーを返し、通常回答の保存・完了通知を行わず利用枠を返す", async () => {
    const requests = stubOpenAi({ stream, failOllamaEmbedding: true, preamble: "調べますね。" });
    const res = await post(
      stream ? "/messages/stream" : "/messages",
      { messages: [{ role: "user", content: "scene" }], course_id: 3 },
      {
        token: await accessToken(),
        env: {
          ...OPENAI_ENV,
          EMBEDDING_PROVIDER: "ollama",
          EMBEDDING_MODEL: "qwen3-embedding:4b",
          OLLAMA_BASE_URL: "http://127.0.0.1:11434",
        },
      },
    );

    if (stream) {
      const events = sseEvents(await res.text());
      expect(events.at(-1)).toEqual({
        type: "error",
        code: "LLM_PROVIDER_ERROR",
        message: "An internal server error occurred.",
      });
      expect(events.some((event) => event.type === "content_chunk" || event.type === "done"))
        .toBe(false);
    } else {
      expect(res.status).toBe(500);
      expect(await trpcError(res)).toEqual({
        code: "INTERNAL_ERROR",
        message: "An internal server error occurred.",
      });
    }
    expect(requests.some((request) => request.url.endsWith("/api/embed"))).toBe(true);
    expect(calls.filter((call) => call.sql.includes("GREATEST")).map((call) => call.args))
      .toEqual([["00000000-0000-4000-8000-000000000005", QUOTA_PERIOD_START]]);
    expect(calls.some((call) => call.sql.includes("chat_logs") && call.sql.includes("returning")))
      .toBe(false);
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

  it("body 上限を超えた SSE 入力もストリーム開始前に 413 にする", async () => {
    const res = await post("/messages/stream", {
      messages: [
        { role: "user", content: "x".repeat(CHAT_REQUEST_MAX_BYTES + 1) },
      ],
    });

    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({
      error: {
        code: "PAYLOAD_TOO_LARGE",
        message: `Chat request body must not exceed ${CHAT_REQUEST_MAX_BYTES} bytes.`,
      },
    });
  });

  it("チャンク → done（citations 付き）の順で流す", async () => {
    stubOpenAi({ stream: true, content: "Hello!", preamble: "調べますね。" });
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
      // 検索ラウンドの間はトークンが出ないので、進行中であることを先に伝える
      { type: "searching", query: "scene", search_id: 1 },
      { type: "search_completed", query: "scene", search_id: 1, result_count: 1 },
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
