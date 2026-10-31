import { afterEach, describe, expect, it, vi } from "vitest";
import { federatedOpenRouterToken } from "../src/lib/openrouter-federation";
import { generateReply } from "../src/lib/llm";
import { embedQuery } from "../src/lib/embeddings";
import type { Bindings } from "../src/types/bindings";
import { embedding } from "./helpers/embedding";

const env = () => ({ OPENROUTER_FEDERATION_POLICY_ID: "policy-test", AWS_REGION: "ap-northeast-1",
  AWS_ACCESS_KEY_ID: "workload-access", AWS_SECRET_ACCESS_KEY: "workload-secret" });
const jwt = (seconds = 900) => `header.${btoa(JSON.stringify({ exp: Date.now() / 1000 + seconds })).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_")}.signature`;
const token = () => Response.json({ access_token: "short-lived-token", token_type: "Bearer", scope: "inference", expires_in: 900 });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("OpenRouter AWS workload federation", () => {
  it("signs regional STS requests, exchanges RS256 JWTs and coalesces parallel refreshes", async () => {
    const settings = env();
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(input, init);
      calls.push(request.url);
      if (request.url.startsWith("https://sts.")) {
        expect(request.url).toBe("https://sts.ap-northeast-1.amazonaws.com/");
        expect(request.headers.get("authorization")).toMatch(/^AWS4-HMAC-SHA256 /);
        const form = new URLSearchParams(await request.text());
        expect(form.get("SigningAlgorithm")).toBe("RS256");
        expect(form.get("Audience.member.1")).toBe("https://openrouter.ai");
        return new Response(`<GetWebIdentityTokenResponse><WebIdentityToken>${jwt()}</WebIdentityToken></GetWebIdentityTokenResponse>`);
      }
      const form = new URLSearchParams(await request.text());
      expect(request.url).toBe("https://openrouter.ai/api/v1/oauth/token");
      expect(form.get("federation_policy_id")).toBe("policy-test");
      expect(form.get("scope")).toBe("inference");
      expect(form.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:token-exchange");
      return token();
    });
    expect(await Promise.all([federatedOpenRouterToken(settings), federatedOpenRouterToken(settings)])).toEqual(["short-lived-token", "short-lived-token"]);
    expect(await federatedOpenRouterToken(settings)).toBe("short-lived-token");
    expect(calls).toHaveLength(2);
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 850_000);
    expect(await federatedOpenRouterToken(settings)).toBe("short-lived-token");
    expect(calls).toHaveLength(4);
  });
  it("uses the exchanged token for real chat/embedding adapters even if old keys remain", async () => {
    const settings = { ...env(), OPENROUTER_API_KEY: "stale", LLM_API_KEY: "stale", EMBEDDING_API_KEY: "stale" } as Bindings;
    let exchanges = 0;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(input, init);
      if (request.url.startsWith("https://sts.")) return new Response(`<WebIdentityToken>${jwt()}</WebIdentityToken>`);
      if (request.url.endsWith("/oauth/token")) { exchanges++; return token(); }
      expect(request.headers.get("authorization")).toBe("Bearer short-lived-token");
      if (request.url.endsWith("/embeddings")) return Response.json({ data: [{ index: 0, embedding: embedding(1) }] });
      return Response.json({ choices: [{ finish_reason: "stop", message: { role: "assistant", content: '{"segments":[{"text":"Ready","sourceIds":[]}]}' } }] });
    });
    expect((await generateReply(settings, "S", "Q")).segments[0].text).toBe("Ready");
    expect(await embedQuery(settings, "Q")).toHaveLength(1536);
    expect(exchanges).toBe(1);
  });
  it("redacts exchange failures and retries a later request without falling back to a fixed key", async () => {
    const settings = { ...env(), OPENROUTER_API_KEY: "stale" } as Bindings;
    const fetch = vi.fn(async () => new Response("SECRET JWT RESPONSE", { status: 403 }));
    vi.stubGlobal("fetch", fetch);
    await expect(embedQuery(settings, "Q")).rejects.toThrow("workload identity exchange failed");
    await expect(embedQuery(settings, "Q")).rejects.not.toThrow("SECRET");
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it.each(["management", "missing"])("rejects %s-scoped token responses", async scope => {
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => String(input instanceof Request ? input.url : input).startsWith("https://sts.")
      ? new Response(`<WebIdentityToken>${jwt()}</WebIdentityToken>`)
      : Response.json({ access_token: "token", token_type: "Bearer", scope, expires_in: 900 }));
    await expect(federatedOpenRouterToken(env())).rejects.toThrow("exchange failed");
  });
});
