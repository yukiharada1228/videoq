import { describe, it, expect, beforeEach } from "vitest";
import {
  enforceThrottles,
  resetMemoryRateLimits,
  THROTTLE_RATES,
  normalizeThrottleIdent,
} from "../src/lib/rate-limit";
import type { Bindings } from "../src/types/bindings";

const ENV = {
  ENVIRONMENT: "development",
  JWT_SECRET: "x",
  LEGACY_API_ORIGIN: "https://legacy.test",
  HYPERDRIVE: { connectionString: "postgres://fake/db" },
} as unknown as Bindings;

beforeEach(() => resetMemoryRateLimits());

describe("normalizeThrottleIdent", () => {
  it("strips and lowercases when requested", () => {
    expect(normalizeThrottleIdent("  Foo@Bar.COM ", true)).toBe("foo@bar.com");
    expect(normalizeThrottleIdent("  Foo ", false)).toBe("Foo");
  });
});

describe("enforceThrottles (memory backend)", () => {
  it("allows under the limit and blocks at the limit", async () => {
    const { limit } = THROTTLE_RATES.login_ip;
    for (let i = 0; i < limit; i++) {
      const r = await enforceThrottles(ENV, [
        { scope: "login_ip", ident: "1.2.3.4" },
      ]);
      expect(r).toBeNull();
    }
    const denied = await enforceThrottles(ENV, [
      { scope: "login_ip", ident: "1.2.3.4" },
    ]);
    expect(denied).not.toBeNull();
    expect(denied!.allowed).toBe(false);
    expect(denied!.retryAfterSec).toBeGreaterThanOrEqual(1);
  });

  it("isolates counters by scope and ident", async () => {
    const { limit } = THROTTLE_RATES.login_ip;
    for (let i = 0; i < limit; i++) {
      await enforceThrottles(ENV, [{ scope: "login_ip", ident: "a" }]);
    }
    // 別 IP はまだ通る
    expect(
      await enforceThrottles(ENV, [{ scope: "login_ip", ident: "b" }]),
    ).toBeNull();
    // 別スコープも通る
    expect(
      await enforceThrottles(ENV, [{ scope: "signup_ip", ident: "a" }]),
    ).toBeNull();
  });

  it("skips checks with empty ident", async () => {
    for (let i = 0; i < 10; i++) {
      expect(
        await enforceThrottles(ENV, [
          { scope: "chat_share_token_ip", ident: null },
          { scope: "chat_authenticated", ident: "" },
        ]),
      ).toBeNull();
    }
  });
});
