import { describe, it, expect, vi, afterEach } from "vitest";
import { chatAnswerText } from "@videoq/trpc/chat";
import type { Bindings } from "../src/types/bindings";
import type { SceneHit } from "../src/repositories/vector-repository";

// An explicitly local, opt-in model/component check. Retrieval is fixed here;
// the Mac acceptance runner separately exercises actual DB/vector retrieval.
const enabled = process.env.LOCAL_DEMO_LIVE === "1";
const base = process.env.LOCAL_DEMO_LLM_URL ?? "http://127.0.0.1:18000/v1";
if (enabled) {
  const url = new URL(base);
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || url.username || url.password)
    throw new Error("Local demo inference only accepts the loopback model server");
}
const env = {
  OPENAI_API_KEY: "local-demo",
  OPENAI_BASE_URL: base,
  LLM_MODEL: "videoq-chat",
  LLM_REASONING_EFFORT: "none",
  LLM_SEPARATE_TOOL_SCHEMA: "true",
  LLM_REQUEST_TIMEOUT_MS: "600000",
  LLM_STREAM_TIMEOUT_MS: "600000",
  VIDEO_VISUAL_ENABLED: "false",
  DEPLOYMENT_EDITION: "onprem",
} as Bindings;
let activeScenes: SceneHit[];
let activeCourse: Record<string, unknown> | undefined;
const search = vi.fn(async (_query: string, ids?: readonly number[]) =>
  activeScenes.filter((scene) => !ids || ids.includes(scene.videoId)),
);
const getVideoEvidence = vi.fn(async (_env: unknown, scope: { videoIds: readonly number[] }, id: number) => {
  if (!scope.videoIds.includes(id)) return null;
  const rows = activeScenes.filter((scene) => scene.videoId === id);
  return rows.length
    ? {
        id,
        title: rows[0].videoTitle,
        sourceType: "uploaded",
        fileKey: "fixture.mp4",
        transcriptTooLarge: false,
        transcript: rows
          .map((scene, i) => `${i + 1}\n${scene.startTime} --> ${scene.endTime}\n${scene.content}`)
          .join("\n\n"),
      }
    : null;
});
vi.mock("../src/repositories/vector-repository", () => ({
  openSceneSearch: async () => ({ search, close: async () => {} }),
}));
vi.mock("../src/repositories/video-evidence-repository", () => ({ getVideoEvidence }));
vi.mock("../src/repositories/course-repository", () => ({
  getCourseInfo: async () =>
    activeCourse ?? {
      id: 1,
      name: "Onprem Lab",
      description: "",
      video_count: 1,
      videos: [{ id: 1, title: "Onprem Lab", description: "", status: "completed", order: 0 }],
      videos_meta: { total: 1, next_offset: null },
    },
}));
const { runRag, streamRag } = await import("../src/lib/rag");
const scenes: SceneHit[] = [
  ["これは架空の研修デモです。", "00:00:00,000", "00:00:02,280"],
  ["旅費の申請は、出場の3営業日前までに総務", "00:00:02,280", "00:00:06,240"],
  ["へ提出します。", "00:00:06,240", "00:00:07,680"],
  ["領収書は経費管理システムに登録し、原本は", "00:00:07,680", "00:00:11,930"],
  ["1年間保管します。", "00:00:11,930", "00:00:13,920"],
  ["機密情報を含む動画は、社内のサーバーだけ", "00:00:13,920", "00:00:17,550"],
  ["で処理し、社外へ送信しません。", "00:00:17,550", "00:00:20,520"],
].map(([content, startTime, endTime]) => ({ content, startTime, endTime, videoId: 1, videoTitle: "Onprem Lab" }));
activeScenes = scenes;
describe.skipIf(!enabled).each([false, true])("public CPU baseline (stream=%s)", (stream) => {
  it("answers the quoted topic from the public sample, using its subtitle evidence", async () => {
    activeScenes = [
      {
        videoId: 1,
        videoTitle: "Onprem Lab",
        content: "インターネットで敵対的環境コースについて検索すると、おそらく現地企業の住所が出てくるでしょう。",
        startTime: "00:00:01,552",
        endTime: "00:00:08,232",
      },
    ];
    const params = {
      messages: [
        {
          role: "user",
          content: "動画では、インターネットで「敵対的環境コース」を検索すると何の住所が出てくると述べていますか？",
        },
      ],
      ownerUserId: "00000000-0000-4000-8000-000000000005",
      courseId: 1,
      videoIds: [1],
      locale: "en",
    };
    let answer;
    if (stream) {
      for await (const chunk of streamRag(env, params)) if ("final" in chunk) answer = chunk.final.answer;
    } else answer = (await runRag(env, params)).answer;
    expect(answer).toBeDefined();
    if (!answer) throw new Error("Missing answer");
    console.log(JSON.stringify({ kind: "public CPU baseline", stream, answer }));
    expect(chatAnswerText(answer)).toMatch(/住所/);
    expect(chatAnswerText(answer)).toMatch(/企業|会社/);
    expect(answer.segments.flatMap((segment) => segment.sourceIds).length).toBeGreaterThan(0);
    expect(answer.sources).toHaveLength(1);
    expect(answer.sources[0].video_id).toBe(1);
    expect(search.mock.calls.length + getVideoEvidence.mock.calls.length).toBeGreaterThan(0);
  }, 180000);
  it("keeps an explicitly named video scoped while distinguishing a quoted topic", async () => {
    activeScenes = [
      {
        videoId: 1,
        videoTitle: "安全研修",
        content: "領収書の原本は二年間保管します。",
        startTime: "00:00:01,000",
        endTime: "00:00:04,000",
      },
      {
        videoId: 2,
        videoTitle: "別の研修",
        content: "領収書の原本は一年間保管します。",
        startTime: "00:00:01,000",
        endTime: "00:00:04,000",
      },
    ];
    activeCourse = {
      id: 1,
      name: "Onprem Lab",
      description: "",
      video_count: 2,
      videos: activeScenes.map((scene, i) => ({
        id: scene.videoId,
        title: scene.videoTitle,
        description: "",
        status: "completed",
        order: i,
      })),
    };
    const params = {
      messages: [{ role: "user", content: "「安全研修」というタイトルの動画で、領収書の原本を何年間保管しますか？" }],
      ownerUserId: "00000000-0000-4000-8000-000000000005",
      courseId: 1,
      videoIds: [1, 2],
      locale: "ja",
    };
    let answer;
    if (stream) {
      for await (const chunk of streamRag(env, params)) if ("final" in chunk) answer = chunk.final.answer;
    } else answer = (await runRag(env, params)).answer;
    expect(answer).toBeDefined();
    if (!answer) throw new Error("Missing answer");
    expect(chatAnswerText(answer).normalize("NFKC")).toMatch(/2年|二年/);
    for (const call of search.mock.calls) expect(call[1]).toEqual([1]);
    for (const call of getVideoEvidence.mock.calls) expect(call[2]).toBe(1);
    expect(answer.sources.length).toBeGreaterThan(0);
    expect(answer.sources.every((source) => source.video_id === 1)).toBe(true);
  }, 180000);
});
const cases = [
  { question: "旅費の申請は、出張の何日前までに、どこへ提出しますか？", terms: ["営業日", "総務"], value: /3|三/ },
  { question: "領収書はどこに登録し、原本をどのくらい保管しますか？", terms: ["経費管理システム"], value: /1年|一年/ },
  {
    question: "機密情報を含む動画はどこで処理し、社外へ送信しますか？",
    terms: ["社内", "社外"],
    value: /しない|しません|せず|禁止/,
  },
];
afterEach(() => {
  vi.clearAllMocks();
  activeScenes = scenes;
  activeCourse = undefined;
});
describe.skipIf(!enabled).each([false, true])("local model demo retrieval (stream=%s)", (stream) => {
  it.each(cases)(
    "$question",
    async ({ question, terms, value }) => {
      const params = {
        messages: [{ role: "user", content: question }],
        ownerUserId: "00000000-0000-4000-8000-000000000005",
        courseId: 1,
        videoIds: [1],
        locale: "ja",
      };
      let answer;
      if (stream) {
        for await (const chunk of streamRag(env, params)) if ("final" in chunk) answer = chunk.final.answer;
      } else answer = (await runRag(env, params)).answer;
      expect(answer).toBeDefined();
      if (!answer) throw new Error("Missing answer");
      console.log(JSON.stringify({ question, stream, answer }));
      const text = chatAnswerText(answer).normalize("NFKC").replace(/\s/g, "");
      for (const term of terms) expect(text).toContain(term);
      expect(text).toMatch(value);
      expect(search).toHaveBeenCalled();
      expect(answer.sources.length).toBeGreaterThan(0);
      expect(answer.segments.flatMap((s) => s.sourceIds).length).toBeGreaterThan(0);
    },
    180000,
  );
});

describe.skipIf(!enabled).each([false, true])("local model metadata (stream=%s)", (stream) => {
  it("answers the video count from course metadata", async () => {
    const params = {
      messages: [{ role: "user", content: "この講座の動画は何本ありますか？" }],
      ownerUserId: "00000000-0000-4000-8000-000000000005",
      courseId: 1,
      videoIds: [1],
      locale: "ja",
    };
    let answer;
    if (stream) {
      for await (const chunk of streamRag(env, params)) if ("final" in chunk) answer = chunk.final.answer;
    } else answer = (await runRag(env, params)).answer;
    expect(answer).toBeDefined();
    if (!answer) throw new Error("Missing answer");
    console.log(JSON.stringify({ question: params.messages[0].content, stream, answer }));
    expect(chatAnswerText(answer).normalize("NFKC")).toMatch(/1|一/);
    expect(search).not.toHaveBeenCalled();
    expect(answer.sources).toEqual([]);
  }, 180000);
});

describe.skipIf(!enabled).each([false, true])("local model evidence boundaries (stream=%s)", (stream) => {
  async function ask(question: string, videoIds = [1]) {
    const params = {
      messages: [{ role: "user", content: question }],
      ownerUserId: "00000000-0000-4000-8000-000000000005",
      courseId: 1,
      videoIds,
      locale: "ja",
    };
    if (!stream) return (await runRag(env, params)).answer;
    for await (const chunk of streamRag(env, params)) if ("final" in chunk) return chunk.final.answer;
    throw new Error("Missing final answer");
  }
  it("does not invent a telephone number absent from retrieved subtitles", async () => {
    const answer = await ask("この動画で案内された緊急連絡先の電話番号は何番ですか？");
    const text = chatAnswerText(answer);
    console.log(JSON.stringify({ kind: "missing fact", stream, answer }));
    expect(search).toHaveBeenCalled();
    expect(text).toMatch(
      /確認でき|含まれ|記載|不明|わかりません|示されていません|提供されていません|案内されていません/,
    );
    expect(text).not.toMatch(/\d{2,}/);
  }, 180000);
  it("returns an explicit no-evidence answer when retrieval is empty", async () => {
    activeScenes = [];
    const answer = await ask("この動画で案内された緊急連絡先の電話番号は何番ですか？");
    console.log(JSON.stringify({ kind: "empty retrieval", stream, answer }));
    expect(search).toHaveBeenCalled();
    expect(chatAnswerText(answer)).toBe("該当する情報を講座の資料から確認できませんでした。");
    expect(answer.sources).toEqual([]);
  }, 180000);
  it("identifies the second lecture and keeps every search and citation within it", async () => {
    activeScenes = [
      {
        videoId: 1,
        videoTitle: "第1回",
        content: "領収書の原本は一年間保管します。",
        startTime: "00:00:01,000",
        endTime: "00:00:04,000",
      },
      {
        videoId: 2,
        videoTitle: "第2回",
        content: "第2回のルールでは領収書の原本を二年間保管します。",
        startTime: "00:00:03,000",
        endTime: "00:00:07,000",
      },
    ];
    activeCourse = {
      id: 1,
      name: "Onprem Lab",
      description: "",
      video_count: 2,
      videos: [
        { id: 1, title: "第1回", description: "", status: "completed", order: 0 },
        { id: 2, title: "第2回", description: "", status: "completed", order: 1 },
      ],
    };
    const answer = await ask("第2回では、領収書の原本を何年間保管すると説明していますか？", [1, 2]);
    console.log(JSON.stringify({ kind: "video selection", stream, answer }));
    expect(chatAnswerText(answer).normalize("NFKC")).toMatch(/二年|2年/);
    expect(search.mock.calls.length + getVideoEvidence.mock.calls.length).toBeGreaterThan(0);
    for (const call of search.mock.calls) expect(call[1]).toEqual([2]);
    for (const call of getVideoEvidence.mock.calls) expect(call[2]).toBe(2);
    expect(answer.sources.length).toBeGreaterThan(0);
    expect(answer.sources.every((source) => source.video_id === 2)).toBe(true);
  }, 180000);
  it("does not substitute another lecture for an unavailable requested lecture", async () => {
    activeCourse = {
      id: 1,
      name: "Onprem Lab",
      description: "",
      video_count: 2,
      videos: [
        { id: 1, title: "第1回", description: "", status: "completed", order: 0 },
        { id: 2, title: "第2回", description: "", status: "completed", order: 1 },
      ],
    };
    const answer = await ask("第99回では、領収書の原本を何年間保管すると説明していますか？", [1, 2]);
    console.log(JSON.stringify({ kind: "unavailable lecture", stream, answer }));
    expect(chatAnswerText(answer)).toBe("該当する情報を講座の資料から確認できませんでした。");
    expect(search).not.toHaveBeenCalled();
    expect(getVideoEvidence).not.toHaveBeenCalled();
    expect(answer.sources).toEqual([]);
  }, 180000);

  it("answers the identified lecture and discloses an unresolved lecture in a mixed request", async () => {
    activeScenes = [
      {
        videoId: 1,
        videoTitle: "第1回",
        content: "領収書の原本は一年間保管します。",
        startTime: "00:00:01,000",
        endTime: "00:00:04,000",
      },
      {
        videoId: 2,
        videoTitle: "第2回",
        content: "領収書の原本は二年間保管します。",
        startTime: "00:00:03,000",
        endTime: "00:00:07,000",
      },
    ];
    activeCourse = {
      id: 1,
      name: "Onprem Lab",
      description: "",
      video_count: 2,
      videos: [
        { id: 1, title: "第1回", description: "", status: "completed", order: 0 },
        { id: 2, title: "第2回", description: "", status: "completed", order: 1 },
      ],
    };
    const answer = await ask("第2回と第99回で、領収書の原本の保管期間をそれぞれ教えてください。", [1, 2]);
    console.log(JSON.stringify({ kind: "partial video selection", stream, answer }));
    const text = chatAnswerText(answer).normalize("NFKC");
    expect(text).toMatch(/二年|2年/);
    expect(text).toContain("第99回");
    expect(text).toMatch(/確認でき|特定でき|見つか|存在し|登録されてい|不明/);
    for (const call of search.mock.calls) expect(call[1]).toEqual([2]);
    for (const call of getVideoEvidence.mock.calls) expect(call[2]).toBe(2);
    expect(answer.sources.length).toBeGreaterThan(0);
    expect(answer.sources.every((source) => source.video_id === 2)).toBe(true);
  }, 180000);
});
