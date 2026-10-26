import { describe, it, expect } from "vitest";
import { localQuestionIntent } from "../src/lib/local-rag-policy";
import type { Bindings } from "../src/types/bindings";
const env = {
  OPENAI_API_KEY: "local",
  OPENAI_BASE_URL: "http://127.0.0.1:18000/v1",
  LLM_MODEL: "videoq-chat",
  LLM_REASONING_EFFORT: "none",
} as Bindings;
const cases: [string, "metadata" | "content"][] = [
  ["この講座には動画が何本ありますか？", "metadata"],
  ["第2回の動画タイトルを教えて", "metadata"],
  ["登録されている講座の説明文をそのまま見せて", "metadata"],
  ["動画の処理状況を一覧で見せて", "metadata"],
  ["List the video titles and the total number of videos.", "metadata"],
  ["この講座の名前は？", "metadata"],
  ["アップロード済みファイルのステータス一覧を見せて", "metadata"],
  ["動画の現在の処理状態は？", "metadata"],
  ["動画処理の手順を説明して", "content"],
  ["処理状況と動画で説明している保管ルールを教えて", "content"],
  ["第99回で説明された保存期間は？", "content"],
  ["この動画で案内された緊急連絡先の電話番号は何番ですか？", "content"],
  ["第2回では、領収書の原本を何年間保管すると説明していますか？", "content"],
  ["七回目の講義で説明された計算方法を教えて", "content"],
  ["講座内の全動画の画面には、それぞれ何個の部品が映っていますか？", "content"],
  ["2本目の内容を要約して", "content"],
  ["講座内の全動画のタイトルと、各動画で説明された手順を教えて", "content"],
  ["How long are access logs retained in lesson four?", "content"],
  ["旅費の申請は、出張の何日前までに、どこへ提出しますか？", "content"],
  ["領収書はどこに登録し、原本をどのくらい保管しますか？", "content"],
  ["機密情報を含む動画はどこで処理し、社外へ送信しますか？", "content"],
];
describe.skipIf(process.env.LOCAL_DEMO_LIVE !== "1")("local required-source routing", () => {
  it.each(cases)(
    "%s",
    async (question, expected) => {
      const actual = await localQuestionIntent(env, question, 120000, AbortSignal.timeout(120000));
      console.log(JSON.stringify({ question, actual, expected }));
      expect(actual.intent).toBe(expected);
      expect(actual.scope).toBe(
        /第2回|第99回|七回目|2本目|lesson four|この動画/.test(question) ? "specific_videos" : "course",
      );
    },
    120000,
  );
});
