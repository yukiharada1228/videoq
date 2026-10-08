import { expect, it } from "vitest";
import { visualEvidenceIntent } from "../src/lib/evidence-intent";

it.each([
  ["4文字の英数字コードを、表示される時刻と一緒に教えてください。", false],
  ["動画の5〜9秒に見える図形は何色で、上段と下段に何個ありますか。", true],
  ["15秒以上20秒未満で図形が切り替わる順序は？", true],
  ["Which alphanumeric code is displayed?", false],
  ["How many circles are visible from 5 to 9 seconds?", true],
])("requires images for %s", (question, shortInterval) => {
  expect(visualEvidenceIntent(question)).toMatchObject({ required: true, shortInterval });
});

it("distinguishes inclusive wording from an explicitly excluded endpoint", () => {
  expect(visualEvidenceIntent("10〜14秒の図形の動き").inclusiveEnd).toBe(14);
  expect(visualEvidenceIntent("15秒以上20秒未満の図形").inclusiveEnd).toBeUndefined();
});

it.each(["Pythonのコードの意味を説明して", "講座の動画は全部で何本ですか", "Explain gradient descent"])(
  "leaves nonvisual planning available for %s", question => {
    expect(visualEvidenceIntent(question).required).toBe(false);
  },
);
