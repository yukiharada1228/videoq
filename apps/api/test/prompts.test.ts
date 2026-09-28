import { describe, it, expect } from "vitest";
import { buildAgentSystemPrompt, buildNoCourseSystemPrompt } from "../src/lib/prompts";

describe("structured answer instructions", () => {
  it.each([null, "ja", "ja-JP"])("%s specifies segments without prose markers", locale => {
    const prompt = buildNoCourseSystemPrompt(locale);
    expect(prompt).toContain('"segments"');
    expect(prompt).toContain('"sourceIds"');
    expect(prompt).not.toContain('[N]');
    expect(prompt).toContain(locale ? '講座を選択' : 'select a course');
  });
  it("resolves regional and unknown locales", () => {
    expect(buildNoCourseSystemPrompt("ja-JP")).toBe(buildNoCourseSystemPrompt("ja"));
    expect(buildNoCourseSystemPrompt("fr-FR")).toBe(buildNoCourseSystemPrompt(null));
  });
});

describe("ReAct の根拠の使い分け", () => {
  it.each([null, "ja", "ja-JP"])("%s: メタ情報ツールと取得上限を説明する", (locale) => {
    const prompt = buildAgentSystemPrompt(locale, 3, 5);
    expect(prompt).toContain("get_course_info");
    expect(prompt).toContain("search_scenes.video_ids");
    expect(prompt).toContain("videos_meta.next_offset");
    expect(prompt).not.toContain("{max_course_info_calls}");
    expect(prompt).not.toContain("Always search at least once");
    expect(prompt).not.toContain("最低1回は検索");
    expect(prompt).toContain(locale ? "メタ情報だけの回答は sourceIds を空配列" : "Use an empty sourceIds array for metadata-only answers");
  });
});
