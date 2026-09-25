import { describe, it, expect } from "vitest";
import { validateTranscriptSrt, INVALID_SRT_MESSAGE } from "../src/lib/srt";

// 字幕検証の公開契約を固定。
const GOOD = "1\n00:00:01,000 --> 00:00:04,000\nHello world";
const TWO = GOOD + "\n\n2\n00:00:05,000 --> 00:00:08,000\nSecond block";

describe("validateTranscriptSrt", () => {
  it("empty / whitespace → valid (skip)", () => {
    expect(validateTranscriptSrt("")).toBe(null);
    expect(validateTranscriptSrt("   ")).toBe(null);
  });
  it("valid single / multi block", () => {
    expect(validateTranscriptSrt(GOOD)).toBe(null);
    expect(validateTranscriptSrt(TWO)).toBe(null);
  });
  it("CRLF newlines still valid (trim strips \\r)", () => {
    expect(validateTranscriptSrt(GOOD.replace(/\n/g, "\r\n"))).toBe(null);
  });
  it.each(["\n", "\r\n", "\r"])("validates every block with %j newlines", (newline) => {
    expect(validateTranscriptSrt(TWO.replace(/\n/g, newline))).toBe(null);
    const invalidSecondBlock = `${GOOD}\n\n2\nnot a timestamp\nInvalid cue`;
    expect(validateTranscriptSrt(invalidSecondBlock.replace(/\n/g, newline))).toBe(INVALID_SRT_MESSAGE);
  });
  it("validates blocks separated by whitespace-only lines", () => {
    const srt = TWO.replace("\n\n", "\n \t\n");
    expect(validateTranscriptSrt(srt)).toBe(null);
    expect(validateTranscriptSrt(srt.replace("00:00:05,000", "invalid"))).toBe(INVALID_SRT_MESSAGE);
  });
  it("too few lines → error", () => {
    expect(validateTranscriptSrt("1\n00:00:01,000 --> 00:00:04,000")).toBe(
      INVALID_SRT_MESSAGE,
    );
  });
  it("non-integer index → error", () => {
    expect(validateTranscriptSrt("x\n00:00:01,000 --> 00:00:04,000\nHi")).toBe(
      INVALID_SRT_MESSAGE,
    );
  });
  it("bad timestamp → error", () => {
    expect(validateTranscriptSrt("1\n00:00:01.000 -> 00:00:04.000\nHi")).toBe(
      INVALID_SRT_MESSAGE,
    );
  });
});
