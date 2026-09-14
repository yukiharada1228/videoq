import { describe, expect, it, vi } from "vitest";
import type { SceneHit } from "../../src/repositories/vector-repository";
import type { Bindings } from "../../src/types/bindings";
import type { RagStreamChunk } from "../../src/lib/rag";

/**
 * ReAct（createAgent / LangGraph）が Workers ランタイムで動くことの確認。
 * Node の unit テストと違い workerd 上で実行されるので、AsyncLocalStorage など
 * nodejs_compat 依存の有無をここで検出する。
 */

const searchCalls: string[] = [];

vi.mock("../../src/repositories/vector-repository", () => ({
  RETRIEVER_K: 20,
  openSceneSearch: async () => ({
    search: async (query: string): Promise<SceneHit[]> => {
      searchCalls.push(query);
      return [
        {
          content: "scene text A",
          videoId: 60,
          videoTitle: "Video A",
          startTime: "00:00:10",
          endTime: "00:00:20",
        },
      ];
    },
    close: async () => {},
  }),
}));

const { runRag, streamRag } = await import("../../src/lib/rag");

const ENV = {
  OPENAI_API_KEY: "sk-test",
  OPENAI_BASE_URL: "https://openai.test/v1",
  LLM_MODEL: "local-codex-model",
} as unknown as Bindings;

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

describe("RAG agent in the Workers runtime", () => {
  it.each([false, true])("runs the search_scenes tool loop and answers with citations (stream=%s)", async (streaming) => {
    let call = 0;
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      expect(url).toBe("https://openai.test/v1/chat/completions");
      expect(JSON.parse(String(init.body)).stream).toBe(streaming);
      call += 1;
      if (streaming) {
        const deltas = call === 1
          ? [
              { role: "assistant", content: "Let me search." },
              { tool_calls: [{
                index: 0,
                id: "call_1",
                type: "function",
                function: { name: "search_scenes", arguments: JSON.stringify({ query: "pgvector" }) },
              }] },
            ]
          : [{ role: "assistant", content: "Answer [1]." }];
        const frames = deltas.map((delta) => `data: ${JSON.stringify({ choices: [{ delta }] })}\n\n`);
        frames.push("data: [DONE]\n\n");
        return new Response(frames.join(""), { headers: { "content-type": "text/event-stream" } });
      }
      if (call === 1) {
        return json({
          choices: [
            {
              finish_reason: "tool_calls",
              message: {
                role: "assistant",
                content: null,
                tool_calls: [
                  {
                    id: "call_1",
                    type: "function",
                    function: {
                      name: "search_scenes",
                      arguments: JSON.stringify({ query: "pgvector" }),
                    },
                  },
                ],
              },
            },
          ],
        });
      }
      return json({
        choices: [{ finish_reason: "stop", message: { role: "assistant", content: "Answer [1]." } }],
      });
    });

    try {
      const params = {
        messages: [{ role: "user", content: "what is pgvector?" }],
        ownerUserId: "00000000-0000-4000-8000-000000000005",
        videoIds: [60],
        locale: null,
        courseContext: null,
      };
      const chunks: RagStreamChunk[] = [];
      const result = streaming
        ? await (async () => {
            for await (const chunk of streamRag(ENV, params)) chunks.push(chunk);
            const final = chunks.find((chunk) => "final" in chunk);
            return {
              ...final?.final,
              content: chunks.filter((chunk) => "text" in chunk).map((chunk) => chunk.text).join(""),
            };
          })()
        : await runRag(ENV, params);

      expect(searchCalls).toEqual(["pgvector"]);
      expect(result.content).toBe("Answer [1].");
      expect(result.citations).toEqual([
        { video_id: 60, title: "Video A", start_time: "00:00:10", end_time: "00:00:20" },
      ]);
      expect(result.retrievedContexts).toEqual(["scene text A"]);
    } finally {
      vi.unstubAllGlobals();
      searchCalls.length = 0;
    }
  });
});
