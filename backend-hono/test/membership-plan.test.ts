import { describe, it, expect } from "vitest";
import { planAdditions } from "../src/utils/membership-plan";

// Django plan_tag_attachment / plan_bulk_add と同じ挙動を固定。
describe("planAdditions — dedupe + skip existing", () => {
  it("all new → nothing skipped", () => {
    expect(planAdditions([1, 2, 3], new Set())).toEqual({
      idsToAdd: [1, 2, 3],
      skipped: 0,
    });
  });
  it("skips ids already present (attached/member)", () => {
    expect(planAdditions([1, 2, 3], new Set([2]))).toEqual({
      idsToAdd: [1, 3],
      skipped: 1,
    });
  });
  it("dedupes duplicate ids in the request (counted as skipped)", () => {
    expect(planAdditions([5, 5, 6, 5], new Set())).toEqual({
      idsToAdd: [5, 6],
      skipped: 2,
    });
  });
  it("combines existing-skip and in-request dedupe", () => {
    // 7 は既存, 8 は重複 → idsToAdd=[8,9], skipped=2 (7 と 2 個目の 8)
    expect(planAdditions([7, 8, 8, 9], new Set([7]))).toEqual({
      idsToAdd: [8, 9],
      skipped: 2,
    });
  });
  it("everything already present → empty add", () => {
    expect(planAdditions([1, 2], new Set([1, 2]))).toEqual({
      idsToAdd: [],
      skipped: 2,
    });
  });
  it("preserves request order", () => {
    expect(planAdditions([3, 1, 2], new Set()).idsToAdd).toEqual([3, 1, 2]);
  });
});
