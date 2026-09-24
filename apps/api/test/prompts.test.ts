import { describe, it, expect } from "vitest";
import { buildAgentSystemPrompt, buildNoCourseSystemPrompt } from "../src/lib/prompts";

/** System prompt output is pinned with SHA-256 vectors. */
async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

describe("buildNoCourseSystemPrompt", () => {
  it("default ロケール・参照なし", async () => {
    const p = buildNoCourseSystemPrompt(null);
    expect(p.length).toBe(3590);
    expect(await sha256(p)).toBe(
      "49175c7173795f260d0fecf10ac4d0b2f606051ed2e36de1a52fb0101d98d703",
    );
  });

  it("ja-JP はハイフン前にフォールバックして ja を採用", async () => {
    const p = buildNoCourseSystemPrompt("ja-JP");
    expect(p.length).toBe(1473);
    expect(await sha256(p)).toBe(
      "4426d957e5147c698d599e622be926915a74c4189e374f8271f83122faa7885a",
    );
  });

  it("未知ロケールは default と同一", async () => {
    const base = await sha256(buildNoCourseSystemPrompt(null));
    expect(await sha256(buildNoCourseSystemPrompt("fr-FR"))).toBe(base);
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
    expect(prompt).toContain(locale ? "メタ情報だけの回答にシーン引用は不要" : "Metadata-only answers need no scene citations");
  });
});
