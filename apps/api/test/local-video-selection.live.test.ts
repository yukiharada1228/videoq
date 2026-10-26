import { describe, it, expect } from "vitest";
import { localVideoSelection } from "../src/lib/local-rag-policy";
import type { Bindings } from "../src/types/bindings";
const env = {
  OPENAI_API_KEY: "local",
  OPENAI_BASE_URL: "http://127.0.0.1:18000/v1",
  LLM_MODEL: "videoq-chat",
  LLM_REASONING_EFFORT: "none",
} as Bindings;
const videos = [
  { id: 60, title: "第7回", position: 1, order: 10 },
  { id: 61, title: "第8回", position: 2, order: 20 },
];
const cases: [string, number[], boolean][] = [
  ["第7回の講義で説明された内容は？", [60], true],
  ["2本目の動画の内容を教えて", [61], true],
  ["What is explained in lecture seven?", [60], true],
  ["第99回の講義で説明された内容は？", [], false],
  ["第7回と第99回の講義で説明された内容を比較して", [60], false],
  ["第7回と第8回の内容を比較して", [60, 61], true],
];
describe.skipIf(process.env.LOCAL_DEMO_LIVE !== "1")("local requested-video resolution", () => {
  it.each(cases)(
    "%s",
    async (question, expected, complete) => {
      const result = await localVideoSelection(env, question, videos, 120000, AbortSignal.timeout(120000));
      console.log(JSON.stringify({ question, result }));
      expect(result.videoIds.toSorted()).toEqual(expected);
      expect(result.complete).toBe(complete);
    },
    120000,
  );
});
