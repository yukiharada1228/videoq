import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { exportJWK, generateKeyPair, SignJWT, type JWTPayload } from "jose";

// Keep Google's actual ID-token verifier and the production auth routes. Supply
// a local signing key through a mocked JWKS response; never contact Google/mail.
const store = vi.hoisted(() => ({ data: {} as Record<string, Record<string, unknown>[]> }));
vi.mock("@better-auth/drizzle-adapter", async () => {
  const { memoryAdapter } = await import("better-auth/adapters/memory");
  return { drizzleAdapter: () => memoryAdapter(store.data) };
});
vi.mock("../src/lib/mail", () => ({ sendMail: vi.fn().mockResolvedValue(undefined) }));

import { createAuth } from "../src/lib/auth";
import { sendMail } from "../src/lib/mail";
import type { Bindings } from "../src/types/bindings";
import type { Db } from "../src/db/pool";

const BASE = "https://google-auth.example";
const CLIENT_ID = "isolated-google-client";
const USER_ID = "google-test-owner";
const ISSUER = "https://accounts.google.com";
const env = {
  ENVIRONMENT: "production", BETTER_AUTH_URL: BASE, FRONTEND_URL: BASE, CORS_ALLOW_ORIGIN: BASE,
  BETTER_AUTH_SECRET: "isolated-google-auth-secret-012345678901234567890123",
  GOOGLE_CLIENT_ID: CLIENT_ID, GOOGLE_CLIENT_SECRET: "isolated-google-client-secret",
} as Bindings;
// Only the username-allocation query uses Drizzle directly. Fixture names are
// distinct from the provider's candidate; all auth persistence uses memoryAdapter.
const db = { select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }) } as unknown as Db;
const makeAuth = () => createAuth(env, db);
type Auth = ReturnType<typeof makeAuth>;
let keys: Awaited<ReturnType<typeof generateKeyPair>>;
let otherKeys: Awaited<ReturnType<typeof generateKeyPair>>;
let jwks: object;

beforeAll(async () => {
  keys = await generateKeyPair("RS256", { extractable: true });
  otherKeys = await generateKeyPair("RS256");
  jwks = { keys: [{ ...await exportJWK(keys.publicKey), kid: "local-google-key", alg: "RS256", use: "sig" }] };
});
beforeEach(() => {
  vi.clearAllMocks();
  store.data = Object.fromEntries([
    "user", "account", "session", "verification", "apikey", "jwks",
    "oauthClient", "oauthResource", "oauthClientResource", "oauthRefreshToken",
    "oauthAccessToken", "oauthConsent", "oauthClientAssertion",
  ].map((model) => [model, []]));
  const now = new Date();
  store.data.user.push({
    id: USER_ID, email: "owner@gmail.com", emailVerified: true, name: "Owner",
    username: "localowner", displayUsername: "localowner", isActive: true, banned: false,
    role: "user", createdAt: now, updatedAt: now,
  });
  vi.stubGlobal("fetch", vi.fn(async (input: string | Request | URL) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url !== "https://www.googleapis.com/oauth2/v3/certs") throw new Error(`Unexpected outbound request: ${url}`);
    return Response.json(jwks);
  }));
});
afterEach(() => vi.unstubAllGlobals());

async function idToken(claims: JWTPayload = {}, wrongSignature = false) {
  return new SignJWT({
    iss: ISSUER, aud: CLIENT_ID, sub: "google-subject", email: store.data.user[0]?.email ?? "new@external.test",
    email_verified: true, name: "Google owner", iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 300, ...claims,
  }).setProtectedHeader({ alg: "RS256", kid: "local-google-key" })
    .sign(wrongSignature ? otherKeys.privateKey : keys.privateKey);
}
function signIn(auth: Auth, token: string) {
  return auth.handler(new Request(`${BASE}/api/auth/sign-in/social`, {
    method: "POST", headers: { origin: BASE, "content-type": "application/json", "cf-connecting-ip": "192.0.2.1" },
    body: JSON.stringify({ provider: "google", idToken: { token } }),
  }));
}

describe("Google account ownership", () => {
  it.each([false, undefined, "false"])("does not link an email whose verification claim is %j", async (email_verified) => {
    const response = await signIn(makeAuth(), await idToken({ email_verified }));
    expect(response.status).toBe(401);
    expect(store.data.account).toHaveLength(0);
    expect(store.data.session).toHaveLength(0);
  });

  it("does not auto-link a third-party email based only on Google's historical verification", async () => {
    store.data.user[0].email = "owner@external.test";
    const response = await signIn(makeAuth(), await idToken());
    expect(response.status).toBe(401);
    expect(store.data.account).toHaveLength(0);
    expect(store.data.session).toHaveLength(0);
  });

  it.each([
    { email: "owner@gmail.com", email_verified: true },
    { email: "owner@workspace.test", email_verified: true, hd: "workspace.test" },
  ])("links an authoritative verified Google email: %j", async (claims) => {
    store.data.user[0].email = claims.email;
    const response = await signIn(makeAuth(), await idToken(claims));
    expect(response.status, await response.clone().text()).toBe(200);
    expect((await response.json()).user.id).toBe(USER_ID);
    expect(store.data.account).toEqual([expect.objectContaining({
      userId: USER_ID, issuer: ISSUER, accountId: "google-subject",
    })]);
  });

  it("requires mailbox verification for a new third-party Google account", async () => {
    store.data.user = [];
    const auth = makeAuth();
    const token = await idToken();
    const response = await signIn(auth, token);
    expect(response.status).toBe(403);
    expect(store.data.session).toHaveLength(0);
    expect(store.data.user[0].emailVerified).toBe(false);
    expect(sendMail).toHaveBeenCalledTimes(1);
    const mail = vi.mocked(sendMail).mock.calls[0];
    expect(mail[1]).toBe("new@external.test");
    const url = mail[3].find((line) => line.startsWith(`${BASE}/api/auth/verify-email?`));
    expect(url).toBeDefined();
    expect((await auth.handler(new Request(url!))).status).toBe(302);
    expect(store.data.user[0].emailVerified).toBe(true);
    expect((await signIn(auth, token)).status).toBe(200);
  });

  it("keeps an existing third-party Google identity bound to its subject", async () => {
    store.data.user[0].email = "owner@external.test";
    store.data.account.push({
      id: "existing-google", userId: USER_ID, providerId: "google", issuer: ISSUER,
      accountId: "google-subject", createdAt: new Date(), updatedAt: new Date(),
    });
    const response = await signIn(makeAuth(), await idToken({ email: "changed@external.test" }));
    expect(response.status, await response.clone().text()).toBe(200);
    expect((await response.json()).user.id).toBe(USER_ID);
    expect(store.data.user[0].email).toBe("owner@external.test");
    expect(store.data.account).toHaveLength(1);
  });

  it("does not auto-link an unverified local account", async () => {
    store.data.user[0].emailVerified = false;
    expect((await signIn(makeAuth(), await idToken())).status).toBe(401);
    expect(store.data.account).toHaveLength(0);
    expect(store.data.session).toHaveLength(0);
  });

  it.each([
    { aud: "another-client" },
    { iss: "https://untrusted.example" },
    { exp: 1 },
  ])("rejects an invalid signed ID token: %j", async (claims) => {
    expect((await signIn(makeAuth(), await idToken(claims))).status).toBe(401);
    expect(store.data.account).toHaveLength(0);
    expect(store.data.session).toHaveLength(0);
  });

  it("rejects a token with an invalid signature", async () => {
    expect((await signIn(makeAuth(), await idToken({}, true))).status).toBe(401);
    expect(store.data.account).toHaveLength(0);
    expect(store.data.session).toHaveLength(0);
  });
});
