import { describe, it, expect } from "vitest";
import type { Context } from "hono";
import { clientIp } from "../src/lib/rate-limit";
import type { AppEnv } from "../src/types/bindings";

function ctx(env: "production" | "development", headers: Record<string, string>): Context<AppEnv> {
  return {
    env: { ENVIRONMENT: env },
    req: { header: (name: string) => headers[name] },
  } as unknown as Context<AppEnv>;
}

describe("clientIp", () => {
  it("uses CF-Connecting-IP (edge-set, unspoofable) in production", () => {
    expect(
      clientIp(ctx("production", {
        "CF-Connecting-IP": "203.0.113.5",
        "True-Client-IP": "6.6.6.6",
        "X-Forwarded-For": "6.6.6.6",
      })),
    ).toBe("203.0.113.5");
  });

  it("ignores client-spoofable headers in production when CF-Connecting-IP is absent", () => {
    // Real production always has CF-Connecting-IP; a request here without it did
    // not pass the Cloudflare edge, so XFF / True-Client-IP must not be trusted.
    expect(
      clientIp(ctx("production", {
        "True-Client-IP": "6.6.6.6",
        "X-Forwarded-For": "6.6.6.6",
      })),
    ).toBe("unknown");
  });

  it("falls back to X-Forwarded-For only outside production (local/dev)", () => {
    expect(
      clientIp(ctx("development", { "X-Forwarded-For": "198.51.100.9, 10.0.0.1" })),
    ).toBe("198.51.100.9");
  });
});
