import { describe, expect, it } from "vitest";
import { convertHistoricalAnswer } from "../scripts/migrations/structured-answer/convert";
const source = { video_id: 7, title: "Video", start_time: "00:00:10", end_time: null };
describe("one-time history conversion", () => {
  it("converts only valid legacy references, preserving math, code, whitespace and unknown markers", () => {
    expect(convertHistoricalAnswer('説明[1][1]\n`a[1]` \\(x[1]\\) [99]\n次[1]', [source])).toEqual({
      sources: [{ id: 1, ...source }],
      segments: [{ text: '説明', sourceIds: [1] }, { text: '\n`a[1]` \\(x[1]\\) [99]\n次', sourceIds: [1] }],
    });
  });
  it("preserves empty/no-source history", () => {
    expect(convertHistoricalAnswer('', [])).toEqual({ segments: [{ text: '', sourceIds: [] }], sources: [] });
  });
  it("fails malformed historical data instead of silently discarding it", () => {
    expect(() => convertHistoricalAnswer('answer', {})).toThrow();
    expect(() => convertHistoricalAnswer('[1][2]', [{ video_id: -1 }, source])).toThrow();
    expect(() => convertHistoricalAnswer('private prose', 'private metadata')).toThrow('Invalid historical sources JSON');
  });
});
