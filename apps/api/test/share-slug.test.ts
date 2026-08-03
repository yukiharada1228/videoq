import { describe, it, expect } from "vitest";
import {
  normalizeShareSlug,
  INVALID_SLUG_MESSAGE,
  RESERVED_SLUG_MESSAGE,
} from "../src/lib/share-slug";

// 公開slugの正規化契約を固定する。
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
