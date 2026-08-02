import { describe, it, expect, beforeEach } from "vitest";
import { authRoutes } from "../src/routes/auth";
import { resetMemoryRateLimits, THROTTLE_RATES } from "../src/lib/rate-limit";

// login の早期リターン（DB 到達前）を検証。env は cookie 分岐用に最小限。
const ENV = { ENVIRONMENT: "development" } as unknown as Record<string, unknown>;

beforeEach(() => resetMemoryRateLimits());

function post(body: string, contentType?: string) {
  const headers: Record<string, string> = {};
  if (contentType) headers["content-type"] = contentType;
  return authRoutes.request(
    "/sessions",
    { method: "POST", headers, body },
    ENV,
  );
}

describe("POST /sessions login guards", () => {
  it("text/plain → 415 Unsupported media type（login-CSRF 対策）", async () => {
    const res = await post(JSON.stringify({ username: "a", password: "b" }), "text/plain");
    expect(res.status).toBe(415);
    const j = await res.json();
    expect(j.detail).toContain("Unsupported media type");
  });

  it("Content-Type 無し → 415", async () => {
    const res = await post(JSON.stringify({ username: "a", password: "b" }));
    expect(res.status).toBe(415);
  });

  it("application/json;charset=utf-8 → 許容（essence 判定）", async () => {
    const res = await post(JSON.stringify({}), "application/json; charset=utf-8");
    expect(res.status).toBe(400); // 415 でなく検証まで到達
  });

  it("text/plain;x=application/json の偽装 → 415", async () => {
    const res = await post(JSON.stringify({ username: "a", password: "b" }), "text/plain;x=application/json");
    expect(res.status).toBe(415);
  });

  it("application/json + password 欠落 → 400 field error", async () => {
    const res = await post(JSON.stringify({ username: "a" }), "application/json");
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.error.code).toBe("VALIDATION_ERROR");
    expect(j.error.fields.password).toEqual(["This field is required."]);
  });

  it("application/json + 両方欠落 → 400（先頭は username）", async () => {
    const res = await post("{}", "application/json");
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.error.message).toBe("This field is required.");
    expect(j.error.fields.username).toEqual(["This field is required."]);
  });

  it("application/json + 配列 body → 400（マッピングでない）", async () => {
    const res = await post("[1,2]", "application/json");
    expect(res.status).toBe(400);
  });
});

describe("DELETE /sessions logout", () => {
  it("常に 204（cookie 削除のみ）", async () => {
    const res = await authRoutes.request("/sessions", { method: "DELETE" }, ENV);
    expect(res.status).toBe(204);
    // access_token / refresh_token を Max-Age=0 で削除
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("access_token=");
    expect(setCookie).toContain("refresh_token=");
  });
});

describe("POST /sessions login throttle", () => {
  it("login_ip 超過で 429 LIMIT_EXCEEDED", async () => {
    const { limit } = THROTTLE_RATES.login_ip;
    for (let i = 0; i < limit; i++) {
      const res = await post(
        JSON.stringify({ username: "a", password: "b" }),
        "application/json",
      );
      // DB 未モックでも throttle 通過後に認証へ進む（500/400 いずれか）
      expect(res.status).not.toBe(429);
    }
    const blocked = await post(
      JSON.stringify({ username: "a", password: "b" }),
      "application/json",
    );
    expect(blocked.status).toBe(429);
    const j = await blocked.json();
    expect(j.error.code).toBe("LIMIT_EXCEEDED");
    expect(j.error.message).toMatch(/Request was throttled/);
    expect(blocked.headers.get("Retry-After")).toBeTruthy();
  });
});
