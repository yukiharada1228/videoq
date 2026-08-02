import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { SignJWT } from "jose";
import { chatRoutes } from "../src/routes/chat";
import { validateOpenAiChatRequest, flattenErrors } from "../src/utils/chat-request";

/**
 * OpenAI 互換 POST /api/v1/chat/completions（OpenAIChatCompletionsView）。
 * 認証は Bearer <API キー> / ApiKey / JWT の順、共有アクセスは無し。
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

const SECRET = "test-jwt-secret-completions";
const ENV = {
  ENVIRONMENT: "development",
  JWT_SECRET: SECRET,
  LEGACY_API_ORIGIN: "https://legacy.test",
  HYPERDRIVE: { connectionString: "postgres://fake/db" },
  OPENAI_API_KEY: "sk-test",
  OPENAI_BASE_URL: "https://openai.test/v1",
} as unknown as Record<string, unknown>;

const defaultRows = (sql: string): Record<string, unknown>[] => {
  if (sql.includes("is_over_quota, ai_answers_limit"))
    return [{ is_over_quota: false, ai_answers_limit: null, used_ai_answers: 0 }];
  if (sql.includes("FROM app_videogroup WHERE"))
    return [{ id: 3, user_id: 5, description: null }];
  if (sql.includes("FROM app_videogroupmember")) return [{ video_id: 60 }];
  if (sql.includes("FROM videoq_scenes"))
    return [
      {
        content: "scene text",
        video_id: 60,
        langchain_metadata: {
          video_title: "Video A",
          start_time: "00:00:10",
          end_time: "00:00:20",
        },
      },
    ];
  if (sql.includes("INSERT INTO app_chatlog")) return [{ id: 99, feedback: null }];
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

const post = (body: unknown, headers: Record<string, string> = {}) =>
  chatRoutes.request(
    "/api/v1/chat/completions",
    {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    },
    ENV,
  );

function stubOpenAi(content = "Answer [1].") {
  const requests: { url: string; body: Record<string, unknown> }[] = [];
  vi.stubGlobal("fetch", async (input: string | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.url;
    const raw =
      typeof input === "string" ? String(init?.body ?? "") : await input.clone().text();
    requests.push({ url, body: raw ? JSON.parse(raw) : {} });
    if (url.endsWith("/embeddings")) {
      return new Response(JSON.stringify({ data: [{ embedding: [0.1, 0.2] }] }), {
        status: 200,
      });
    }
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
      status: 200,
    });
  });
  return requests;
}

describe("POST /api/v1/chat/completions", () => {
  it("認証なしは 401", async () => {
    const res = await post({ messages: [{ role: "user", content: "hi" }] });
    expect(res.status).toBe(401);
  });

  it("Bearer <APIキー> は API キー認証として解決する", async () => {
    rowsFor = (sql) =>
      sql.includes("UPDATE app_userapikey")
        ? [{ api_key_id: 1, user_id: 5, access_level: "read_only" }]
        : defaultRows(sql);
    stubOpenAi();

    const res = await post(
      { messages: [{ role: "user", content: "hi" }] },
      { authorization: "Bearer vq_livekeyvalue123" },
    );
    expect(res.status).toBe(200);
    expect(calls.some((c) => c.sql.includes("UPDATE app_userapikey"))).toBe(true);
  });

  it("read_only キーでも chat_write は許可される", async () => {
    rowsFor = (sql) =>
      sql.includes("UPDATE app_userapikey")
        ? [{ api_key_id: 1, user_id: 5, access_level: "read_only" }]
        : defaultRows(sql);
    stubOpenAi();
    const res = await post(
      { messages: [{ role: "user", content: "hi" }] },
      { "x-api-key": "vq_livekeyvalue123" },
    );
    expect(res.status).toBe(200);
  });

  it("OpenAI 形式のレスポンス（citations/chat_log_id は message の拡張）", async () => {
    stubOpenAi();
    const res = await post(
      { model: "videoq-pro", messages: [{ role: "user", content: "何が起きた?" }], group_id: 3 },
      { authorization: `Bearer ${await accessToken()}` },
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.id).toMatch(/^chatcmpl-[0-9a-f]{32}$/);
    expect(body.object).toBe("chat.completion");
    expect(typeof body.created).toBe("number");
    expect(body.model).toBe("videoq-pro");
    expect(body.usage).toEqual({
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    });
    expect(body.choices).toEqual([
      {
        index: 0,
        message: {
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
        },
      },
      // finish_reason は下で個別に検証（キー順の差を避ける）
    ].map((c) => ({ ...c, finish_reason: "stop" })));

    // feedback は OpenAI 互換レスポンスには含めない
    expect(body.choices[0].message.feedback).toBeUndefined();
    // 利用量の記録まで到達している
    expect(calls.some((c) => c.sql.includes("used_ai_answers"))).toBe(true);
  });

  it("group_id 無しなら citations も chat_log_id も付かない", async () => {
    stubOpenAi("plain answer");
    const res = await post(
      { messages: [{ role: "user", content: "hi" }] },
      { authorization: `Bearer ${await accessToken()}` },
    );
    const body = (await res.json()) as any;
    expect(body.choices[0].message).toEqual({ role: "assistant", content: "plain answer" });
    expect(calls.some((c) => c.sql.includes("INSERT INTO app_chatlog"))).toBe(false);
  });

  it("language が Accept-Language より優先される", async () => {
    const requests = stubOpenAi();
    await post(
      { messages: [{ role: "user", content: "hi" }], language: "en" },
      { authorization: `Bearer ${await accessToken()}`, "Accept-Language": "ja,en;q=0.8" },
    );
    const chat = requests.find((r) => r.url.endsWith("/chat/completions"))!;
    const system = (chat.body.messages as { role: string; content: string }[])[0].content;
    expect(system).toContain("You are an assistant");
  });

  it("messages が空なら OpenAI 形式の 400 invalid_request_error", async () => {
    const res = await post(
      { messages: [] },
      { authorization: `Bearer ${await accessToken()}` },
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: { message: "Messages are empty.", type: "invalid_request_error" },
    });
  });

  it("存在しない group は 404 invalid_request_error", async () => {
    rowsFor = (sql) =>
      sql.includes("FROM app_videogroup WHERE") ? [] : defaultRows(sql);
    const res = await post(
      { messages: [{ role: "user", content: "hi" }], group_id: 999 },
      { authorization: `Bearer ${await accessToken()}` },
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: { message: "Group not found.", type: "invalid_request_error" },
    });
  });

  it("ストレージ超過は 403 insufficient_quota", async () => {
    rowsFor = (sql) =>
      sql.includes("is_over_quota, ai_answers_limit")
        ? [{ is_over_quota: true, ai_answers_limit: null, used_ai_answers: 0 }]
        : defaultRows(sql);
    const res = await post(
      { messages: [{ role: "user", content: "hi" }] },
      { authorization: `Bearer ${await accessToken()}` },
    );
    expect(res.status).toBe(403);
    expect((await res.json()) as any).toEqual({
      error: {
        message: "AI chat is unavailable: account storage is over the configured limit.",
        type: "insufficient_quota",
      },
    });
  });

  it("AI 回答上限は 400 insufficient_quota", async () => {
    rowsFor = (sql) =>
      sql.includes("is_over_quota, ai_answers_limit")
        ? [{ is_over_quota: false, ai_answers_limit: 100, used_ai_answers: 100 }]
        : defaultRows(sql);
    const res = await post(
      { messages: [{ role: "user", content: "hi" }] },
      { authorization: `Bearer ${await accessToken()}` },
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: {
        message: "AI answers limit exceeded. Limit: 100.",
        type: "insufficient_quota",
      },
    });
  });

  it("LLM キー未設定は 400 invalid_request_error、プロバイダ障害は 500 api_error", async () => {
    vi.stubGlobal("fetch", async () => new Response("boom", { status: 500 }));
    const res = await chatRoutes.request(
      "/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${await accessToken()}`,
        },
        body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
      },
      ENV,
    );
    expect(res.status).toBe(500);
    const body = (await res.json()) as any;
    expect(body.error.type).toBe("api_error");
    // 上流のレスポンス本文は伏せる（ChatView と同じ扱い）
    expect(body.error.message).toBe("An internal server error occurred.");

    const noKey = await chatRoutes.request(
      "/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${await accessToken()}`,
        },
        body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
      },
      { ...ENV, OPENAI_API_KEY: undefined },
    );
    expect(noKey.status).toBe(400);
    // group_id 無しだと埋め込みは呼ばれず LLM で失敗する（Django と同じ）。
    expect((await noKey.json()) as any).toEqual({
      error: {
        message:
          "OpenAI API key is required when using OpenAI LLM. " +
          "Please set OPENAI_API_KEY in the server environment.",
        type: "invalid_request_error",
      },
    });
  });

  it("末尾スラッシュ付きも受け付ける（クライアント互換）", async () => {
    stubOpenAi();
    const res = await chatRoutes.request(
      "/api/v1/chat/completions/",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${await accessToken()}`,
        },
        body: JSON.stringify({
          messages: [{ role: "user", content: "hi" }],
          group_id: 3,
        }),
      },
      ENV,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { object: string };
    expect(body.object).toBe("chat.completion");
  });
});

describe("OpenAIChatRequestSerializer の検証", () => {
  const errorsOf = (body: unknown) => {
    const r = validateOpenAiChatRequest(body);
    if (r.ok) throw new Error("expected validation error");
    return flattenErrors(r.errors);
  };

  it("messages 未指定は required", () => {
    expect(errorsOf({})).toEqual({
      message: "This field is required.",
      fields: { messages: ["This field is required."] },
    });
  });

  it("model 既定値は videoq、未知フィールドは無視", () => {
    const r = validateOpenAiChatRequest({
      messages: [{ role: "user", content: "hi" }],
      seed: 42,
    });
    expect(r).toEqual({
      ok: true,
      value: { model: "videoq", messages: [{ role: "user", content: "hi" }], groupId: null, language: null },
    });
  });

  it("OpenAI 標準フィールドは受け付けて無視する", () => {
    const r = validateOpenAiChatRequest({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: "s" }],
      temperature: 0.2,
      max_tokens: 512,
      top_p: 1,
      stream: true,
      group_id: "7",
      language: "ja",
    });
    expect(r).toEqual({
      ok: true,
      value: {
        model: "gpt-4o-mini",
        messages: [{ role: "system", content: "s" }],
        groupId: 7,
        language: "ja",
      },
    });
  });

  it("型不正はフィールドごとの DRF メッセージになる", () => {
    expect(
      errorsOf({
        messages: [{ role: "user", content: "hi" }],
        temperature: "hot",
        max_tokens: 1.5,
        stream: "maybe",
        language: "",
      }),
    ).toEqual({
      message: "A valid number is required.",
      fields: {
        temperature: ["A valid number is required."],
        max_tokens: ["A valid integer is required."],
        stream: ["Must be a valid boolean."],
        language: ["This field may not be blank."],
      },
    });
  });

  it("messages の要素エラーは Python の repr 文字列に平坦化される", () => {
    expect(errorsOf({ messages: [{ role: "bot", content: "hi" }] })).toEqual({
      message:
        '{\'role\': [ErrorDetail(string=\'"bot" is not a valid choice.\', code=\'invalid_choice\')]}',
      fields: {
        messages: [
          '{\'role\': [ErrorDetail(string=\'"bot" is not a valid choice.\', code=\'invalid_choice\')]}',
        ],
      },
    });
  });
});
