import { describe, expect, it } from "vitest";
import {
  parseNullableLimit,
  resolveSignupQuotaDefaults,
} from "../src/shared/signup-quota";

describe("parseNullableLimit", () => {
  it("returns fallback when unset or blank", () => {
    expect(parseNullableLimit(undefined, 10)).toBe(10);
    expect(parseNullableLimit("", 10)).toBe(10);
    expect(parseNullableLimit("  ", 10)).toBe(10);
  });

  it("treats null/unlimited as unlimited", () => {
    expect(parseNullableLimit("null", 10)).toBeNull();
    expect(parseNullableLimit("NULL", 10)).toBeNull();
    expect(parseNullableLimit("unlimited", 10)).toBeNull();
  });

  it("parses finite numbers including zero", () => {
    expect(parseNullableLimit("0", 10)).toBe(0);
    expect(parseNullableLimit("50", 10)).toBe(50);
    expect(parseNullableLimit("5.5", 10)).toBe(5.5);
  });

  it("falls back on non-numeric input", () => {
    expect(parseNullableLimit("abc", 10)).toBe(10);
  });

  it("does not allow negative storage quotas", () => {
    expect(parseNullableLimit("-0.5", 1)).toBe(1);
  });
});

describe("resolveSignupQuotaDefaults", () => {
  it.each(['-1', '1.5', '2147483648', 'Infinity', '1e309'])(
    "falls back when integer-column overrides cannot be stored (%s)", raw => {
      expect(resolveSignupQuotaDefaults({
        MAX_VIDEO_UPLOAD_SIZE_MB: raw,
        DEFAULT_AI_ANSWERS_LIMIT: raw,
        DEFAULT_PROCESSING_LIMIT_MINUTES: raw,
      })).toEqual({ maxVideoUploadSizeMb: 200, aiAnswersLimit: 30, processingLimitMinutes: 45, storageLimitGb: 1 });
    },
  );

  it("preserves zero usage quotas and fractional storage overrides", () => {
    expect(resolveSignupQuotaDefaults({
      MAX_VIDEO_UPLOAD_SIZE_MB: '0',
      DEFAULT_AI_ANSWERS_LIMIT: '0',
      DEFAULT_PROCESSING_LIMIT_MINUTES: '0',
      DEFAULT_STORAGE_LIMIT_GB: '0.5',
    })).toEqual({ maxVideoUploadSizeMb: 200, aiAnswersLimit: 0, processingLimitMinutes: 0, storageLimitGb: 0.5 });
  });

  it("uses free-tier defaults when env is empty", () => {
    expect(resolveSignupQuotaDefaults({})).toEqual({
      maxVideoUploadSizeMb: 200,
      storageLimitGb: 1,
      processingLimitMinutes: 45,
      aiAnswersLimit: 30,
    });
  });

  it("applies env overrides", () => {
    expect(
      resolveSignupQuotaDefaults({
        MAX_VIDEO_UPLOAD_SIZE_MB: "250",
        DEFAULT_STORAGE_LIMIT_GB: "5",
        DEFAULT_PROCESSING_LIMIT_MINUTES: "180",
        DEFAULT_AI_ANSWERS_LIMIT: "50",
      }),
    ).toEqual({
      maxVideoUploadSizeMb: 250,
      storageLimitGb: 5,
      processingLimitMinutes: 180,
      aiAnswersLimit: 50,
    });
  });

  it("allows unlimited via null/unlimited tokens", () => {
    expect(
      resolveSignupQuotaDefaults({
        DEFAULT_STORAGE_LIMIT_GB: "unlimited",
        DEFAULT_PROCESSING_LIMIT_MINUTES: "null",
        DEFAULT_AI_ANSWERS_LIMIT: "unlimited",
      }),
    ).toEqual({
      maxVideoUploadSizeMb: 200,
      storageLimitGb: null,
      processingLimitMinutes: null,
      aiAnswersLimit: null,
    });
  });
});
