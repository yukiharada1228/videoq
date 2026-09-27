import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { onError } from "../src/middleware/error-handler";
import type { AppEnv } from "../src/types/bindings";

describe("HTTP error logging", () => {
  it("retains diagnostics without copying SQL parameters or request secrets to logs", async () => {
    const secret = "private-user@example.test";
    const cause = Object.assign(new Error(`Key (email)=(${secret}) already exists`), {
      code: "23505", constraint: "users_email_key",
    });
    const error = new Error(`Failed query with parameters:\n    at ${secret}`, { cause });
    const app = new Hono<AppEnv>();
    app.onError(onError);
    app.get("/failure", () => { throw error; });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const response = await app.request(`/failure?token=${secret}`);
      expect(response.status).toBe(500);
      expect(await response.text()).not.toContain(secret);
      expect(log).toHaveBeenCalledTimes(1);
      const entry = JSON.parse(log.mock.calls[0][0]);
      expect(entry.error).toMatchObject({ pgCode: "23505", constraint: "users_email_key" });
      expect(entry.stack).toContain("at ");
      expect(JSON.stringify(entry)).not.toContain(secret);
      expect(entry.path).toBe("/failure");
    } finally { log.mockRestore(); }
  });
});
