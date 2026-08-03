import { describe, it, expect } from "vitest";
import { validateTranscriptSrt, INVALID_SRT_MESSAGE } from "../src/lib/srt";

// 期待値は実 DRF validate_transcript と一致（/tmp/srt_probe.py 済）。
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
