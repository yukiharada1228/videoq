import { describe, it, expect } from "vitest";
import { charField } from "../src/utils/drf-fields";
import {
  normalizeTagName,
  isValidTagColor,
} from "../src/repositories/tag-repository";

// 期待値は実 Django(DRF 6.x)の serializer 出力と byte 一致（/tmp/drf_probe.py で確認済み）。
describe("charField — VideoGroupCreate name CharField(max_length=255)", () => {
  const opts = { required: true, maxLength: 255 };
  it("missing → required", () => {
    expect(charField({}, "name", opts)).toEqual({
      kind: "error",
      message: "This field is required.",
    });
  });
  it("null → may not be null", () => {
    expect(charField({ name: null }, "name", opts)).toEqual({
      kind: "error",
      message: "This field may not be null.",
    });
  });
  it("blank → may not be blank", () => {
    expect(charField({ name: "" }, "name", opts)).toEqual({
      kind: "error",
      message: "This field may not be blank.",
    });
  });
  it("whitespace-only (trim) → may not be blank", () => {
    expect(charField({ name: "   " }, "name", opts)).toEqual({
      kind: "error",
      message: "This field may not be blank.",
    });
  });
  it("number → coerced to string (DRF accepts int/float)", () => {
    expect(charField({ name: 123 }, "name", opts)).toEqual({
      kind: "value",
      value: "123",
    });
  });
  it("boolean → not a valid string", () => {
    expect(charField({ name: true }, "name", opts)).toEqual({
      kind: "error",
      message: "Not a valid string.",
    });
  });
  it("too long → max_length message", () => {
    expect(charField({ name: "x".repeat(256) }, "name", opts)).toEqual({
      kind: "error",
      message: "Ensure this field has no more than 255 characters.",
    });
  });
  it("valid → trimmed", () => {
    expect(charField({ name: "  hi  " }, "name", opts)).toEqual({
      kind: "value",
      value: "hi",
    });
  });
});

describe("charField — description CharField(required=False, allow_blank=True)", () => {
  const opts = { required: false, allowBlank: true };
  it("missing → absent", () => {
    expect(charField({}, "description", opts)).toEqual({ kind: "absent" });
  });
  it("null → may not be null (allow_null default False)", () => {
    expect(charField({ description: null }, "description", opts)).toEqual({
      kind: "error",
      message: "This field may not be null.",
    });
  });
  it("blank → allowed (empty value)", () => {
    expect(charField({ description: "" }, "description", opts)).toEqual({
      kind: "value",
      value: "",
    });
  });
  it("valid → trimmed", () => {
    expect(charField({ description: "  d  " }, "description", opts)).toEqual({
      kind: "value",
      value: "d",
    });
  });
});

describe("charField — TagCreate name CharField(max_length=50, trim_whitespace=False)", () => {
  const opts = { required: true, maxLength: 50, trimWhitespace: false };
  it("whitespace-only → NOT blank (no trim), kept verbatim", () => {
    expect(charField({ name: "   " }, "name", opts)).toEqual({
      kind: "value",
      value: "   ",
    });
  });
  it("empty string → blank", () => {
    expect(charField({ name: "" }, "name", opts)).toEqual({
      kind: "error",
      message: "This field may not be blank.",
    });
  });
  it("51 chars → max_length 50", () => {
    expect(charField({ name: "x".repeat(51) }, "name", opts)).toEqual({
      kind: "error",
      message: "Ensure this field has no more than 50 characters.",
    });
  });
  it("value not trimmed", () => {
    expect(charField({ name: "  keep  " }, "name", opts)).toEqual({
      kind: "value",
      value: "  keep  ",
    });
  });
});

describe("TagPolicy domain checks", () => {
  it("normalizeTagName strips; empty → null", () => {
    expect(normalizeTagName("  x  ")).toBe("x");
    expect(normalizeTagName("   ")).toBe(null);
    expect(normalizeTagName("")).toBe(null);
  });
  it("isValidTagColor accepts palette names, rejects hex/unknown", () => {
    expect(isValidTagColor("blue")).toBe(true);
    expect(isValidTagColor("light-blue")).toBe(true);
    expect(isValidTagColor("purple")).toBe(true);
    expect(isValidTagColor("#ff0000")).toBe(false);
    expect(isValidTagColor("BLUE")).toBe(false);
    expect(isValidTagColor("")).toBe(false);
  });
});
