import { afterEach, describe, expect, it, vi } from "vitest";
import { HumanMessage } from "@langchain/core/messages";
import { createChatModel } from "../src/lib/chat-model";
import { answerResponseFormat } from "../src/lib/structured-answer";
import type { Bindings } from "../src/types/bindings";

const env = { OPENAI_API_KEY: "local", OPENAI_BASE_URL: "http://local.test/v1", LLM_MODEL: "local-model",
  LLM_SEPARATE_TOOL_SCHEMA: "true" } as Bindings;
const messages = [new HumanMessage("Find evidence, then answer.")];
const tools = [{ type: "function" as const, function: { name: "search_scenes", description: "Search evidence",
  parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } } }];
const completion = (message: Record<string, unknown>, reason = "stop") => ({
  id: "local-decision", object: "chat.completion", created: 1, model: "local-model",
  choices: [{ index: 0, finish_reason: reason, message: { role: "assistant", ...message } }],
  usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
});
const model = () => createChatModel(env, { maxTokens: 1024, timeoutMs: 1000 });
afterEach(() => vi.unstubAllGlobals());

describe("local tools and native final-answer schema", () => {
  it.each([false, true])("preserves function calls without the final-answer grammar (stream=%s)", async streaming => {
    const fetch = vi.fn(async (_url: unknown, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      expect(body.stream).toBe(false);
      expect(body.tools).toHaveLength(1);
      expect(body.response_format).toBeUndefined();
      return Response.json(completion({ content: "Private tool preamble", tool_calls: [{ id: "search-1", type: "function",
        function: { name: "search_scenes", arguments: '{"query":"backups"}' } }] }, "tool_calls"));
    });
    vi.stubGlobal("fetch", fetch);
    const chat = model();
    if (streaming) {
      let aggregate;
      for await (const chunk of await chat.stream(messages, { tools, response_format: answerResponseFormat })) {
        aggregate = aggregate ? aggregate.concat(chunk) : chunk;
      }
      expect(aggregate?.tool_calls?.[0]).toMatchObject({ id: "search-1", name: "search_scenes", args: { query: "backups" } });
      expect(aggregate?.text).not.toContain("Private");
      expect(aggregate?.response_metadata.finish_reason).toBe("tool_calls");
    } else {
      const response = await chat.invoke(messages, { tools, response_format: answerResponseFormat });
      expect(response.tool_calls?.[0]).toMatchObject({ name: "search_scenes", args: { query: "backups" } });
      expect(response.text).not.toContain("Private");
    }
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("discards draft prose and requests a native answer from the original evidence", async () => {
    const calls: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", async (_url: unknown, init: RequestInit) => {
      const body = JSON.parse(String(init.body)); calls.push(body);
      return Response.json(completion({ content: calls.length === 1 ? "UNTRUSTED DRAFT"
        : JSON.stringify({ segments: [{ text: "Seven days.", sourceIds: [1] }] }) }));
    });
    const response = await model().invoke(messages, { tools, response_format: answerResponseFormat });
    expect(response.text).toContain("Seven days.");
    expect(calls).toHaveLength(2);
    expect(calls[1].response_format).toMatchObject({ type: "json_schema", json_schema: { strict: true } });
    expect(calls[1].tools).toBeUndefined();
    expect(calls[1].messages).toEqual(calls[0].messages);
    expect(JSON.stringify(calls[1])).not.toContain("UNTRUSTED DRAFT");
  });
  it.each(["length", "content_filter"])("does not generate again after an incomplete %s decision", async reason => {
    const fetch = vi.fn(async () => Response.json(completion({ content: "partial" }, reason)));
    vi.stubGlobal("fetch", fetch);
    await expect(model().invoke(messages, { tools, response_format: answerResponseFormat })).rejects.toThrow("incomplete");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
