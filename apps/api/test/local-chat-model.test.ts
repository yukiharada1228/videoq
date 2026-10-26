import { afterEach, describe, expect, it, vi } from "vitest";
import { AIMessage, HumanMessage, ToolMessage } from "@langchain/core/messages";
import { createChatModel } from "../src/lib/chat-model";
import { answerResponseFormat } from "../src/lib/structured-answer";
import type { Bindings } from "../src/types/bindings";

const env = {
  OPENAI_API_KEY: "local",
  OPENAI_BASE_URL: "http://local.test/v1",
  LLM_MODEL: "local-model",
  LLM_SEPARATE_TOOL_SCHEMA: "true",
} as Bindings;
const messages = [new HumanMessage("Find evidence, then answer.")];
const tools = [
  {
    type: "function" as const,
    function: {
      name: "search_scenes",
      description: "Search evidence",
      parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
    },
  },
];
const completion = (message: Record<string, unknown>, reason = "stop") => ({
  id: "local-decision",
  object: "chat.completion",
  created: 1,
  model: "local-model",
  choices: [{ index: 0, finish_reason: reason, message: { role: "assistant", ...message } }],
  usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
});
const model = () => createChatModel(env, { maxTokens: 1024, timeoutMs: 1000 });
afterEach(() => vi.unstubAllGlobals());

describe("local tools and native final-answer schema", () => {
  it.each([false, true])("preserves function calls without the final-answer grammar (stream=%s)", async (streaming) => {
    const fetch = vi.fn(async (_url: unknown, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      expect(body.stream).toBe(false);
      expect(body.tools).toBeUndefined();
      expect(body.response_format.json_schema.name).toBe("videoq_tool_decision");
      return Response.json(
        completion({ content: JSON.stringify({ tool: "search_scenes", arguments: { query: "backups" } }) }),
      );
    });
    vi.stubGlobal("fetch", fetch);
    const chat = model();
    if (streaming) {
      let aggregate;
      for await (const chunk of await chat.stream(messages, { tools, response_format: answerResponseFormat })) {
        aggregate = aggregate ? aggregate.concat(chunk) : chunk;
      }
      expect(aggregate?.tool_calls?.[0]).toMatchObject({ name: "search_scenes", args: { query: "backups" } });
      expect(aggregate?.text).not.toContain("Private");
      expect(aggregate?.response_metadata.finish_reason).toBe("tool_calls");
    } else {
      const response = await chat.invoke(messages, { tools, response_format: answerResponseFormat });
      expect(response.tool_calls?.[0]).toMatchObject({ name: "search_scenes", args: { query: "backups" } });
      expect(response.text).not.toContain("Private");
    }
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("requests the final answer from the original evidence after a finish plan", async () => {
    const calls: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", async (_url: unknown, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      calls.push(body);
      return Response.json(
        completion({
          content:
            calls.length === 1
              ? JSON.stringify({ tool: "finish", arguments: {} })
              : JSON.stringify({ segments: [{ text: "Seven days.", sourceIds: [1] }] }),
        }),
      );
    });
    const response = await model().invoke(messages, { tools, response_format: answerResponseFormat });
    expect(response.text).toContain("Seven days.");
    expect(calls).toHaveLength(2);
    expect(calls[1].response_format).toMatchObject({ type: "json_schema", json_schema: { strict: true } });
    expect(calls[1].tools).toBeUndefined();
    expect(calls[1].messages).toEqual([{ role: "user", content: "Find evidence, then answer." }]);
    expect(JSON.stringify(calls[1])).not.toContain("UNTRUSTED DRAFT");
  });
  it("keeps executed evidence in JSON history without invoking a native tool template", async () => {
    const bodies: Record<string, any>[] = [];
    vi.stubGlobal("fetch", async (_url: unknown, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      bodies.push(body);
      return Response.json(
        completion({
          content: JSON.stringify(
            bodies.length === 1
              ? { tool: "finish", arguments: {} }
              : { segments: [{ text: "Seven days.", sourceIds: [1] }] },
          ),
        }),
      );
    });
    const input = [
      ...messages,
      new AIMessage({
        content: "",
        tool_calls: [{ id: "search-1", name: "search_scenes", args: { query: "backups" } }],
      }),
      new ToolMessage({ content: '{"sourceId":1,"text":"Seven days."}', tool_call_id: "search-1" }),
    ];
    expect((await model().invoke(input, { tools, response_format: answerResponseFormat })).text).toContain(
      "Seven days.",
    );
    expect(bodies).toHaveLength(2);
    for (const body of bodies) {
      expect(body.messages.some((message: any) => message.role === "tool" || message.tool_calls?.length)).toBe(false);
      expect(JSON.stringify(body.messages)).toContain("sourceId");
      expect(JSON.stringify(body.messages)).toContain("backups");
      expect(JSON.stringify(body.messages)).toContain("Seven days.");
    }
  });
  it.each(["length", "content_filter"])("does not generate again after an incomplete %s decision", async (reason) => {
    const fetch = vi.fn(async () => Response.json(completion({ content: "partial" }, reason)));
    vi.stubGlobal("fetch", fetch);
    await expect(model().invoke(messages, { tools, response_format: answerResponseFormat })).rejects.toThrow(
      "incomplete",
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("keeps the full answer instructions and tool evidence out of the planning override", async () => {
    const bodies: Record<string, any>[] = [];
    vi.stubGlobal("fetch", async (_url: unknown, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      bodies.push(body);
      return Response.json(
        completion({
          content:
            bodies.length === 1
              ? JSON.stringify({ tool: "finish", arguments: {} })
              : '{"segments":[{"text":"Grounded.","sourceIds":[1]}]}',
        }),
      );
    });
    const { SystemMessage, ToolMessage } = await import("@langchain/core/messages");
    const input = [
      new SystemMessage("Full answer instructions"),
      ...messages,
      new ToolMessage({ content: "source 1", tool_call_id: "search-1" }),
    ];
    const chat = createChatModel(env, {
      maxTokens: 1024,
      timeoutMs: 1000,
      localToolPolicy: () => ({ systemPrompt: "Planning instructions", requireTool: false }),
    });
    await chat.invoke(input, { tools, response_format: answerResponseFormat });
    expect(bodies[0].messages[0].content).toContain("Planning instructions");
    expect(bodies[0].messages[0].content).not.toContain("Full answer instructions");
    expect(bodies[1].messages[0].content).toBe("Full answer instructions");
    expect(bodies[0].messages.at(-1)).toEqual(bodies[1].messages.at(-1));
    expect(JSON.stringify(bodies[1])).not.toContain("DISCARDED DRAFT");
  });
  it.each([false, true])(
    "rejects skipped grounding without generating or exposing a draft (stream=%s)",
    async (streaming) => {
      const fetch = vi.fn(async (_url: unknown, init: RequestInit) => {
        const body = JSON.parse(String(init.body));
        expect(body.tools).toBeUndefined();
        expect(body.response_format.json_schema.schema.anyOf.map((v: any) => v.properties.tool.const)).toEqual([
          "search_scenes",
        ]);
        return Response.json(completion({ content: JSON.stringify({ tool: "finish", arguments: {} }) }));
      });
      vi.stubGlobal("fetch", fetch);
      const chat = createChatModel(env, {
        maxTokens: 1024,
        timeoutMs: 1000,
        localToolPolicy: () => ({ systemPrompt: "Acquire evidence", requireTool: true }),
      });
      await expect(
        streaming
          ? chat.stream(messages, { tools, response_format: answerResponseFormat })
          : chat.invoke(messages, { tools, response_format: answerResponseFormat }),
      ).rejects.toThrow("required grounding");
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );
  it.each([false, true])("returns only the application-owned no-evidence answer (stream=%s)", async (streaming) => {
    const fetch = vi.fn(async () =>
      Response.json(completion({ content: JSON.stringify({ tool: "finish", arguments: {} }) })),
    );
    vi.stubGlobal("fetch", fetch);
    const safe = JSON.stringify({ segments: [{ text: "Not found in the course.", sourceIds: [] }] });
    const chat = createChatModel(env, {
      maxTokens: 1024,
      timeoutMs: 1000,
      localToolPolicy: () => ({ systemPrompt: "Look up evidence", requireTool: false, emptyEvidenceAnswer: safe }),
    });
    let text = "";
    if (streaming)
      for await (const chunk of await chat.stream(messages, { tools, response_format: answerResponseFormat }))
        text += chunk.text;
    else text = (await chat.invoke(messages, { tools, response_format: answerResponseFormat })).text;
    expect(text).toBe(safe);
    expect(text).not.toContain("UNSUPPORTED");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("honors an explicit no-tools choice without making a planning request", async () => {
    const fetch = vi.fn(async (_url: unknown, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      expect(body.tools).toBeUndefined();
      expect(body.response_format.json_schema.name).toBe("videoq_answer");
      return Response.json(completion({ content: '{"segments":[{"text":"Metadata.","sourceIds":[]}]}' }));
    });
    vi.stubGlobal("fetch", fetch);
    expect(
      (await model().invoke(messages, { tools, tool_choice: "none", response_format: answerResponseFormat })).text,
    ).toContain("Metadata");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("preserves the hosted model's native tools and final-answer schema", async () => {
    const fetch = vi.fn(async (_url: unknown, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      expect(body.tools).toHaveLength(1);
      expect(body.response_format.json_schema.name).toBe("videoq_answer");
      return Response.json(completion({ content: '{"segments":[{"text":"Native response.","sourceIds":[]}]}' }));
    });
    vi.stubGlobal("fetch", fetch);
    const chat = createChatModel({ ...env, LLM_SEPARATE_TOOL_SCHEMA: "false" }, { maxTokens: 1024, timeoutMs: 1000 });
    expect((await chat.invoke(messages, { tools, response_format: answerResponseFormat })).text).toContain(
      "Native response",
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
