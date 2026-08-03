/**
 * OpenID Connect helpers（django-oauth-toolkit OIDC 互換）。
 * OIDC_ENABLED=false（Django 既定）のときはエンドポイントが 404。
 */
import {
  calculateJwkThumbprint,
  compactVerify,
  decodeJwt,
  exportJWK,
  importPKCS8,
  SignJWT,
  type JWTPayload,
} from "jose";
import type { Bindings } from "../types/bindings";
import { issuerFromEnv, OAUTH_SCOPES } from "./oauth";

export const ID_TOKEN_EXPIRE_SECONDS = 36000;
export const OIDC_JWKS_MAX_AGE_SECONDS = 3600;

/** DOT oidc_claim_scope（VideoQ は additional claims 未拡張のため sub のみ実用）。 */
export const OIDC_CLAIM_SCOPE: Record<string, string> = {
  sub: "openid",
  preferred_username: "profile",
  email: "email",
  email_verified: "email",
};

export function isTruthyEnv(v: string | undefined): boolean {
  if (!v) return false;
  const s = v.trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

export function isOidcEnabled(env: Bindings): boolean {
  return isTruthyEnv(env.OIDC_ENABLED);
}

export function isOidcRpLogoutEnabled(env: Bindings): boolean {
  return isOidcEnabled(env) && isTruthyEnv(env.OIDC_RP_INITIATED_LOGOUT_ENABLED);
}

/** PEM を正規化（`.dev.vars` の `\\n` も許可）。 */
export function normalizePem(pem: string | undefined): string | null {
  if (!pem) return null;
  let s = pem.trim();
  if (!s) return null;
  if (s.includes("\\n") && !s.includes("\n")) {
    s = s.replace(/\\n/g, "\n");
  }
  return s;
}

export async function loadOidcRsaPrivateKey(
  env: Bindings,
): Promise<{ key: CryptoKey; kid: string; publicJwk: Record<string, unknown> } | null> {
  const pem = normalizePem(env.OIDC_RSA_PRIVATE_KEY);
  if (!pem) return null;
  // JWKS 公開鍵 export のため extractable 必須
  const key = await importPKCS8(pem, "RS256", { extractable: true });
  const jwk = await exportJWK(key);
  const kid = await calculateJwkThumbprint(jwk);
  const { d: _d, p: _p, q: _q, dp: _dp, dq: _dq, qi: _qi, ...pub } = jwk as Record<
    string,
    unknown
  >;
  return { key, kid, publicJwk: pub };
}

export function buildOpenIdConfiguration(
  env: Bindings,
  reqUrl: string,
): Record<string, unknown> {
  const issuer = issuerFromEnv(env, reqUrl);
  const hasRsa = Boolean(normalizePem(env.OIDC_RSA_PRIVATE_KEY));
  const signingAlgs = hasRsa ? ["RS256", "HS256"] : ["HS256"];
  const data: Record<string, unknown> = {
    issuer,
    authorization_endpoint: `${issuer}/api/oauth/authorize/`,
    token_endpoint: `${issuer}/api/oauth/token/`,
    userinfo_endpoint: `${issuer}/api/oauth/userinfo/`,
    jwks_uri: `${issuer}/.well-known/jwks.json`,
    scopes_supported: Object.keys(OAUTH_SCOPES).sort(),
    // VideoQ AS は code のみ（OIDC 既定の複合 response_type は未実装）
    response_types_supported: ["code"],
    subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: signingAlgs,
    token_endpoint_auth_methods_supported: [
      "client_secret_post",
      "client_secret_basic",
    ],
    code_challenge_methods_supported: ["plain", "S256"],
    claims_supported: ["sub", "preferred_username", "email", "email_verified"],
    prompt_values_supported: ["none", "login"],
    client_id_metadata_document_supported: false,
  };
  if (isOidcRpLogoutEnabled(env)) {
    data.end_session_endpoint = `${issuer}/api/oauth/logout/`;
  }
  return data;
}

export type UserinfoSubject = {
  userId: number;
  username: string | null;
  email: string | null;
  scope: string;
};

/** DOT get_oidc_claims 相当（scope でフィルタ）。 */
export function buildOidcClaims(subject: UserinfoSubject): Record<string, unknown> {
  const scopes = new Set(subject.scope.split(/\s+/).filter(Boolean));
  const raw: Record<string, unknown> = {
    sub: String(subject.userId),
  };
  if (subject.username != null) raw.preferred_username = subject.username;
  if (subject.email != null) {
    raw.email = subject.email;
    raw.email_verified = true;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    const need = OIDC_CLAIM_SCOPE[k];
    if (!need || scopes.has(need)) out[k] = v;
  }
  return out;
}

export async function signIdToken(params: {
  env: Bindings;
  algorithm: "RS256" | "HS256";
  clientId: string;
  clientSecretPlain?: string;
  claims: Record<string, unknown>;
  nonce?: string;
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: JWTPayload = {
    ...params.claims,
    iss: (
      params.env.OAUTH2_PROVIDER_ISSUER_URL || "http://localhost"
    ).replace(/\/$/, ""),
    aud: params.clientId,
    iat: now,
    exp: now + ID_TOKEN_EXPIRE_SECONDS,
    auth_time: now,
  };
  if (params.nonce) payload.nonce = params.nonce;

  if (params.algorithm === "RS256") {
    const rsa = await loadOidcRsaPrivateKey(params.env);
    if (!rsa) throw new Error("OIDC_RSA_PRIVATE_KEY required for RS256");
    return new SignJWT(payload)
      .setProtectedHeader({ alg: "RS256", typ: "JWT", kid: rsa.kid })
      .sign(rsa.key);
  }

  const secret = params.clientSecretPlain;
  if (!secret) throw new Error("plaintext client_secret required for HS256");
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .sign(new TextEncoder().encode(secret));
}

/** RP-Logout 用: id_token_hint の署名+iss を検証（exp は設定次第で無視）。 */
export async function peekIdTokenClaims(
  env: Bindings,
  token: string,
  opts: { acceptExpired: boolean; expectedIss: string; hsSecret?: string },
): Promise<JWTPayload | null> {
  try {
    const headerB64 = token.split(".")[0];
    if (!headerB64) return null;
    const pad = headerB64.length % 4 === 0 ? "" : "=".repeat(4 - (headerB64.length % 4));
    const header = JSON.parse(
      atob(headerB64.replace(/-/g, "+").replace(/_/g, "/") + pad),
    ) as { alg?: string };
    let key: CryptoKey | Uint8Array;
    if (header.alg === "RS256") {
      const rsa = await loadOidcRsaPrivateKey(env);
      if (!rsa) return null;
      key = rsa.key;
    } else if (header.alg === "HS256") {
      if (!opts.hsSecret) return null;
      key = new TextEncoder().encode(opts.hsSecret);
    } else {
      return null;
    }
    await compactVerify(token, key);
    const payload = decodeJwt(token);
    if (payload.iss !== opts.expectedIss) return null;
    if (!opts.acceptExpired) {
      const now = Math.floor(Date.now() / 1000);
      if (typeof payload.exp === "number" && payload.exp < now) return null;
    }
    return payload;
  } catch {
    return null;
  }
}
