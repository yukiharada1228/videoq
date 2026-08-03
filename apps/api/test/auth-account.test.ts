import { describe, it, expect } from "vitest";
import { authRoutes } from "../src/features/auth/routes";
import { signAccessToken } from "./helpers/auth";

const SECRET = "test-account-secret";
const ENV = { ENVIRONMENT: "development", AUTH_JWT_SECRET: SECRET } as unknown as Record<
  string,
  unknown
>;

async function accessToken() {
  return signAccessToken(SECRET);
}

describe("DELETE /account guards（DB 到達前）", () => {
  it("認証なし → 401", async () => {
    const res = await authRoutes.request("/api/auth/account", { method: "DELETE" }, ENV);
    expect(res.status).toBe(401);
  });

  it("認証あり + reason=null → 400（reason may not be null）", async () => {
    const res = await authRoutes.request(
      "/api/auth/account",
      {
        method: "DELETE",
        headers: {
          authorization: `Bearer ${await accessToken()}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ reason: null }),
      },
      ENV,
    );
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.error.details.reason).toEqual(["Invalid input: expected string, received null"]);
  });
});
