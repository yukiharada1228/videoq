import { readFileSync } from "node:fs";
import { parse } from "dotenv";
import { describe, expect, it, vi } from "vitest";
import { chatAnswerSchema } from "@videoq/trpc/chat";
import { AnswerCostLedger } from "../src/lib/answer-cost-ledger";
import { ChatTransport } from "../src/lib/chat-transport";
import type { Bindings } from "../src/types/bindings";
import { privateJsonReport } from "./support/private-report";

const enabled = process.env.GROQ_COMPARISON_LIVE === "1";
const vars = enabled ? parse(readFileSync(new URL("../.dev.vars", import.meta.url))) : {};
const scenes = [
  { videoId: 60, videoTitle: "Rotation", startTime: "00:01:00", endTime: "00:02:00", content: "A two-dimensional rotation matrix is R(theta) = [[cos(theta), -sin(theta)], [sin(theta), cos(theta)]]. It changes direction and preserves length. At 90 degrees, (1,0) becomes (0,1)." },
  { videoId: 61, videoTitle: "Python", startTime: "00:03:00", endTime: "00:04:00", content: "In Python, a = [10, 20]; a[1] evaluates to 20 because indexing starts at zero. print(a[1]) prints 20." },
];
vi.mock("../src/repositories/vector-repository", () => ({ openSceneSearch: async () => ({ search: async () => scenes, close: async () => {} }) }));
vi.mock("../src/repositories/course-repository", () => ({ getCourseInfo: async () => ({ id: 3, name: "Matrices and Python", description: "", video_count: 2, videos: scenes.map((s, order) => ({ id: s.videoId, title: s.videoTitle, description: "", order, status: "completed" })) }) }));
const { streamRag } = await import("../src/lib/rag");
const scenarios = [
  { id: "rotation-ja", course: true, locale: "ja", query: "回転行列はベクトルに何をしますか？90度回転の例も簡潔に説明してください。", sources: [1], fact: /90|９０/ },
  { id: "code-en", course: true, locale: "en", query: "Show the Python indexing example from the course in a fenced code block and explain what a[1] returns.", sources: [2], fact: /20/ },
  { id: "no-course-ja", course: false, locale: "ja", query: "動画について質問するにはどうしたらよいですか？", sources: [], fact: /動画|講座/ },
];

describe.skipIf(!enabled)("Groq/OpenAI comparison (paid, opt-in; synthetic public evidence)", () => {
  it("measures the production RAG stream, citations and actual provider usage", async () => {
    const report = privateJsonReport(process.env.GROQ_COMPARISON_REPORT);
    const results: unknown[] = [];
    const selected = (process.env.GROQ_COMPARISON_MODELS || "openai/gpt-oss-120b,gpt-4o-mini,gpt-6-luna").split(",");
    const repeats = Number(process.env.GROQ_COMPARISON_REPEATS || "3");
    const paceMs = Number(process.env.GROQ_COMPARISON_PACE_MS || "0");
    let lastCall = 0;
    const create = ChatTransport.prototype.create;
    const originalFetch = globalThis.fetch;
    const diagnostics: unknown[] = [];
    globalThis.fetch = async (...args) => {
      const response = await originalFetch(...args);
      if (!response.ok) {
        const body = await response.clone().json().catch(() => ({}));
        const error = (body as {error?: {code?: unknown; message?: unknown; failed_generation?: unknown}}).error;
        const scrub = (value: unknown) => {
          let text = typeof value === "string" ? value : "";
          for (const key of [vars.GROQ_API_KEY, vars.OPENAI_API_KEY]) if (key) text = text.replaceAll(key, "[REDACTED]");
          return text.replace(/(?:gsk_|sk-)[A-Za-z0-9_-]+/g, "[REDACTED]").slice(0, 2000);
        };
        diagnostics.push({ status: response.status, code: scrub(error?.code), message: scrub(error?.message),
          ...(process.env.GROQ_COMPARISON_DEBUG === "1" ? { fixtureGeneration: scrub(error?.failed_generation) } : {}) });
      }
      return response;
    };
    const pacing = paceMs ? vi.spyOn(ChatTransport.prototype, "create").mockImplementation(async function(this: ChatTransport, ...args: Parameters<ChatTransport["create"]>) {
      if (this.route.provider === "groq") {
        await new Promise(resolve => setTimeout(resolve, Math.max(0, lastCall + paceMs - Date.now())));
        lastCall = Date.now();
      }
      return create.apply(this, args);
    }) : undefined;
    expect(repeats).toBeGreaterThan(0); expect(repeats).toBeLessThanOrEqual(10);
    try {
      for (const model of selected) for (const scenario of scenarios.filter(s => !process.env.GROQ_COMPARISON_CASE || s.id === process.env.GROQ_COMPARISON_CASE)) for (let repeat = 0; repeat < repeats; repeat++) {
        const provider = model === "openai/gpt-oss-120b" ? "groq" : "openai";
        const env = { ...vars, LLM_PROVIDER: provider, LLM_MODEL: model, LLM_STREAM_TIMEOUT_MS: paceMs ? "600000" : "120000" } as unknown as Bindings;
        const ledger = new AnswerCostLedger();
        const started = performance.now(); let ttftMs: number | null = null;
        let content = ""; let final: { answer: unknown } | undefined;
        const sources: unknown[] = [];
        let errorCode: string | null = null;
        try {
          for await (const chunk of streamRag(env, { messages: [{ role: "user", content: scenario.query }], locale: scenario.locale,
            ownerUserId: "00000000-0000-4000-8000-000000000005", courseId: scenario.course ? 3 : null,
            videoIds: scenario.course ? [60, 61] : null, costLedger: ledger })) {
            if ("part" in chunk && chunk.part.type === "text" && chunk.part.text) { ttftMs ??= performance.now() - started; content += chunk.part.text; }
            if ("source" in chunk) sources.push(chunk.source);
            if ("final" in chunk) final = chunk.final;
          }
        } catch (error) { errorCode = error instanceof Error ? error.constructor.name : "UnknownError"; }
        const parsed = chatAnswerSchema.safeParse(final?.answer);
        const ids = parsed.success ? [...new Set(parsed.data.segments.flatMap(s => s.sourceIds))].sort() : [];
        const checks = { schema: parsed.success, streamMatchesFinal: parsed.success && content === parsed.data.segments.map(s => s.text).join(""),
          paragraphEscapes: !content.includes("\\n\\n"),
          expectedSources: JSON.stringify(ids) === JSON.stringify(scenario.sources), expectedFact: scenario.fact.test(content),
          timestampSources: sources.every(source => scenes.some(s => (source as {video_id:number;start_time:string}).video_id === s.videoId && (source as {start_time:string}).start_time === s.startTime)) };
        results.push({ provider, model, scenario: scenario.id, repeat, ttftMs, completionMs: performance.now() - started,
          errorCode, checks, content, final, sources, calls: ledger.calls });
        report.write({ capturedAt: new Date().toISOString(), paceMs, fixture: "fixed synthetic rotation/Python; no production DB or user data", diagnostics, results });
        expect.soft(errorCode).toBeNull();
        for (const value of Object.values(checks)) expect.soft(value).toBe(true);
        if (process.env.GROQ_COMPARISON_REQUIRE_PRIMARY === "1") expect.soft(ledger.calls.every(c => c.provider === provider && c.status === "completed")).toBe(true);
      }
    } finally { report.close(); pacing?.mockRestore(); globalThis.fetch = originalFetch; }
  }, 900_000);
});
