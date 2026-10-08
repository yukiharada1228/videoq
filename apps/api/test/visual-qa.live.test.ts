/** Opt-in capture of REAL model responses. Review answers against the fixture;
 * a green test here proves the pipeline completed, not semantic correctness.
 * VIDEOQ_VISUAL_EVAL=1 npm run test:unit --workspace @videoq/api -- test/visual-qa.live.test.ts
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { streamRag } from "../src/lib/rag";
import type { Bindings } from "../src/types/bindings";
import type { ChatToolProgressEvent } from "@videoq/trpc/chat";

const fixture = vi.hoisted(() => ({ coarse: new Uint8Array(), dense: new Uint8Array() }));
vi.mock("../src/integrations/media", () => ({
  readMediaBytes: async () => fixture.coarse,
  readMediaRange: async (_env: Bindings, _key: string, offset: number, length: number) => ({
    bytes: fixture.dense.slice(offset, offset + length), etag: '"fixture"', size: fixture.dense.length,
  }),
}));
vi.mock("../src/repositories/vector-repository", () => ({ openSceneSearch: async () => ({
  search: async () => [{ videoId: 42, videoTitle: "Visual fixture", startTime: "00:00:00,000", endTime: "00:00:18,000",
    content: "これは映像の確認用の動画です。画面をよく観察してください。音声では画面に見えている内容を説明していません。" }],
  close: async () => undefined,
}) }));
vi.mock("../src/repositories/video-evidence-repository", () => ({ getVideoEvidence: async () => ({
  id: 42, title: "Visual fixture", sourceType: "uploaded", fileKey: "fixture.mp4", transcriptTooLarge: false,
  transcript: "1\n00:00:00,000 --> 00:00:18,000\nこれは映像の確認用の動画です。画面をよく観察してください。音声では画面に見えている内容を説明していません。",
}) }));
vi.mock("../src/repositories/course-repository", () => ({ getCourseInfo: async () => ({
  name: "Visual fixture", description: "", video_count: 1,
  videos: [{ id: 42, title: "Visual fixture", description: "", order: 0, status: "completed" }],
}) }));

const enabled = process.env.VIDEOQ_VISUAL_EVAL === "1";
const variation = process.env.VIDEOQ_EVAL_VARIATION === "1";
const root = fileURLToPath(new URL("../../../", import.meta.url));
const fixtureRoot = fileURLToPath(new URL("./fixtures/visual-qa/", import.meta.url));
const questions: { id: string; question: string; expected: string }[] = JSON.parse(readFileSync(join(fixtureRoot, "questions.json"), "utf8"));
questions.push({ id: "Q8", question: "4文字の英数字コードを、表示される時刻と一緒に教えてください。", expected: "R8K2 at 20 seconds; must inspect images even without an explicit visual instruction" });
if (variation) {
  for (const question of questions) {
    if (["Q1", "Q8"].includes(question.id)) question.expected = "G6T9 at 20 seconds";
    if (question.id === "Q3") question.expected = "緑の円7個。上段4個、下段3個";
    if (question.id === "Q4") question.expected = "紫の円、右から左へ";
  }
}
const results: unknown[] = [];
let env: Bindings;

beforeAll(() => {
  if (!enabled) return;
  config({ path: join(root, ".env"), quiet: true });
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required for live evaluation");
  env = {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY, OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
    LLM_MODEL: process.env.LLM_MODEL || "gpt-4o-mini", VISION_MODEL: process.env.VISION_MODEL,
    VISUAL_REASONING_MODEL: process.env.VISUAL_REASONING_MODEL,
  } as Bindings;
  const tmp = mkdtempSync(join(tmpdir(), "videoq-visual-eval-"));
  try {
    execFileSync(join(root, "apps/worker/.venv/bin/python"), ["-c", `
import shutil, sys
from pathlib import Path
from worker_python.pipeline.focus_frames import build_focus_cache
from worker_python.pipeline.visual_frames import build_frame_cache
video, root = Path(sys.argv[1]), Path(sys.argv[2])
(root / 'coarse.json').write_bytes(build_frame_cache(video, 42, 30))
with build_focus_cache(video, 42, 30) as pack:
    shutil.copyfile(pack, root / 'focus.bin')
`, join(fixtureRoot, variation ? "variation.mp4" : "clip.mp4"), tmp], { cwd: join(root, "apps/worker"), timeout: 60_000 });
    fixture.coarse = new Uint8Array(readFileSync(join(tmp, "coarse.json")));
    fixture.dense = new Uint8Array(readFileSync(join(tmp, "focus.bin")));
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}, 65_000);

afterAll(() => {
  if (!enabled) return;
  const out = join(root, "output/visual-accuracy-fix-20261008");
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, `live-${Date.now()}.json`), JSON.stringify({
    fixture: variation ? "variation" : "primary", llm_model: env?.LLM_MODEL, vision_model: env?.VISION_MODEL || env?.LLM_MODEL,
    visual_reasoning_model: env?.VISUAL_REASONING_MODEL || env?.LLM_MODEL,
    note: "Real model and real FFmpeg frames; repositories/storage are fixture adapters. Manual semantic review required.", results,
  }, null, 2) + "\n");
});

for (const question of questions) {
  it.skipIf(!enabled || (!!process.env.VIDEOQ_EVAL_CASES && !process.env.VIDEOQ_EVAL_CASES.split(",").includes(question.id)))(`captures ${question.id}: ${question.question}`, async () => {
    const start = Date.now();
    const tools: ChatToolProgressEvent[] = [];
    const visualUsage: unknown[] = [];
    const apiUsage: { model: string; vision: boolean; prompt_tokens: number; cached_tokens: number; completion_tokens: number; estimated_usd: number | null }[] = [];
    const pendingUsage: Promise<void>[] = [];
    const realFetch = globalThis.fetch;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const request = JSON.parse(String(init?.body));
      const response = await realFetch(input, init);
      // Inspect only returned usage, never persist request headers or images.
      pendingUsage.push(response.clone().text().then(body => {
        const records = response.headers.get("content-type")?.includes("text/event-stream")
          ? body.split("\n").filter(line => line.startsWith("data: ") && line !== "data: [DONE]").map(line => JSON.parse(line.slice(6)))
          : [JSON.parse(body)];
        for (const record of records) {
          if (!record.usage) continue;
          const usage = record.usage;
          const cached = usage.prompt_tokens_details?.cached_tokens ?? 0;
          // Official standard prices verified 2026-10-08; USD / 1M tokens.
          const rates = /^gpt-4o-mini/.test(request.model) ? [0.15, 0.075, 0.6]
            : /^gpt-4.1-mini/.test(request.model) ? [0.4, 0.1, 1.6] : null;
          apiUsage.push({ model: request.model, vision: request.messages.some((m: { content: unknown }) =>
            Array.isArray(m.content) && m.content.some(p => p.type === "image_url")),
          prompt_tokens: usage.prompt_tokens, cached_tokens: cached, completion_tokens: usage.completion_tokens,
          estimated_usd: rates ? ((usage.prompt_tokens - cached) * rates[0] + cached * rates[1] + usage.completion_tokens * rates[2]) / 1_000_000 : null });
        }
      }));
      return response;
    });
    const info = vi.spyOn(console, "info").mockImplementation(value => {
      if (typeof value === "string" && value.startsWith("{")) {
        const record = JSON.parse(value);
        if (record.event === "visual_inspection") visualUsage.push(record);
      }
    });
    let final;
    try {
      for await (const chunk of streamRag(env, {
        ownerUserId: "fixture-owner", videoIds: [42], courseId: 1, locale: "ja",
        messages: [{ role: "user", content: question.question }],
      })) {
        if ("toolProgress" in chunk) tools.push(chunk.toolProgress);
        if ("final" in chunk) final = chunk.final;
      }
    } catch (error) {
      results.push({ ...question, status: "error", error: error instanceof Error ? error.message : "Unknown error",
        elapsed_seconds: (Date.now() - start) / 1000, tools, visual_usage: visualUsage, api_usage: apiUsage });
      throw error;
    } finally {
      info.mockRestore(); fetchSpy.mockRestore();
      await Promise.all(pendingUsage);
    }
    const result = { ...question, elapsed_seconds: (Date.now() - start) / 1000, tools,
      visual_usage: visualUsage, api_usage: apiUsage, estimated_usd: apiUsage.reduce((sum, call) => sum + (call.estimated_usd ?? 0), 0), ...final };
    results.push(result);
    console.log(JSON.stringify(result));
    expect(final?.answer.segments.length).toBeGreaterThan(0);
    expect(JSON.stringify(final?.retrievedContexts)).not.toContain("data:image");
  }, 180_000);
}
