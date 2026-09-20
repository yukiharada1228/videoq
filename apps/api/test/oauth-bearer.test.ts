import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const authMocks = vi.hoisted(() => ({
  getJwks: vi.fn(),
  isOAuthGrantActive: vi.fn(),
  userRows: [{ banned: false, isActive: true }] as unknown[],
}));

const fakeDb = {
  select: () => ({
    from: () => ({
      where: () => ({ limit: async () => authMocks.userRows }),
    }),
  }),
};

vi.mock("../src/db/pool", () => ({
  withDb: (_env: unknown, fn: (db: unknown) => unknown) => fn(fakeDb),
  withClient: vi.fn(),
}));

vi.mock("../src/lib/auth", () => ({
  createAuth: () => ({ api: { getJwks: authMocks.getJwks } }),
  authBaseURL: () => "https://videoq.jp",
  oauthResourceAudience: () => "https://videoq.jp/api/mcp",
}));

vi.mock("../src/repositories/oauth-grant-repository", () => ({
  isOAuthGrantActive: authMocks.isOAuthGrantActive,
}));

import { deriveDpopAth, deriveDpopJkt } from "better-auth/oauth2";
import { Hono } from "hono";
import {
  exportJWK,
  generateKeyPair,
  SignJWT,
  type CryptoKey,
  type JWK,
} from "jose";
import { oauthBearerMethod, requireAuth } from "../src/middleware/auth";
import type { AppEnv } from "../src/types/bindings";
import { TEST_USER_ID } from "./helpers/auth";

const ISSUER = "https://videoq.jp/api/auth";
const AUDIENCE = "https://videoq.jp/api/mcp";
const KEY_ID = "oauth-access-token-test-key";

let accessTokenPrivateKey: CryptoKey;
let accessTokenPublicJwk: JWK;

beforeAll(async () => {
  // Better Auth's jwt() plugin signs OAuth access tokens with EdDSA by default.
  const keyPair = await generateKeyPair("EdDSA", { extractable: true });
  accessTokenPrivateKey = keyPair.privateKey;
  accessTokenPublicJwk = {
    ...(await exportJWK(keyPair.publicKey)),
    alg: "EdDSA",
    kid: KEY_ID,
    use: "sig",
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  authMocks.userRows = [{ banned: false, isActive: true }];
  authMocks.getJwks.mockResolvedValue({ keys: [accessTokenPublicJwk] });
  authMocks.isOAuthGrantActive.mockResolvedValue(true);
});

afterEach(() => vi.unstubAllGlobals());

function app() {
  const instance = new Hono<AppEnv>();
  instance.get("/who", requireAuth(oauthBearerMethod), (c) =>
    c.json({
      userId: c.var.userId,
      authVia: c.var.authVia,
      accessLevel: c.var.apiKeyAccessLevel,
    }),
  );
  return instance;
}

async function signAccessToken(
  scope: string,
  extraClaims: Record<string, unknown> = {},
) {
  return new SignJWT({ scope, client_id: "test-client", videoq_grant: "test-consent", ...extraClaims })
    .setProtectedHeader({ alg: "EdDSA", kid: KEY_ID })
    .setSubject(TEST_USER_ID)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(accessTokenPrivateKey);
}

async function request(
  accessToken: string,
  headers: Record<string, string> = {},
) {
  // A distinct env also proves the verifier can load key material directly
  // instead of relying on a prior cache entry.
  const env = { ENVIRONMENT: "production" } as AppEnv["Bindings"];
  return app().request(
    "https://videoq.jp/who",
    {
      headers: { Authorization: `Bearer ${accessToken}`, ...headers },
    },
    env,
  );
}

describe("OAuth bearer authentication", () => {
  it("Better Auth の in-process JWKS で検証し、同一 Route を fetch しない", async () => {
    const networkFetch = vi.fn(() => {
      throw new Error("OAuth verification must not perform a same-zone fetch");
    });
    vi.stubGlobal("fetch", networkFetch);

    const response = await request(
      await signAccessToken("videoq.read videoq.write"),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      userId: TEST_USER_ID,
      authVia: "oauth",
      accessLevel: "all",
    });
    expect(authMocks.getJwks).toHaveBeenCalledOnce();
    expect(networkFetch).not.toHaveBeenCalled();
    expect(authMocks.isOAuthGrantActive).toHaveBeenCalledWith(
      fakeDb, TEST_USER_ID, "test-client", "test-consent", new Set(["videoq.read", "videoq.write"]),
    );
  });

  it("rejects an already-issued JWT after its grant is revoked", async () => {
    const token = await signAccessToken("videoq.read videoq.write");
    expect((await request(token)).status).toBe(200);
    authMocks.isOAuthGrantActive.mockResolvedValue(false);
    expect((await request(token)).status).toBe(401);
  });

  it.each([
    { videoq_grant: undefined }, { videoq_grant: "" },
    { client_id: undefined }, { client_id: "" },
  ])("rejects legacy or malformed grant identity %j", async (claims) => {
    expect((await request(await signAccessToken("videoq.read", claims))).status).toBe(401);
    expect(authMocks.isOAuthGrantActive).not.toHaveBeenCalled();
  });

  it("videoq.read が無い token は 403 にする", async () => {
    const response = await request(await signAccessToken("videoq.write"));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: {
        code: "FORBIDDEN",
        message: "OAuth token lacks videoq.read scope",
      },
    });
  });

  it("DPoP-bound token の proof・ath・key binding を維持する", async () => {
    const dpopKeyPair = await generateKeyPair("ES256", { extractable: true });
    const dpopPublicJwk = await exportJWK(dpopKeyPair.publicKey);
    const jkt = await deriveDpopJkt(dpopPublicJwk);
    const accessToken = await signAccessToken("videoq.read", { cnf: { jkt } });
    const now = Math.floor(Date.now() / 1000);
    const proof = await new SignJWT({
      htu: "https://videoq.jp/who",
      htm: "GET",
      jti: crypto.randomUUID(),
      iat: now,
      ath: await deriveDpopAth(accessToken),
    })
      .setProtectedHeader({
        alg: "ES256",
        typ: "dpop+jwt",
        jwk: dpopPublicJwk,
      })
      .sign(dpopKeyPair.privateKey);

    const response = await request(accessToken, {
      Authorization: `DPoP ${accessToken}`,
      DPoP: proof,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      userId: TEST_USER_ID,
      authVia: "oauth",
      accessLevel: "read_only",
    });
  });
});
