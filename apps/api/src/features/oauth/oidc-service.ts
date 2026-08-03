import {
  buildOidcClaims,
  isTruthyEnv,
  peekIdTokenClaims,
} from "../../lib/oidc";
import { issuerFromEnv } from "../../lib/oauth";
import {
  findAccessTokenForUserinfo,
  findApplicationByClientId,
  findIdTokenByJti,
  postLogoutRedirectUriAllowed,
  revokeTokensForOidcLogout,
} from "../../repositories/oauth-repository";
import type { Bindings } from "../../types/bindings";

export type UserinfoSuccess = {
  ok: true;
  claims: Record<string, unknown>;
};

export type UserinfoError = {
  ok: false;
  status: 401;
  error: "invalid_token";
  error_description: string;
  wwwAuthenticate: string;
};

export type UserinfoResult = UserinfoSuccess | UserinfoError;

export async function resolveUserinfo(
  env: Bindings,
  bearer: string,
): Promise<UserinfoResult> {
  if (!bearer) {
    return {
      ok: false,
      status: 401,
      error: "invalid_token",
      error_description: "The access token is missing",
      wwwAuthenticate: "Bearer",
    };
  }
  const row = await findAccessTokenForUserinfo(env, bearer);
  if (!row) {
    return {
      ok: false,
      status: 401,
      error: "invalid_token",
      error_description: "The access token is invalid",
      wwwAuthenticate: 'Bearer error="invalid_token"',
    };
  }
  const claims = buildOidcClaims({
    userId: row.userId,
    username: row.username,
    email: row.email,
    scope: row.scope,
  });
  return { ok: true, claims };
}

function decodeJwtPayloadUnsafe(token: string): Record<string, unknown> | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const pad = part.length % 4 === 0 ? "" : "=".repeat(4 - (part.length % 4));
    return JSON.parse(
      atob(part.replace(/-/g, "+").replace(/_/g, "/") + pad),
    ) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export type LogoutValidationSuccess = { ok: true; tokenUserId: number | null };
export type LogoutValidationError = { ok: false; status: number; error: string };
export type LogoutValidationResult =
  | LogoutValidationSuccess
  | LogoutValidationError;

export async function validateLogoutRequest(
  env: Bindings,
  requestUrl: string,
  idTokenHint: string | undefined,
  clientId: string | undefined,
  postLogoutRedirectUri: string | undefined,
): Promise<LogoutValidationResult> {
  let tokenUserId: number | null = null;
  let app = clientId ? await findApplicationByClientId(env, clientId) : null;
  if (clientId && !app) {
    return { ok: false, status: 400, error: "invalid_client" };
  }

  if (idTokenHint) {
    const issuer = issuerFromEnv(env, requestUrl);
    const acceptExpired =
      env.OIDC_LOGOUT_ACCEPT_EXPIRED_TOKENS === undefined ||
      isTruthyEnv(env.OIDC_LOGOUT_ACCEPT_EXPIRED_TOKENS);

    let claims = await peekIdTokenClaims(env, idTokenHint, {
      acceptExpired,
      expectedIss: issuer,
    });
    if (!claims) {
      const unsafe = decodeJwtPayloadUnsafe(idTokenHint);
      const aud = typeof unsafe?.aud === "string" ? unsafe.aud : "";
      const audApp = aud ? await findApplicationByClientId(env, aud) : null;
      const hsSecret =
        audApp && !audApp.hash_client_secret ? audApp.client_secret : undefined;
      claims = await peekIdTokenClaims(env, idTokenHint, {
        acceptExpired,
        expectedIss: issuer,
        hsSecret,
      });
      if (!app && audApp) app = audApp;
    }

    if (!claims || typeof claims.jti !== "string") {
      return { ok: false, status: 400, error: "invalid_id_token" };
    }
    const stored = await findIdTokenByJti(env, claims.jti);
    if (!stored) {
      return { ok: false, status: 400, error: "invalid_id_token" };
    }
    tokenUserId = stored.userId;
    if (!app && typeof claims.aud === "string") {
      app = await findApplicationByClientId(env, claims.aud);
    }
    if (clientId && app && app.client_id !== clientId) {
      return { ok: false, status: 400, error: "client_id_mismatch" };
    }
  }

  if (postLogoutRedirectUri) {
    if (!app) {
      return { ok: false, status: 400, error: "invalid_client" };
    }
    try {
      const scheme = new URL(postLogoutRedirectUri).protocol.replace(":", "");
      if (!scheme) {
        return { ok: false, status: 400, error: "invalid_redirect_uri" };
      }
    } catch {
      return { ok: false, status: 400, error: "invalid_redirect_uri" };
    }
    if (!postLogoutRedirectUriAllowed(app, postLogoutRedirectUri)) {
      return { ok: false, status: 400, error: "invalid_redirect_uri" };
    }
  }

  return { ok: true, tokenUserId };
}

export function mustPromptLogout(
  env: Bindings,
  sessionUserId: number | null,
  tokenUserId: number | null,
): boolean {
  if (sessionUserId == null) return false;
  const always =
    env.OIDC_LOGOUT_ALWAYS_PROMPT === undefined ||
    isTruthyEnv(env.OIDC_LOGOUT_ALWAYS_PROMPT);
  if (always) return true;
  if (tokenUserId == null) return true;
  if (tokenUserId !== sessionUserId) return true;
  return false;
}

export function shouldRevokeTokensOnOidcLogout(env: Bindings): boolean {
  return (
    env.OIDC_LOGOUT_DELETE_TOKENS === undefined ||
    isTruthyEnv(env.OIDC_LOGOUT_DELETE_TOKENS)
  );
}

export async function revokeTokensForOidcLogoutIfConfigured(
  env: Bindings,
  userId: number | null,
): Promise<void> {
  if (shouldRevokeTokensOnOidcLogout(env) && userId != null) {
    await revokeTokensForOidcLogout(env, userId);
  }
}
