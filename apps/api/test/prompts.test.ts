import { describe, it, expect } from "vitest";
import { buildAgentSystemPrompt, buildSystemPrompt } from "../src/lib/prompts";

/** System prompt output is pinned with SHA-256 vectors. */
async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const REFS = [
  "[1] Video A 00:00:10 - 00:00:20\nhello content",
  "[2] Video B 00:01:00 - 00:01:30\nsecond",
];

describe("buildSystemPrompt", () => {
  it("default ロケール・参照なし", async () => {
    const p = buildSystemPrompt(null, undefined, null);
    expect(p.length).toBe(3590);
    expect(await sha256(p)).toBe(
      "49175c7173795f260d0fecf10ac4d0b2f606051ed2e36de1a52fb0101d98d703",
    );
  });

  it("default ロケール・参照あり", async () => {
    const p = buildSystemPrompt(null, REFS, null);
    expect(p.length).toBe(3706);
    expect(await sha256(p)).toBe(
      "1d9669494660b7d7ddabc1216212fce5b5b63ea7c6bad92a702cff1197ad9864",
    );
  });

  it("ja ロケール・参照 + course_context（前後空白は strip）", async () => {
    const p = buildSystemPrompt("ja", ["[1] 動画A 00:00:10 - 00:00:20\n本文"], "  講座説明  ");
    expect(p.length).toBe(1520);
    expect(await sha256(p)).toBe(
      "49bf4420c6e8a36c804c237bfd650dd263eb4199ebd6d260ca89a6ac98c7ab7e",
    );
  });

  it("ja-JP はハイフン前にフォールバックして ja を採用", async () => {
    const p = buildSystemPrompt("ja-JP", [], null);
    expect(p.length).toBe(1473);
    expect(await sha256(p)).toBe(
      "4426d957e5147c698d599e622be926915a74c4189e374f8271f83122faa7885a",
    );
  });

  it("未知ロケール・空白のみの参照は default と同一", async () => {
    const base = await sha256(buildSystemPrompt(null, undefined, null));
    expect(await sha256(buildSystemPrompt("fr-FR", undefined, null))).toBe(base);
    expect(await sha256(buildSystemPrompt(null, ["   ", ""], null))).toBe(base);
  });
});

describe("ReAct の根拠の使い分け", () => {
  it.each([null, "ja", "ja-JP"])("%s: メタ情報ツールと取得上限を説明する", (locale) => {
    const prompt = buildAgentSystemPrompt(locale, null, 3, 5);
    expect(prompt).toContain("get_course_info");
    expect(prompt).toContain("search_scenes.video_ids");
    expect(prompt).toContain("videos_meta.next_offset");
    expect(prompt).not.toContain("{max_course_info_calls}");
    expect(prompt).not.toContain("Always search at least once");
    expect(prompt).not.toContain("最低1回は検索");
    expect(prompt).toContain(locale ? "メタ情報だけの回答にシーン引用は不要" : "Metadata-only answers need no scene citations");
  });
});
