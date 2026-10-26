import { describe, it, expect } from "vitest";
import { explicitVideoReferences } from "../src/lib/video-references";
describe("explicit lecture and list-position references", () => {
  it.each([
    ["第７回と第99回の内容", ["lecture_number", 7, "lecture_number", 99]],
    ["第二十七回と第百二回の説明", ["lecture_number", 27, "lecture_number", 102]],
    ["二番目の動画と3本目のビデオ", ["position", 2, "position", 3]],
    ["What is explained in lecture seven?", ["lecture_number", 7]],
    ["Compare lesson twenty-one and chapter eighth.", ["lecture_number", 21, "lecture_number", 8]],
    ["Show the second video and 3rd item.", ["position", 2, "position", 3]],
    ["第7回では2本目のケーブルを説明します", ["lecture_number", 7]],
    ["lecture one hundred", []],
    ["この動画と this video について", ["current", null, "current", null]],
  ] as const)("%s", (query, expected) => {
    expect(explicitVideoReferences(query).flatMap((ref) => [ref.kind, ref.number])).toEqual(expected);
  });
});
