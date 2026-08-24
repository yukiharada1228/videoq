import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { chatCompletionsRoutes } from "../src/features/chat/routes";
import { openAiCompletionBodySchema } from "../src/features/chat/schemas";
import { signAccessToken } from "./helpers/auth";

/**
 * OpenAI 互換 POST /completions（OpenAIChatCompletionsView）。
 * 認証は Bearer <API キー> / ApiKey / JWT の順、共有アクセスは無し。
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

const SECRET = "test-jwt-secret-completions";
const ENV = {
  ENVIRONMENT: "development",
  AUTH_JWT_SECRET: SECRET,
  HYPERDRIVE: { connectionString: "postgres://fake/db" },
  OPENAI_API_KEY: "sk-test",
  OPENAI_BASE_URL: "https://openai.test/v1",
} as unknown as Record<string, unknown>;

const defaultRows = (sql: string): Record<string, unknown>[] => {
  if (sql.includes("UPDATE users") && sql.includes("RETURNING usage_period_start"))
    return [{ usage_period_start: "2026-08-01 00:00:00+00" }];
  if (sql.includes("is_over_quota, ai_answers_limit"))
    return [{ is_over_quota: false, ai_answers_limit: null, used_ai_answers: 0 }];
  if (sql.includes("FROM video_courses WHERE"))
    return [{ id: 3, user_id: "00000000-0000-4000-8000-000000000005", description: null }];
  if (sql.includes("FROM video_course_members")) return [{ video_id: 60 }];
  if (sql.includes("FROM scene_embeddings"))
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
  if (sql.includes("INSERT INTO chat_logs")) return [{ id: 99, feedback: null }];
  if (sql.toLowerCase().includes("insert into") && sql.includes("external_tasks")) return [{ id: 199 }];
  return [];
};

beforeEach(() => {
  calls.length = 0;
  rowsFor = defaultRows;
});
afterEach(() => vi.unstubAllGlobals());

async function accessToken(userId = "00000000-0000-4000-8000-000000000005") {
  return signAccessToken(SECRET, userId);
}

const post = (body: unknown, headers: Record<string, string> = {}) =>
  chatCompletionsRoutes.request(
    "/completions",
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

describe("POST /completions", () => {
  it("認証なしは 401", async () => {
    const res = await post({ messages: [{ role: "user", content: "hi" }] });
    expect(res.status).toBe(401);
  });

  it("Bearer <APIキー> は API キー認証として解決する", async () => {
    stubOpenAi();

    const res = await post(
      { messages: [{ role: "user", content: "hi" }] },
      {
        authorization: "Bearer vq_livekeyvalue123",
        "X-VideoQ-Test-User-Id": "00000000-0000-4000-8000-000000000005",
        "X-VideoQ-Test-Access-Level": "read_only",
      },
    );
    expect(res.status).toBe(200);
  });

  it("read_only キーでも chat_write は許可される", async () => {
    stubOpenAi();
    const res = await post(
      { messages: [{ role: "user", content: "hi" }] },
      {
        "x-api-key": "vq_livekeyvalue123",
        "X-VideoQ-Test-User-Id": "00000000-0000-4000-8000-000000000005",
        "X-VideoQ-Test-Access-Level": "read_only",
      },
    );
    expect(res.status).toBe(200);
  });

  it("OpenAI 形式のレスポンス（citations/chat_log_id は message の拡張）", async () => {
    stubOpenAi();
    const res = await post(
      { model: "videoq-pro", messages: [{ role: "user", content: "何が起きた?" }], course_id: 3 },
      { "X-VideoQ-Test-User-Id": "00000000-0000-4000-8000-000000000005" },
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

  it("course_id 無しなら citations も chat_log_id も付かない", async () => {
    stubOpenAi("plain answer");
    const res = await post(
      { messages: [{ role: "user", content: "hi" }] },
      { "X-VideoQ-Test-User-Id": "00000000-0000-4000-8000-000000000005" },
    );
    const body = (await res.json()) as any;
    expect(body.choices[0].message).toEqual({ role: "assistant", content: "plain answer" });
    expect(calls.some((c) => c.sql.includes("INSERT INTO chat_logs"))).toBe(false);
  });

  it("回答生成後の保存失敗では消費済みの利用枠を返却しない", async () => {
    stubOpenAi("Generated answer");
    const previousRowsFor = rowsFor;
    rowsFor = (sql, args) => {
      if (sql.includes("INSERT INTO chat_logs")) {
        throw new Error("database unavailable");
      }
      return previousRowsFor(sql, args);
    };

    const res = await post(
      { messages: [{ role: "user", content: "hi" }], course_id: 3 },
      { "X-VideoQ-Test-User-Id": "00000000-0000-4000-8000-000000000005" },
    );

    expect(res.status).toBe(500);
    expect(calls.some((call) => call.sql.includes("GREATEST"))).toBe(false);
  });

  it("language が Accept-Language より優先される", async () => {
    const requests = stubOpenAi();
    await post(
      { messages: [{ role: "user", content: "hi" }], language: "en" },
      { "X-VideoQ-Test-User-Id": "00000000-0000-4000-8000-000000000005", "Accept-Language": "ja,en;q=0.8" },
    );
    const chat = requests.find((r) => r.url.endsWith("/chat/completions"))!;
    const system = (chat.body.messages as { role: string; content: string }[])[0].content;
    expect(system).toContain("You are an assistant");
  });

  it("messages が空なら OpenAI 形式の 400 invalid_request_error", async () => {
    const res = await post(
      { messages: [] },
      { "X-VideoQ-Test-User-Id": "00000000-0000-4000-8000-000000000005" },
    );
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.error.code).toBe("VALIDATION_ERROR");
    expect(j.error.details.messages).toBeTruthy();
  });

  it("存在しない course は 404 invalid_request_error", async () => {
    rowsFor = (sql) =>
      sql.includes("FROM video_courses WHERE") ? [] : defaultRows(sql);
    const res = await post(
      { messages: [{ role: "user", content: "hi" }], course_id: 999 },
      { "X-VideoQ-Test-User-Id": "00000000-0000-4000-8000-000000000005" },
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: { message: "Course not found.", type: "invalid_request_error" },
    });
  });

  it("ストレージ超過は 403 insufficient_quota", async () => {
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
      { messages: [{ role: "user", content: "hi" }] },
      { "X-VideoQ-Test-User-Id": "00000000-0000-4000-8000-000000000005" },
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
      { messages: [{ role: "user", content: "hi" }] },
      { "X-VideoQ-Test-User-Id": "00000000-0000-4000-8000-000000000005" },
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
    const res = await chatCompletionsRoutes.request(
      "/completions",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "X-VideoQ-Test-User-Id": "00000000-0000-4000-8000-000000000005",
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

    const noKey = await chatCompletionsRoutes.request(
      "/completions",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "X-VideoQ-Test-User-Id": "00000000-0000-4000-8000-000000000005",
        },
        body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
      },
      { ...ENV, OPENAI_API_KEY: undefined },
    );
    expect(noKey.status).toBe(400);
    // course_id無しでは埋め込みを呼ばず、LLM設定エラーを返す。
    expect((await noKey.json()) as any).toEqual({
      error: {
        message:
          "OpenAI API key is required when using OpenAI LLM. " +
          "Please set OPENAI_API_KEY in the server environment.",
        type: "invalid_request_error",
      },
    });
  });

  it("末尾スラッシュ無しパスを正とする（Phase 3）", async () => {
    stubOpenAi();
    const res = await chatCompletionsRoutes.request(
      "/completions",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "X-VideoQ-Test-User-Id": "00000000-0000-4000-8000-000000000005",
        },
        body: JSON.stringify({
          messages: [{ role: "user", content: "hi" }],
          course_id: 3,
        }),
      },
      ENV,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { object: string };
    expect(body.object).toBe("chat.completion");
  });
});

describe("openAiCompletionBodySchema（Zod）", () => {
  it("messages 未指定は失敗", () => {
    const r = openAiCompletionBodySchema.safeParse({});
    expect(r.success).toBe(false);
  });

  it("model 既定値は videoq、未知フィールドは無視", () => {
    const r = openAiCompletionBodySchema.parse({
      messages: [{ role: "user", content: "hi" }],
      seed: 42,
    });
    expect(r).toMatchObject({
      model: "videoq",
      messages: [{ role: "user", content: "hi" }],
    });
  });

  it("OpenAI 標準フィールドは受け付ける", () => {
    const r = openAiCompletionBodySchema.parse({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: "s" }],
      temperature: 0.2,
      max_tokens: 512,
      top_p: 1,
      stream: true,
      course_id: "7",
      language: "ja",
    });
    expect(r).toMatchObject({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: "s" }],
      course_id: 7,
      language: "ja",
    });
  });

  it("型不正は Zod で失敗する", () => {
    const r = openAiCompletionBodySchema.safeParse({
      messages: [{ role: "user", content: "hi" }],
      temperature: "hot",
      max_tokens: 1.5,
      stream: "maybe",
      language: "",
    });
    expect(r.success).toBe(false);
  });

  it("不正 role は失敗する", () => {
    const r = openAiCompletionBodySchema.safeParse({
      messages: [{ role: "bot", content: "hi" }],
    });
    expect(r.success).toBe(false);
  });
});
