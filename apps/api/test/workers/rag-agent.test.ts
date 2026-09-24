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
let opened = 0;
const videoSelections: (readonly number[] | undefined)[] = [];

vi.mock("../../src/repositories/vector-repository", () => ({
  openSceneSearch: async () => {
    opened += 1;
    return {
    search: async (query: string, videoIds?: readonly number[]): Promise<SceneHit[]> => {
      searchCalls.push(query);
      videoSelections.push(videoIds);
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
    };
  },
}));

vi.mock("../../src/repositories/course-repository", () => ({
  getCourseInfo: async () => ({
    name: "Course A", description: "Course description", video_count: 1,
    videos: [{ id: 60, title: "Video A", description: "", order: 0, status: "processing" }],
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
  it.each([false, true].flatMap((streaming) => ["search", "metadata", "metadata-search"].map((mode) => ({ streaming, mode }))))
    ("runs the $mode tool loop (stream=$streaming)", async ({ streaming, mode }) => {
    let call = 0;
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      expect(url).toBe("https://openai.test/v1/chat/completions");
      expect(JSON.parse(String(init.body)).stream).toBe(false);
      call += 1;
      const metadataTurn = mode !== "search" && call === 1;
      const searchTurn = mode === "search" ? call === 1 : mode === "metadata-search" && call === 2;
      const toolName = metadataTurn ? "get_course_info" : "search_scenes";
      const args = metadataTurn ? {} : { query: "pgvector", ...(mode === "metadata-search" ? { video_ids: [60] } : {}) };
      const answer = mode === "metadata" ? "Course A has one video." : "Answer [1].";
      if (metadataTurn || searchTurn) {
        return json({
          choices: [
            {
              finish_reason: "tool_calls",
              message: {
                role: "assistant",
                content: null,
                tool_calls: [
                  {
                    id: `call_${call}`,
                    type: "function",
                    function: {
                      name: toolName,
                      arguments: JSON.stringify(args),
                    },
                  },
                ],
              },
            },
          ],
        });
      }
      return json({
        choices: [{ finish_reason: "stop", message: { role: "assistant", content: answer } }],
      });
    });

    try {
      const params = {
        messages: [{ role: "user", content: "what is pgvector?" }],
        ownerUserId: "00000000-0000-4000-8000-000000000005",
        videoIds: [60],
        locale: null,
        courseId: mode === "search" ? null : 3,
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

      if (mode === "metadata") {
        expect(searchCalls).toEqual([]);
        expect(opened).toBe(0);
        expect(result.content).toBe("Course A has one video.");
        expect(result.citations).toBeNull();
        expect(result.retrievedContexts?.[0]).toContain("Course metadata");
        return;
      }
      expect(searchCalls).toEqual(["pgvector"]);
      expect(result.content).toBe("Answer [1].");
      expect(result.citations).toEqual([
        { video_id: 60, title: "Video A", start_time: "00:00:10", end_time: "00:00:20" },
      ]);
      expect(result.retrievedContexts?.[0]).toBe("scene text A");
      if (mode === "metadata-search") {
        expect(videoSelections).toEqual([[60]]);
        expect(result.retrievedContexts?.[1]).toContain("Course metadata");
      }
    } finally {
      vi.unstubAllGlobals();
      searchCalls.length = 0;
      opened = 0;
      videoSelections.length = 0;
    }
  });
});
