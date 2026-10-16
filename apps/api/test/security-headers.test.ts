import { expect, it, vi } from "vitest";
import { createApp } from "../src/app";

// /health needs no DB; isolate these tests from the real pool.
vi.mock("../src/db/pool", () => ({
  withDb: vi.fn(async () => { throw new Error("unexpected DB access"); }),
}));

const prod = { ENVIRONMENT: "production" } as never;

it("301-redirects plaintext HTTP (CF-Visitor http) to HTTPS in production", async () => {
  const res = await createApp().request(
    "https://videoq.jp/health",
    { headers: { "CF-Visitor": JSON.stringify({ scheme: "http" }) } },
    prod,
  );
  expect(res.status).toBe(301);
  expect(res.headers.get("location")).toBe("https://videoq.jp/health");
});

it("sets HSTS and base security headers on HTTPS production responses", async () => {
  const res = await createApp().request(
    "https://videoq.jp/health",
    { headers: { "CF-Visitor": JSON.stringify({ scheme: "https" }) } },
    prod,
  );
  expect(res.status).toBe(200);
  expect(res.headers.get("strict-transport-security")).toBe(
    "max-age=31536000; includeSubDomains",
  );
  expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  expect(res.headers.get("x-frame-options")).toBe("DENY");
});

it("does not redirect when CF-Visitor is absent (HTTPS edge / local)", async () => {
  const res = await createApp().request("https://videoq.jp/health", {}, prod);
  expect(res.status).toBe(200);
});

it("does not send HSTS outside production", async () => {
  const res = await createApp().request(
    "http://localhost/health",
    {},
    { ENVIRONMENT: "development" } as never,
  );
  expect(res.status).toBe(200);
  expect(res.headers.get("strict-transport-security")).toBeNull();
});
