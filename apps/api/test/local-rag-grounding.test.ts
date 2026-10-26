import { afterEach, describe, it, expect, vi } from "vitest";
import { chatAnswerText } from "@videoq/trpc/chat";
import { chatCompletionResponse } from "./helpers/chat-completion-response";
import type { Bindings } from "../src/types/bindings";
import type { SceneHit } from "../src/repositories/vector-repository";

const search = vi.fn();
const getCourseInfo = vi.fn();
const getVideoEvidence = vi.fn();
vi.mock("../src/repositories/vector-repository", () => ({
  openSceneSearch: async () => ({ search, close: async () => {} }),
}));
vi.mock("../src/repositories/course-repository", () => ({ getCourseInfo }));
vi.mock("../src/repositories/video-evidence-repository", () => ({ getVideoEvidence }));
const { runRag, streamRag, MAX_TOOL_ROUNDS } = await import("../src/lib/rag");
const env = {
  OPENAI_API_KEY: "test",
  OPENAI_BASE_URL: "http://local.test/v1",
  LLM_MODEL: "videoq-chat",
  LLM_SEPARATE_TOOL_SCHEMA: "true",
  VIDEO_VISUAL_ENABLED: "false",
} as Bindings;
const params = {
  messages: [{ role: "user", content: "講座で説明された保存期間は？" }],
  ownerUserId: "test",
  courseId: 1,
  videoIds: [1, 2],
  locale: "ja",
};
const hit: SceneHit = {
  videoId: 2,
  videoTitle: "第2回",
  content: "二年間保管します。",
  startTime: "00:00:03,000",
  endTime: "00:00:07,000",
};
const course = {
  id: 1,
  name: "Test",
  description: "",
  video_count: 2,
  videos: [1, 2].map((id) => ({ id, title: `第${id}回`, description: "", status: "completed", order: id })),
};
const plan = (tool: string, args: Record<string, unknown> = {}) => ({ tool, arguments: args });
const answer = { segments: [{ text: "二年間保管します。", sourceIds: [1] }] };
function provider(turns: unknown[]) {
  const bodies: Record<string, any>[] = [];
  vi.stubGlobal("fetch", async (_url: unknown, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    // Route reference extraction independently of the agent's tool rounds.
    if (body.response_format?.json_schema?.name === "videoq_video_references") {
      const index = turns.findIndex((value) => value && typeof value === "object" && "references" in value);
      const content = index >= 0 ? turns.splice(index, 1)[0] : { references: [] };
      return chatCompletionResponse(
        { choices: [{ finish_reason: "stop", message: { role: "assistant", content: JSON.stringify(content) } }] },
        body.stream,
        "local-references",
      );
    }
    bodies.push(body);
    const content = turns.shift();
    if (content === undefined) throw new Error("Unexpected extra model call");
    return chatCompletionResponse(
      { choices: [{ finish_reason: "stop", message: { role: "assistant", content: JSON.stringify(content) } }] },
      body.stream,
      `local-${bodies.length}`,
    );
  });
  return bodies;
}
async function ask(stream: boolean, question = params.messages[0].content) {
  const input = { ...params, messages: [{ role: "user", content: question }] };
  if (!stream) return (await runRag(env, input)).answer;
  let text = "";
  for await (const chunk of streamRag(env, input)) {
    if ("part" in chunk && chunk.part.type === "text") text += chunk.part.text;
    if ("final" in chunk) {
      expect(text).toBe(chatAnswerText(chunk.final.answer));
      return chunk.final.answer;
    }
  }
  throw new Error("No final answer");
}
const options = (body: Record<string, any>) =>
  body.response_format.json_schema.schema.anyOf.map((choice: any) => choice.properties.tool.const);
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

describe.each([false, true])("local RAG evidence policy (stream=%s)", (stream) => {
  it("keeps pagination available until all pages are read, then requires scoped content evidence", async () => {
    getCourseInfo.mockImplementation(async (_env, _course, _owner, options) => ({
      ...course,
      videos: course.videos.slice(options.videoOffset, options.videoOffset + options.videoLimit),
    }));
    search.mockResolvedValue([hit]);
    const bodies = provider([
      { sources: ["video_content"], scope: "course" },
      plan("get_course_info", { video_limit: 1, video_offset: 1 }),
      plan("get_course_info", { video_limit: 1, video_offset: 0 }),
      plan("search_scenes", { query: "保存期間", video_ids: [2] }),
      plan("finish"),
      answer,
    ]);
    expect(chatAnswerText(await ask(stream))).toContain("二年");
    expect(options(bodies[2])).toContain("get_course_info"); // Last page first is incomplete.
    expect(options(bodies[3])).not.toContain("get_course_info");
    expect(options(bodies[3])).not.toContain("finish");
    expect(options(bodies[4])).toContain("finish");
    expect(search).toHaveBeenCalledExactlyOnceWith("保存期間", [2]);
  });
  it("answers metadata without opening scene retrieval", async () => {
    getCourseInfo.mockResolvedValue(course);
    const bodies = provider([
      { sources: ["registered_video_count"], scope: "course" },
      plan("get_course_info", { video_limit: 20, video_offset: 0 }),
      plan("finish"),
      { segments: [{ text: "動画は2本です。", sourceIds: [] }] },
    ]);
    expect(chatAnswerText(await ask(stream))).toContain("2本");
    expect(options(bodies[1])).toEqual(["get_course_info"]);
    expect(search).not.toHaveBeenCalled();
  });
  it("does not count an unauthorized selection as completed retrieval", async () => {
    search.mockResolvedValue([hit]);
    const bodies = provider([
      { sources: ["video_content"], scope: "course" },
      plan("search_scenes", { query: "保存期間", video_ids: [999] }),
      plan("search_scenes", { query: "保存期間", video_ids: [2] }),
      plan("finish"),
      answer,
    ]);
    expect((await ask(stream)).sources[0].video_id).toBe(2);
    expect(options(bodies[2])).not.toContain("finish");
    expect(search).toHaveBeenCalledExactlyOnceWith("保存期間", [2]);
  });
  it("requires metadata for an explicit lecture, then rejects course-wide search", async () => {
    getCourseInfo.mockResolvedValue(course);
    const bodies = provider([
      { sources: ["video_content"], scope: "specific_videos" },
      plan("get_course_info", { video_limit: 20, video_offset: 0 }),
      { references: [{ kind: "lecture_number", quote: "第2回", number: 2 }] },
      plan("search_scenes", { query: "保存期間", video_ids: null }),
    ]);
    await expect(ask(stream, "第2回の保存期間は？")).rejects.toThrow("broadened its video selection");
    expect(options(bodies[1])).toEqual(["get_course_info"]);
    const choice = bodies[2].response_format.json_schema.schema.anyOf.find(
      (v: any) => v.properties.tool.const === "search_scenes",
    );
    expect(choice.properties.arguments.properties.video_ids).toMatchObject({ type: "array", items: { enum: [2] } });
    expect(search).not.toHaveBeenCalled();
  });
  it("finishes safely when the requested lecture cannot be identified", async () => {
    getCourseInfo.mockResolvedValue(course);
    const bodies = provider([
      { sources: ["video_content"], scope: "specific_videos" },
      plan("get_course_info", { video_limit: 20, video_offset: 0 }),
      { references: [{ kind: "lecture_number", quote: "第99回", number: 99 }] },
    ]);
    expect(chatAnswerText(await ask(stream, "第99回の保存期間は？"))).toBe(
      "該当する情報を講座の資料から確認できませんでした。",
    );
    expect(bodies).toHaveLength(2);
    expect(search).not.toHaveBeenCalled();
  });
  it("retains a known subset and explicitly reports unresolved requested videos", async () => {
    getCourseInfo.mockResolvedValue(course);
    search.mockResolvedValue([hit]);
    const bodies = provider([
      { sources: ["video_content"], scope: "specific_videos" },
      plan("get_course_info", { video_limit: 20, video_offset: 0 }),
      {
        references: [
          { kind: "lecture_number", quote: "第2回", number: 2 },
          { kind: "lecture_number", quote: "第99回", number: 99 },
        ],
      },
      plan("search_scenes", { query: "保存期間", video_ids: [2] }),
      plan("finish"),
      answer,
    ]);
    expect((await ask(stream, "第2回と第99回の保存期間は？")).sources.every((source) => source.video_id === 2)).toBe(
      true,
    );
    expect(bodies.at(-1).messages[0].content).toContain("Not all requested videos could be identified");
    expect(search).toHaveBeenCalledExactlyOnceWith("保存期間", [2]);
  });
  it("returns the application no-evidence response without another answer generation", async () => {
    search.mockResolvedValue([]);
    const bodies = provider([
      { sources: ["video_content"], scope: "course" },
      plan("search_scenes", { query: "電話番号", video_ids: null }),
      plan("finish"),
    ]);
    const result = await ask(stream);
    expect(chatAnswerText(result)).toBe("該当する情報を講座の資料から確認できませんでした。");
    expect(result.sources).toEqual([]);
    expect(bodies).toHaveLength(3);
  });
  it("does not generate unsupported prose when empty retrieval exhausts the tool budget", async () => {
    search.mockResolvedValue([]);
    const bodies = provider([
      { sources: ["video_content"], scope: "course" },
      ...Array.from({ length: MAX_TOOL_ROUNDS }, () => plan("search_scenes", { query: "電話番号", video_ids: null })),
      { segments: [{ text: "電話番号は03-1234-5678です。", sourceIds: [] }] },
    ]);
    const result = await ask(stream);
    expect(chatAnswerText(result)).toBe("該当する情報を講座の資料から確認できませんでした。");
    expect(result.sources).toEqual([]);
    expect(bodies).toHaveLength(MAX_TOOL_ROUNDS + 1);
  });
  it("handles an unavailable authorized video without inventing evidence or looping", async () => {
    getVideoEvidence.mockResolvedValue(null);
    const bodies = provider([
      { sources: ["video_content"], scope: "course" },
      plan("overview_video", { video_id: 2, query: "画面の内容", include_visuals: false }),
      plan("finish"),
    ]);
    expect(chatAnswerText(await ask(stream))).toBe("該当する情報を講座の資料から確認できませんでした。");
    expect(bodies).toHaveLength(3);
    expect(search).not.toHaveBeenCalled();
  });
  it("allows correction after invalid metadata arguments", async () => {
    getCourseInfo.mockResolvedValue(course);
    const bodies = provider([
      { sources: ["registered_video_count"], scope: "course" },
      plan("get_course_info", { video_limit: 999, video_offset: 0 }),
      plan("get_course_info", { video_limit: 20, video_offset: 0 }),
      plan("finish"),
      { segments: [{ text: "2本です。", sourceIds: [] }] },
    ]);
    expect(chatAnswerText(await ask(stream))).toContain("2本");
    expect(options(bodies[2])).not.toContain("finish");
    expect(getCourseInfo).toHaveBeenCalledTimes(1);
  });
  it("propagates a failed DB lookup instead of turning it into an unsupported answer", async () => {
    getCourseInfo.mockRejectedValue(new Error("DB unavailable"));
    const bodies = provider([
      { sources: ["registered_video_count"], scope: "course" },
      plan("get_course_info", { video_limit: 20, video_offset: 0 }),
    ]);
    await expect(ask(stream)).rejects.toThrow("DB unavailable");
    expect(bodies).toHaveLength(2);
    expect(search).not.toHaveBeenCalled();
  });
});
