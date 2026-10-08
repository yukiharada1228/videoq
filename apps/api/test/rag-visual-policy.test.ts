import { afterEach, expect, it, vi } from "vitest";
import { runRag } from "../src/lib/rag";
import type { Bindings } from "../src/types/bindings";
import { chatCompletionResponse } from "./helpers/chat-completion-response";
import { focusCacheFixture } from "./helpers/focus-cache";

vi.mock("../src/repositories/vector-repository", () => ({ openSceneSearch: vi.fn() }));
vi.mock("../src/repositories/video-evidence-repository", () => ({ getVideoEvidence: async () => ({
  id: 42, title: "Fixture", sourceType: "uploaded", fileKey: "fixture.mp4", transcript: "", transcriptTooLarge: false,
}) }));
vi.mock("../src/integrations/media", () => ({
  readMediaBytes: async () => new TextEncoder().encode(JSON.stringify({ version: 1, video_id: 42,
    duration_seconds: 30, sampling_interval_seconds: 5, frames: [{ timestamp_seconds: 20, jpeg_base64: "/9j/2Q==" }],
  })),
  readMediaRange: async (_env: unknown, _key: string, offset: number, length: number) => {
    const pack = focusCacheFixture([5000]);
    return { bytes: pack.slice(offset, offset + length), etag: '"v2"', size: pack.length };
  },
}));
afterEach(() => vi.unstubAllGlobals());

it.each([
  ["4文字の英数字コードを、表示される時刻と一緒に教えてください。", "overview_video"],
  ["5〜9秒に見える図形の上段と下段の個数を教えてください。", "focus_clip"],
])("requires the appropriate viewing tool before answering %s", async (question, expectedTool) => {
  let turns = 0;
  let visionCalls = 0;
  vi.stubGlobal("fetch", async (_url: unknown, init: RequestInit) => {
    const request = JSON.parse(String(init.body));
    if (request.model === "vision-test") {
      visionCalls++;
      expect(JSON.stringify(request.messages)).toContain(question);
      return Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({
        observations: [{ frame_index: 0, observation: "Visible answer" }],
      }) } }] });
    }
    expect(request.model).toBe("visual-reasoner-test");
    if (turns++ === 0) {
      expect(request.tool_choice).toBe("required");
      expect(request.tools.map((t: { function: { name: string } }) => t.function.name)).toEqual([expectedTool]);
      const args = expectedTool === "overview_video"
        ? { video_id: 42, query: "code", include_visuals: false }
        : { video_id: 42, start_seconds: 5, end_seconds: 9, query: "shapes" };
      return chatCompletionResponse({ choices: [{ finish_reason: "tool_calls", message: { role: "assistant", content: null,
        tool_calls: [{ id: "view", type: "function", function: { name: expectedTool, arguments: JSON.stringify(args) } }],
      } }] }, request.stream, "view-turn");
    }
    expect(request.tool_choice).not.toBe("required");
    expect(JSON.stringify(request.messages)).toContain("Visible answer");
    return chatCompletionResponse({ choices: [{ finish_reason: "stop", message: { role: "assistant",
      content: JSON.stringify({ segments: [{ text: "Answer", sourceIds: [1] }] }),
    } }] }, request.stream, "answer-turn");
  });
  await runRag({ OPENAI_API_KEY: "test", OPENAI_BASE_URL: "https://test.invalid/v1", VISION_MODEL: "vision-test",
    VISUAL_REASONING_MODEL: "visual-reasoner-test" } as Bindings,
    { ownerUserId: "owner", videoIds: [42], locale: "ja", messages: [{ role: "user", content: question }] });
  expect(visionCalls).toBe(1);
});

it.each(["off", "nonvisual"])("does not force unavailable or unnecessary image tools (%s)", async condition => {
  vi.stubGlobal("fetch", async (_url: unknown, init: RequestInit) => {
    const request = JSON.parse(String(init.body));
    expect(request.model).toBe("gpt-4o-mini");
    expect(request.tool_choice).not.toBe("required");
    expect(request.tools.some((t: { function: { name: string } }) => t.function.name === "search_scenes")).toBe(true);
    return chatCompletionResponse({ choices: [{ finish_reason: "stop", message: { role: "assistant",
      content: JSON.stringify({ segments: [{ text: "Not verified", sourceIds: [] }] }),
    } }] }, request.stream, "answer-turn");
  });
  await runRag({ OPENAI_API_KEY: "test", OPENAI_BASE_URL: "https://test.invalid/v1",
    VISUAL_REASONING_MODEL: "visual-reasoner-test",
    ...(condition === "off" ? { VIDEO_VISUAL_ENABLED: "false" } : {}),
  } as Bindings, { ownerUserId: "owner", videoIds: [42], locale: "ja",
    messages: [{ role: "user", content: condition === "off" ? "画面のコードは？" : "勾配降下法を説明してください" }],
  });
});
