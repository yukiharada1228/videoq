import { describe, it, expect } from "vitest";
import {
  normalizeShareSlug,
  INVALID_SLUG_MESSAGE,
  RESERVED_SLUG_MESSAGE,
} from "../src/lib/share-slug";
import { validateIntIdList } from "../src/utils/drf-fields";

// 期待値は実 Django ShareSlugPolicy.normalize と byte 一致（/tmp/drf_probe3.py 済）。
describe("normalizeShareSlug", () => {
  it("strips + lowercases valid slug", () => {
    expect(normalizeShareSlug("  MyLink  ")).toEqual({ slug: "mylink" });
    expect(normalizeShareSlug("Good-Slug-1")).toEqual({ slug: "good-slug-1" });
    expect(normalizeShareSlug("foo")).toEqual({ slug: "foo" });
  });
  it("rejects too short / too long", () => {
    expect(normalizeShareSlug("ab")).toEqual({ error: INVALID_SLUG_MESSAGE });
    expect(normalizeShareSlug("x".repeat(65))).toEqual({ error: INVALID_SLUG_MESSAGE });
  });
  it("rejects double hyphen, underscores, leading/trailing hyphen", () => {
    expect(normalizeShareSlug("a--b")).toEqual({ error: INVALID_SLUG_MESSAGE });
    expect(normalizeShareSlug("bad_slug")).toEqual({ error: INVALID_SLUG_MESSAGE });
    expect(normalizeShareSlug("-abc")).toEqual({ error: INVALID_SLUG_MESSAGE });
    expect(normalizeShareSlug("abc-")).toEqual({ error: INVALID_SLUG_MESSAGE });
  });
  it("rejects reserved slugs", () => {
    expect(normalizeShareSlug("share")).toEqual({ error: RESERVED_SLUG_MESSAGE });
    expect(normalizeShareSlug("admin")).toEqual({ error: RESERVED_SLUG_MESSAGE });
  });
});

// DRF ListField(child=IntegerField()) の再現。
describe("validateIntIdList — group_ids", () => {
  it("missing → required field error", () => {
    expect(validateIntIdList({}, "group_ids")).toEqual({
      kind: "field",
      message: "This field is required.",
    });
  });
  it("null → may not be null", () => {
    expect(validateIntIdList({ group_ids: null }, "group_ids")).toEqual({
      kind: "field",
      message: "This field may not be null.",
    });
  });
  it("non-list → expected-a-list with python type name", () => {
    expect(validateIntIdList({ group_ids: "x" }, "group_ids")).toEqual({
      kind: "field",
      message: 'Expected a list of items but got type "str".',
    });
    expect(validateIntIdList({ group_ids: 5 }, "group_ids")).toEqual({
      kind: "field",
      message: 'Expected a list of items but got type "int".',
    });
  });
  it("empty list → ok", () => {
    expect(validateIntIdList({ group_ids: [] }, "group_ids")).toEqual({
      kind: "ok",
      ids: [],
    });
  });
  it("int array → ok (order preserved)", () => {
    expect(validateIntIdList({ group_ids: [3, 1, 2] }, "group_ids")).toEqual({
      kind: "ok",
      ids: [3, 1, 2],
    });
  });
  it("bad child (non-int) → flat (Bad Request, no fields)", () => {
    expect(validateIntIdList({ group_ids: ["a"] }, "group_ids")).toEqual({ kind: "flat" });
    expect(validateIntIdList({ group_ids: [true] }, "group_ids")).toEqual({ kind: "flat" });
    expect(validateIntIdList({ group_ids: [1.5] }, "group_ids")).toEqual({ kind: "flat" });
  });
});
