import { describe, it, expect } from "vitest";
import { isDag, EDGE_TYPES, NODE_TYPES, ORDERING } from "../src/lib/plog-ordering";

describe("isDag（ordering.py 相当）", () => {
  it("空・単一辺は DAG", () => {
    expect(isDag([])).toBe(true);
    expect(isDag([["1", "2"]])).toBe(true);
  });

  it("線形パスは DAG、サイクルは false", () => {
    expect(
      isDag([
        ["1", "2"],
        ["2", "3"],
      ]),
    ).toBe(true);
    expect(
      isDag([
        ["1", "2"],
        ["2", "3"],
        ["3", "1"],
      ]),
    ).toBe(false);
  });

  it("自己ループはサイクル", () => {
    expect(isDag([["1", "1"]])).toBe(false);
  });

  it("重複辺は無視して判定する", () => {
    expect(
      isDag([
        ["1", "2"],
        ["1", "2"],
      ]),
    ).toBe(true);
  });
});

describe("定数集合", () => {
  it("Django ordering.py と同じメンバー", () => {
    expect([...ORDERING].sort()).toEqual(["builds_on", "prerequisite_of"]);
    expect([...NODE_TYPES].sort()).toEqual(["limitation", "object", "property"]);
    expect([...EDGE_TYPES].sort()).toEqual([
      "analogy_for",
      "builds_on",
      "contrasts_with",
      "example_of",
      "prerequisite_of",
    ]);
  });
});
