import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashPassword } from "better-auth/crypto";
import { verifyJwsAccessToken } from "better-auth/oauth2";
import { createHash } from "node:crypto";
import { decodeJwt } from "jose";

// Exercise the production Better Auth configuration and real HTTP endpoints.
// Only persistence is replaced; no auth, password or token verifier is mocked.
const store = vi.hoisted(() => ({ data: {} as Record<string, Record<string, unknown>[]> }));
vi.mock("@better-auth/drizzle-adapter", async () => {
  const { memoryAdapter } = await import("better-auth/adapters/memory");
  return { drizzleAdapter: () => memoryAdapter(store.data) };
});

import { createAuth } from "../src/lib/auth";
import { OAUTH_GRANT_CLAIM } from "../src/lib/auth-security";
import type { Bindings } from "../src/types/bindings";
import type { Db } from "../src/db/pool";

const BASE = "https://auth-security.example";
const RESOURCE = `${BASE}/api/mcp`;
const USER_ID = "10000000-0000-4000-8000-000000000001";
const PASSWORD = "isolated-test-password-123";
const VERIFIER = "isolated-test-pkce-verifier-with-at-least-43-characters";
const SCOPES = ["offline_access", "videoq.read", "videoq.write"];
const OIDC_SCOPES = ["openid", "profile", "email", ...SCOPES];
type OAuthTestOptions = { includeResource?: boolean; scopes?: string[]; confidential?: boolean };
const env = {
  ENVIRONMENT: "production",
  BETTER_AUTH_SECRET: "isolated-test-secret-012345678901234567890123456789",
  BETTER_AUTH_URL: BASE,
  FRONTEND_URL: BASE,
  CORS_ALLOW_ORIGIN: BASE,
} as Bindings;

beforeEach(async () => {
  store.data = Object.fromEntries([
    "user", "account", "session", "verification", "apikey", "jwks",
    "oauthClient", "oauthResource", "oauthClientResource", "oauthRefreshToken",
    "oauthAccessToken", "oauthConsent", "oauthClientAssertion",
  ].map((model) => [model, []]));
  const now = new Date();
  store.data.user.push({
    id: USER_ID, email: "security@example.test", emailVerified: true,
    name: "Test user", username: "testuser", displayUsername: "testuser",
    role: "admin", isSuperuser: true, isActive: true, banned: false,
    createdAt: now, updatedAt: now,
  });
  store.data.account.push({
    id: "test-account", userId: USER_ID, accountId: USER_ID,
    providerId: "credential", issuer: "local:credential",
    password: await hashPassword(PASSWORD), createdAt: now, updatedAt: now,
  });
});

function makeAuth() { return createAuth(env, {} as Db); }
type Auth = ReturnType<typeof makeAuth>;
async function post(auth: Auth, path: string, body: unknown, cookie = "", origin = BASE) {
  return auth.handler(new Request(`${BASE}/api/auth${path}`, {
    method: "POST", headers: {
      "content-type": "application/json", origin,
      "cf-connecting-ip": "192.0.2.1", ...(cookie ? { cookie } : {}),
    }, body: JSON.stringify(body),
  }));
}
async function login(auth: Auth) {
  const response = await post(auth, "/sign-in/username", { username: "testuser", password: PASSWORD });
  expect(response.status, await response.clone().text()).toBe(200);
  return response.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
}
async function register(auth: Auth, confidential = false) {
  const response = await post(auth, "/oauth2/register", {
    client_name: "Test client", application_type: "native",
    token_endpoint_auth_method: confidential ? "client_secret_post" : "none",
    redirect_uris: ["http://127.0.0.1:54321/callback"],
    grant_types: ["authorization_code", "refresh_token"],
  });
  expect(response.status, await response.clone().text()).toBe(201);
  return await response.json() as { client_id: string; client_secret?: string };
}
function consent(clientId: string, id = crypto.randomUUID()) {
  store.data.oauthConsent.push({
    id, clientId, userId: USER_ID, scopes: [...SCOPES], resources: [RESOURCE],
    createdAt: new Date(), updatedAt: new Date(),
  });
  return id;
}
async function authorize(auth: Auth, cookie: string, clientId: string, options: OAuthTestOptions = {}) {
  const query = new URLSearchParams({
    client_id: clientId, redirect_uri: "http://127.0.0.1:54321/callback",
    response_type: "code", scope: (options.scopes ?? SCOPES).join(" "),
    ...(options.includeResource === false ? {} : { resource: RESOURCE }),
    code_challenge: createHash("sha256").update(VERIFIER).digest("base64url"),
    code_challenge_method: "S256", state: "test-state",
  });
  const response = await auth.handler(new Request(`${BASE}/api/auth/oauth2/authorize?${query}`, {
    headers: { cookie, "cf-connecting-ip": "192.0.2.1" },
  }));
  expect(response.status, await response.clone().text()).toBe(302);
  let redirect = new URL(response.headers.get("location")!, BASE);
  if (redirect.pathname === "/consent") {
    const accepted = await post(auth, "/oauth2/consent", {
      accept: true, oauth_query: redirect.search.slice(1),
    }, cookie);
    expect(accepted.status, await accepted.clone().text()).toBe(200);
    const result = await accepted.json() as { url: string };
    redirect = new URL(result.url);
  }
  const code = redirect.searchParams.get("code");
  expect(code).toBeTruthy();
  return code!;
}
async function tokenRequest(auth: Auth, clientId: string, params: Record<string, string>, includeResource = true) {
  return auth.handler(new Request(`${BASE}/api/auth/oauth2/token`, {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "cf-connecting-ip": "192.0.2.2" },
    body: new URLSearchParams({ client_id: clientId, ...(includeResource ? { resource: RESOURCE } : {}),
      ...(params.grant_type?.trim() === "authorization_code" ? { redirect_uri: "http://127.0.0.1:54321/callback" } : {}), ...params }),
  }));
}
async function tokensFrom(response: Response) {
  expect(response.status, await response.clone().text()).toBe(200);
  return await response.json() as { access_token: string; refresh_token: string; id_token?: string };
}
async function connect(auth: Auth, cookie: string, options: OAuthTestOptions = {}) {
  const client = await register(auth, options.confidential);
  const code = await authorize(auth, cookie, client.client_id, options);
  const grantId = store.data.oauthConsent.find((row) => row.clientId === client.client_id)!.id as string;
  const tokens = await tokensFrom(await tokenRequest(auth, client.client_id, {
    grant_type: "authorization_code", code, code_verifier: VERIFIER,
    ...(client.client_secret ? { client_secret: client.client_secret } : {}),
  }, options.includeResource));
  return { clientId: client.client_id, clientSecret: client.client_secret, grantId, ...tokens };
}

async function userInfo(auth: Auth, token: string, method: "GET" | "POST" = "GET") {
  return auth.handler(new Request(`${BASE}/api/auth/oauth2/userinfo`, method === "GET" ? {
    headers: { authorization: `Bearer ${token}`, "cf-connecting-ip": "192.0.2.3" },
  } : {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "cf-connecting-ip": "192.0.2.3" },
    body: new URLSearchParams({ access_token: token }),
  }));
}

async function introspect(auth: Auth, linked: Awaited<ReturnType<typeof connect>>, token: string, hint: string, secret = linked.clientSecret) {
  return auth.handler(new Request(`${BASE}/api/auth/oauth2/introspect`, {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "cf-connecting-ip": "192.0.2.4" },
    body: new URLSearchParams({ client_id: linked.clientId, client_secret: secret ?? "", token, token_type_hint: hint }),
  }));
}

describe("account suspension across Better Auth endpoints", () => {
  it.each(["/sign-in/username", "/sign-in/email"])("rejects new sessions for inactive users at %s", async (path) => {
    store.data.user[0].isActive = false;
    const response = await post(makeAuth(), path, {
      username: "testuser", email: "security@example.test", password: PASSWORD,
    });
    expect(response.status).toBe(403);
    expect(store.data.session).toHaveLength(0);
  });

  it("blocks self-reactivation and key creation even if a session survived suspension", async () => {
    const auth = makeAuth();
    const cookie = await login(auth);
    store.data.user[0].isActive = false;
    expect((await post(auth, "/admin/update-user", { userId: USER_ID, data: { isActive: true } }, cookie)).status).toBe(403);
    expect((await post(auth, "/api-key/create", { name: "test", metadata: { accessLevel: "all" } }, cookie)).status).toBe(403);
    expect(store.data.user[0].isActive).toBe(false);
    expect(store.data.apikey).toHaveLength(0);
    expect((await post(auth, "/sign-out", {}, cookie)).status).toBe(200);
  });

  it("rejects banned users and still allows an active administrator", async () => {
    const auth = makeAuth();
    const cookie = await login(auth);
    expect((await post(auth, "/admin/update-user", { userId: USER_ID, data: { name: "Updated" } }, cookie)).status).toBe(200);
    store.data.user[0].banned = true;
    expect((await post(auth, "/admin/update-user", { userId: USER_ID, data: { banned: false } }, cookie)).status).toBe(403);
  });

  it("does not authorize an ordinary user or a revoked session", async () => {
    const auth = makeAuth();
    const cookie = await login(auth);
    store.data.user[0].role = "user";
    expect((await post(auth, "/admin/update-user", { userId: USER_ID, data: { role: "admin" } }, cookie)).status).toBe(403);
    store.data.session = [];
    expect((await post(auth, "/api-key/create", { name: "test" }, cookie)).status).toBe(401);
  });
});

describe("OAuth grant revocation", () => {
  it("binds real PKCE code exchange and refresh tokens to the original consent", async () => {
    const auth = makeAuth();
    const linked = await connect(auth, await login(auth));
    const payload = await verifyJwsAccessToken(linked.access_token, {
      jwksFetch: () => auth.api.getJwks(), verifyOptions: { issuer: `${BASE}/api/auth`, audience: RESOURCE },
    });
    expect(payload[OAUTH_GRANT_CLAIM]).toBe(linked.grantId);
    const refreshed = await tokensFrom(await tokenRequest(auth, linked.clientId, {
      grant_type: "refresh_token", refresh_token: linked.refresh_token,
    }));
    expect(decodeJwt(refreshed.access_token)[OAUTH_GRANT_CLAIM]).toBe(linked.grantId);
  });

  it("disconnects only the selected app and rejects refresh and cached rotation replay", async () => {
    const auth = makeAuth();
    const cookie = await login(auth);
    const linked = await connect(auth, cookie);
    const other = await connect(auth, cookie);
    const refreshed = await tokensFrom(await tokenRequest(auth, linked.clientId, {
      grant_type: "refresh_token", refresh_token: linked.refresh_token,
    }));
    const response = await post(auth, "/oauth2/delete-consent", { id: linked.grantId }, cookie);
    expect(response.status, await response.clone().text()).toBe(200);
    expect(store.data.oauthConsent.map((row) => row.id)).toEqual([other.grantId]);
    expect(store.data.oauthRefreshToken.every((row) => row.clientId === other.clientId)).toBe(true);
    for (const refresh_token of [linked.refresh_token, refreshed.refresh_token]) {
      const rejected = await tokenRequest(auth, linked.clientId, { grant_type: "refresh_token", refresh_token });
      expect(rejected.status).toBe(400);
      expect(await rejected.json()).toMatchObject({ error: "invalid_grant" });
    }
    await tokensFrom(await tokenRequest(auth, other.clientId, {
      grant_type: "refresh_token", refresh_token: other.refresh_token,
    }));
  });

  it("rejects old authorization codes after revoke and re-consent", async () => {
    const auth = makeAuth();
    const cookie = await login(auth);
    const linked = await connect(auth, cookie);
    const oldCode = await authorize(auth, cookie, linked.clientId);
    await post(auth, "/oauth2/delete-consent", { id: linked.grantId }, cookie);
    const newGrant = consent(linked.clientId);
    const rejected = await tokenRequest(auth, linked.clientId, { grant_type: "authorization_code", code: oldCode, code_verifier: VERIFIER });
    expect(rejected.status).toBe(400);
    expect(await rejected.json()).toMatchObject({ error: "invalid_grant" });
    const newCode = await authorize(auth, cookie, linked.clientId);
    const tokens = await tokensFrom(await tokenRequest(auth, linked.clientId, { grant_type: "authorization_code", code: newCode, code_verifier: VERIFIER }));
    expect(decodeJwt(tokens.access_token)[OAUTH_GRANT_CLAIM]).toBe(newGrant);
    expect(decodeJwt(linked.access_token)[OAUTH_GRANT_CLAIM]).not.toBe(newGrant);
  });

  it("rejects a surviving refresh token from a revoked generation", async () => {
    const auth = makeAuth();
    const cookie = await login(auth);
    const linked = await connect(auth, cookie);
    const oldRows = structuredClone(store.data.oauthRefreshToken);
    await post(auth, "/oauth2/delete-consent", { id: linked.grantId }, cookie);
    // Simulate an in-flight rotation persisting an old generation after revoke.
    store.data.oauthRefreshToken.push(...oldRows);
    consent(linked.clientId);
    const rejected = await tokenRequest(auth, linked.clientId, { grant_type: "refresh_token", refresh_token: linked.refresh_token });
    expect(rejected.status).toBe(400);
    expect(await rejected.json()).toMatchObject({ error: "invalid_grant" });
  });

  it.each(["inactive", "banned", "legacy"])("rejects refresh for %s credentials", async (reason) => {
    const auth = makeAuth();
    const linked = await connect(auth, await login(auth));
    if (reason === "inactive") store.data.user[0].isActive = false;
    if (reason === "banned") store.data.user[0].banned = true;
    if (reason === "legacy") delete store.data.oauthRefreshToken[0].referenceId;
    const response = await tokenRequest(auth, linked.clientId, { grant_type: "refresh_token", refresh_token: linked.refresh_token });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "invalid_grant" });
  });

  it("checks ownership, authentication and CSRF before deleting anything", async () => {
    const auth = makeAuth();
    const cookie = await login(auth);
    const linked = await connect(auth, cookie);
    expect((await post(auth, "/oauth2/delete-consent", { id: linked.grantId })).status).toBe(401);
    expect((await post(auth, "/oauth2/delete-consent", { id: linked.grantId }, cookie, "https://evil.example")).status).toBe(403);
    store.data.oauthConsent[0].userId = "different-user";
    expect((await post(auth, "/oauth2/delete-consent", { id: linked.grantId }, cookie)).status).toBe(404);
    expect(store.data.oauthRefreshToken).toHaveLength(1);
    expect(store.data.oauthConsent).toHaveLength(1);
  });
});

describe.each([
  { name: "JWT", includeResource: true },
  { name: "opaque", includeResource: false },
])("OAuth policy for $name access tokens", ({ includeResource }) => {
  it("supports OIDC code exchange, refresh and both UserInfo transports", async () => {
    const auth = makeAuth();
    const linked = await connect(auth, await login(auth), { includeResource, scopes: OIDC_SCOPES });
    expect(linked.id_token).toBeTruthy();
    expect(linked.access_token.includes(".")).toBe(includeResource);
    for (const method of ["GET", "POST"] as const) {
      const response = await userInfo(auth, linked.access_token, method);
      expect(response.status, await response.clone().text()).toBe(200);
      expect(await response.json()).toMatchObject({ sub: USER_ID, email: "security@example.test" });
    }
    const refreshed = await tokensFrom(await tokenRequest(auth, linked.clientId, {
      grant_type: "refresh_token", refresh_token: linked.refresh_token,
    }, includeResource));
    expect(refreshed.id_token).toBeTruthy();
    expect((await userInfo(auth, refreshed.access_token)).status).toBe(200);
  });

  it("rejects UserInfo after disconnect and reconnect without affecting a new grant", async () => {
    const auth = makeAuth();
    const cookie = await login(auth);
    const options = { includeResource, scopes: OIDC_SCOPES };
    const linked = await connect(auth, cookie, options);
    expect((await post(auth, "/oauth2/delete-consent", { id: linked.grantId }, cookie)).status).toBe(200);
    for (const method of ["GET", "POST"] as const) {
      const response = await userInfo(auth, linked.access_token, method);
      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({ error: "invalid_token" });
      expect(response.headers.get("www-authenticate")).toContain("invalid_token");
    }
    const code = await authorize(auth, cookie, linked.clientId, options);
    const reconnected = await tokensFrom(await tokenRequest(auth, linked.clientId, {
      grant_type: "authorization_code", code, code_verifier: VERIFIER,
    }, includeResource));
    expect((await userInfo(auth, linked.access_token)).status).toBe(401);
    expect((await userInfo(auth, reconnected.access_token)).status).toBe(200);
  });

  it.each(["inactive", "banned", "scope removed"])("rejects UserInfo for %s authorization", async (reason) => {
    const auth = makeAuth();
    const linked = await connect(auth, await login(auth), { includeResource, scopes: OIDC_SCOPES });
    if (reason === "inactive") store.data.user[0].isActive = false;
    if (reason === "banned") store.data.user[0].banned = true;
    if (reason === "scope removed") store.data.oauthConsent[0].scopes = ["openid"];
    expect((await userInfo(auth, linked.access_token)).status).toBe(401);
  });

  it("reports revoked access and refresh tokens as inactive at introspection", async () => {
    const auth = makeAuth();
    const cookie = await login(auth);
    const linked = await connect(auth, cookie, { includeResource, scopes: OIDC_SCOPES, confidential: true });
    for (const [token, hint] of [[linked.access_token, "access_token"], [linked.refresh_token, "refresh_token"]]) {
      const response = await introspect(auth, linked, token, hint);
      expect(response.status, await response.clone().text()).toBe(200);
      expect(await response.json()).toMatchObject({ active: true, sub: USER_ID });
      const unauthorized = await introspect(auth, linked, token, hint, "incorrect-secret");
      expect(unauthorized.status).toBe(400);
      expect(await unauthorized.json()).toMatchObject({ error: "invalid_client" });
    }
    expect((await post(auth, "/oauth2/delete-consent", { id: linked.grantId }, cookie)).status).toBe(200);
    for (const [token, hint] of [[linked.access_token, "access_token"], [linked.refresh_token, "refresh_token"]]) {
      const response = await introspect(auth, linked, token, hint);
      expect(response.status, await response.clone().text()).toBe(200);
      expect(await response.json()).toEqual({ active: false });
    }
  });

  it("reports suspended user credentials as inactive at introspection", async () => {
    const auth = makeAuth();
    const linked = await connect(auth, await login(auth), { includeResource, confidential: true });
    store.data.user[0].isActive = false;
    for (const [token, hint] of [[linked.access_token, "access_token"], [linked.refresh_token, "refresh_token"]]) {
      const response = await introspect(auth, linked, token, hint);
      expect(response.status, await response.clone().text()).toBe(200);
      expect(await response.json()).toEqual({ active: false });
    }
  });
});

describe.each([
  { name: "OAuth", scopes: SCOPES },
  { name: "OIDC", scopes: OIDC_SCOPES },
])("$name token issuance without resource", ({ scopes }) => {
  it("rejects an old authorization code after disconnect and reconnect before persisting credentials", async () => {
    const auth = makeAuth();
    const cookie = await login(auth);
    const client = await register(auth);
    const options = { includeResource: false, scopes };
    const code = await authorize(auth, cookie, client.client_id, options);
    const grantId = store.data.oauthConsent[0].id;
    expect((await post(auth, "/oauth2/delete-consent", { id: grantId }, cookie)).status).toBe(200);
    const revoked = await tokenRequest(auth, client.client_id, {
      grant_type: "authorization_code", code, code_verifier: VERIFIER,
    }, false);
    expect(revoked.status).toBe(400);
    expect(await revoked.json()).toMatchObject({ error: "invalid_grant" });
    await authorize(auth, cookie, client.client_id, options);
    const response = await tokenRequest(auth, client.client_id, {
      grant_type: " authorization_code ", code, code_verifier: VERIFIER,
    }, false);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "invalid_grant" });
    expect(store.data.oauthRefreshToken).toHaveLength(0);
    expect(store.data.oauthAccessToken).toHaveLength(0);
  });

  it.each(["inactive", "banned", "legacy", "revoked generation"])("rejects refresh for %s credentials before rotation", async (reason) => {
    const auth = makeAuth();
    const cookie = await login(auth);
    const linked = await connect(auth, cookie, { includeResource: false, scopes });
    if (reason === "inactive") {
      store.data.user[0].isActive = false;
      store.data.session = [];
    }
    if (reason === "banned") store.data.user[0].banned = true;
    if (reason === "legacy") delete store.data.oauthRefreshToken[0].referenceId;
    if (reason === "revoked generation") {
      const oldRows = structuredClone(store.data.oauthRefreshToken);
      expect((await post(auth, "/oauth2/delete-consent", { id: linked.grantId }, cookie)).status).toBe(200);
      store.data.oauthRefreshToken.push(...oldRows);
      await authorize(auth, cookie, linked.clientId, { includeResource: false, scopes });
    }
    const accessBefore = structuredClone(store.data.oauthAccessToken);
    const refreshBefore = structuredClone(store.data.oauthRefreshToken);
    const response = await tokenRequest(auth, linked.clientId, {
      grant_type: reason === "inactive" ? " refresh_token " : "refresh_token", refresh_token: linked.refresh_token,
    }, false);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "invalid_grant" });
    expect(store.data.oauthAccessToken).toEqual(accessBefore);
    expect(store.data.oauthRefreshToken).toEqual(refreshBefore);
  });
});

describe("provider protocol checks remain authoritative", () => {
  it("preserves authorization-code replay detection and revocation of issued credentials", async () => {
    const auth = makeAuth();
    const cookie = await login(auth);
    const client = await register(auth);
    const code = await authorize(auth, cookie, client.client_id, { includeResource: false });
    const params = { grant_type: " authorization_code ", code, code_verifier: VERIFIER };
    const tokens = await tokensFrom(await tokenRequest(auth, client.client_id, params, false));
    expect(store.data.oauthAccessToken).toHaveLength(1);
    expect(store.data.oauthRefreshToken).toHaveLength(1);
    const replay = await tokenRequest(auth, client.client_id, params, false);
    expect(replay.status).toBe(400);
    expect(await replay.json()).toMatchObject({ error: "invalid_grant" });
    expect(store.data.oauthAccessToken).toHaveLength(0);
    expect(store.data.oauthRefreshToken).toHaveLength(0);
    expect((await tokenRequest(auth, client.client_id, {
      grant_type: "refresh_token", refresh_token: tokens.refresh_token,
    }, false)).status).toBe(400);
  });

  it("still verifies PKCE before issuing credentials", async () => {
    const auth = makeAuth();
    const cookie = await login(auth);
    const client = await register(auth);
    const code = await authorize(auth, cookie, client.client_id, { includeResource: false });
    const response = await tokenRequest(auth, client.client_id, {
      grant_type: "authorization_code", code,
      code_verifier: "incorrect-pkce-verifier-with-at-least-43-characters",
    }, false);
    expect(response.status).toBe(401);
    expect(store.data.oauthAccessToken).toHaveLength(0);
    expect(store.data.oauthRefreshToken).toHaveLength(0);
  });
});
