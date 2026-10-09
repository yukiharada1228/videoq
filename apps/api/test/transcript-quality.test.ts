import { describe, expect, it } from "vitest";
import { transcriptQuality } from "../src/lib/transcript-quality";

const excerpt = (content: string, endTime = "00:00:12,500") => ({ content, startTime: "00:00:00,000", endTime });

describe("advisory transcript quality", () => {
  it("flags repeated counting and broad legacy timing without claiming an ASR error", () => {
    const content = Array.from({ length: 35 }, (_, i) => `${i + 1}機倒したから残り${35 - i}機です。`).join(" ");
    const result = transcriptQuality(excerpt(content, "00:04:56,000"));
    expect(result.flags).toEqual(["coarse_timing", "high_repetition"]);
    expect(result.interval_seconds).toBe(296);
    expect(result.note).toContain("repetition may be legitimate");
    expect(result.note).toContain("do not discard");
  });
  it("keeps ordinary repeated terminology usable and bounds analysis of huge text", () => {
    const result = transcriptQuality(excerpt("NANDはANDの出力を反転する。入力AとBが両方1のときだけ0を出力する。同じ信号をNANDの両端に入力するとNOT回路を作れる。"));
    expect(result.flags).toEqual([]);
    expect(result.interval_seconds).toBe(12.5);
    expect(transcriptQuality(excerpt("repeat this phrase ".repeat(2000))).text_sampled).toBe(true);
  });
  it("allows legitimately repetitive material, with an advisory flag rather than exclusion", () => {
    const content = "Repeat after me: hello, how are you? ".repeat(20);
    expect(transcriptQuality(excerpt(content)).flags).toEqual(["high_repetition"]);
  });
  it("handles search timestamps without milliseconds and unknown times", () => {
    expect(transcriptQuality({ content: "talk", startTime: "00:00:20", endTime: "00:01:30" }).flags).toEqual(["coarse_timing"]);
    expect(transcriptQuality({ content: "talk", startTime: "invalid", endTime: "invalid" }).interval_seconds).toBeNull();
  });
});
