import { describe, expect, it } from "vitest";
import {
  FREE_TIER_DEFAULTS,
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
});

describe("resolveSignupQuotaDefaults", () => {
  it("uses free-tier defaults when env is empty", () => {
    expect(resolveSignupQuotaDefaults({})).toEqual({
      maxVideoUploadSizeMb: FREE_TIER_DEFAULTS.maxVideoUploadSizeMb,
      storageLimitGb: FREE_TIER_DEFAULTS.storageLimitGb,
      processingLimitMinutes: FREE_TIER_DEFAULTS.processingLimitMinutes,
      aiAnswersLimit: FREE_TIER_DEFAULTS.aiAnswersLimit,
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
      maxVideoUploadSizeMb: FREE_TIER_DEFAULTS.maxVideoUploadSizeMb,
      storageLimitGb: null,
      processingLimitMinutes: null,
      aiAnswersLimit: null,
    });
  });
});
