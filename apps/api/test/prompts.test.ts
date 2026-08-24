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
    expect(p.length).toBe(3728);
    expect(await sha256(p)).toBe(
      "c474cc83e162ed1d0d0e38ace065c0729d8ba8fca87f41b54f567cec5ce18ec7",
    );
  });

  it("default ロケール・参照あり", async () => {
    const p = buildSystemPrompt(null, REFS, null);
    expect(p.length).toBe(3844);
    expect(await sha256(p)).toBe(
      "519382fe6b8c619bf839b57e91e2419c97e89a115c475fb9a9e415b5f9cfff7e",
    );
  });

  it("ja ロケール・参照 + course_context（前後空白は strip）", async () => {
    const p = buildSystemPrompt("ja", ["[1] 動画A 00:00:10 - 00:00:20\n本文"], "  講座説明  ");
    expect(p.length).toBe(1578);
    expect(await sha256(p)).toBe(
      "9187a411f770f28fd0b49bb7d7dfb450d16c297b722c29e0361a4c1c0cdf8a63",
    );
  });

  it("ja-JP はハイフン前にフォールバックして ja を採用", async () => {
    const p = buildSystemPrompt("ja-JP", [], null);
    expect(p.length).toBe(1531);
    expect(await sha256(p)).toBe(
      "45cc96f5478299faeec5ebf8aa82685e5cd205c2686a1c4e34b48ef550ce7646",
    );
  });

  it("未知ロケール・空白のみの参照は default と同一", async () => {
    const base = await sha256(buildSystemPrompt(null, undefined, null));
    expect(await sha256(buildSystemPrompt("fr-FR", undefined, null))).toBe(base);
    expect(await sha256(buildSystemPrompt(null, ["   ", ""], null))).toBe(base);
  });
});
