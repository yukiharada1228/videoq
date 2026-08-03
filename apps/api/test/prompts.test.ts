import { describe, it, expect } from "vitest";
import { buildSystemPrompt } from "../src/lib/prompts";

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
    expect(p.length).toBe(3726);
    expect(await sha256(p)).toBe(
      "23fcc79b6e9bd5541adcb29a0e348c5ba97962df1cbcd4b6c5130b737321dc8a",
    );
  });

  it("default ロケール・参照あり", async () => {
    const p = buildSystemPrompt(null, REFS, null);
    expect(p.length).toBe(3841);
    expect(await sha256(p)).toBe(
      "a254b0af46dafdc1abe9799b2c86a6e1dc0f29a46e0c5703469ad678b7afeb33",
    );
  });

  it("ja ロケール・参照 + group_context（前後空白は strip）", async () => {
    const p = buildSystemPrompt("ja", ["[1] 動画A 00:00:10 - 00:00:20\n本文"], "  グループ説明  ");
    expect(p.length).toBe(1594);
    expect(await sha256(p)).toBe(
      "01dc868419734ae0332d54a43e9d4916dc5c763e7f3160f2b873fd17e792c6a1",
    );
  });

  it("ja-JP はハイフン前にフォールバックして ja を採用", async () => {
    const p = buildSystemPrompt("ja-JP", [], null);
    expect(p.length).toBe(1539);
    expect(await sha256(p)).toBe(
      "160479b6f7057f49ee41807cf4a7020d99d3a804d5ec693364ffa84f4fc6da09",
    );
  });

  it("未知ロケール・空白のみの参照は default と同一", async () => {
    const base = await sha256(buildSystemPrompt(null, undefined, null));
    expect(await sha256(buildSystemPrompt("fr-FR", undefined, null))).toBe(base);
    expect(await sha256(buildSystemPrompt(null, ["   ", ""], null))).toBe(base);
  });
});
