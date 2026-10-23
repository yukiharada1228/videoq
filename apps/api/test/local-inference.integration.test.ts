import { describe, expect, it, vi } from "vitest";
import { HumanMessage } from "@langchain/core/messages";
import { generateReply, streamReply } from "../src/lib/llm";
import { embedQuery } from "../src/lib/embeddings";
import { createChatModel } from "../src/lib/chat-model";
import { streamRag } from "../src/lib/rag";
import { openSceneSearch } from "../src/repositories/vector-repository";
import type { Bindings } from "../src/types/bindings";

// Retrieval is a fixed, nonsensitive fixture; inference is real. This checks
// tools + response_format together through the production agent, without DB IO.
vi.mock("../src/repositories/vector-repository", () => ({ openSceneSearch: vi.fn(async () => ({
  search: async () => [{ videoId: 42, videoTitle: "Backup policy", startTime: "00:00:01,000",
    endTime: "00:00:08,000", content: "Database backups are retained for seven days." }],
  close: async () => undefined,
})) }));

// Explicit opt-in. Unit CI never downloads models or calls hosted inference.
const local = process.env.LOCAL_AI_TEST_URL;
const env = {
  OPENAI_API_KEY: "local-inference", OPENAI_BASE_URL: `${local}/v1`,
  LLM_MODEL: process.env.LOCAL_AI_TEST_MODEL || "qwen3:4b", LLM_REASONING_EFFORT: "none",
  LLM_SEPARATE_TOOL_SCHEMA: "true",
  EMBEDDING_PROVIDER: "ollama", EMBEDDING_MODEL: process.env.LOCAL_AI_TEST_EMBEDDING_MODEL || "qwen3-embedding:4b", OLLAMA_BASE_URL: local,
  VIDEO_VISUAL_ENABLED: "false",
} as Bindings;
const withModels = local ? describe : describe.skip;

withModels("real local inference compatibility", () => {
  const system = 'Source ID 1: Database backups are retained for seven days. Answer using only this source; cite numeric source ID 1 in sourceIds.';
  const question = "How many days are database backups retained?";
  it("produces and validates the application's cited structured answer", async () => {
    const answer = await generateReply(env, system, question);
    expect(answer.segments.map(s => s.text).join(" ")).toMatch(/seven|7/i);
    expect(answer.segments.flatMap(s => s.sourceIds)).toContain(1);
  }, 180_000);
  it("streams the same structured contract through the application SSE parser", async () => {
    const events = [];
    for await (const event of streamReply(env, system, question)) events.push(event);
    expect(events.some(event => "text" in event)).toBe(true);
    expect(events.at(-1)).toHaveProperty("answer");
  }, 300_000);
  it("calls tools using the application's chat adapter", async () => {
    const model = createChatModel(env, { maxTokens: 1024, timeoutMs: 120_000 }).bindTools([{
      type: "function", function: { name: "lookup_video", description: "Find a video by name.",
        parameters: { type: "object", properties: { name: { type: "string" } }, required: ["name"], additionalProperties: false } },
    }]);
    const answer = await model.invoke([new HumanMessage('Call lookup_video with name "Amber Lantern". Use the tool now.')]);
    expect(answer.tool_calls).toContainEqual(expect.objectContaining({ name: "lookup_video", args: { name: "Amber Lantern" } }));
  }, 180_000);
  it("generates the exact 1536-dimensional query vector used by pgvector", async () => {
    const vector = await embedQuery(env, "database backup retention");
    expect(vector).toHaveLength(1536);
    expect(vector.every(Number.isFinite)).toBe(true);
    expect(vector.some(value => value !== 0)).toBe(true);
  }, 120_000);
  it("searches and emits timestamp citations through the production streaming RAG agent", async () => {
    let final;
    for await (const event of streamRag(env, { ownerUserId: "local-acceptance", videoIds: [42], locale: "en",
      messages: [{ role: "user", content: "According to the course subtitles, how many days are database backups retained? Search the subtitles to find the policy." }],
    })) {
      if ("final" in event) final = event.final;
    }
    expect(openSceneSearch).toHaveBeenCalled();
    expect(final?.answer.segments.map(segment => segment.text).join(" ")).toMatch(/seven|7/i);
    expect(final?.answer.sources).toContainEqual(expect.objectContaining({ video_id: 42, start_time: "00:00:01,000" }));
    expect(final?.answer.segments.flatMap(segment => segment.sourceIds)).toContain(1);
  }, 300_000);
});
