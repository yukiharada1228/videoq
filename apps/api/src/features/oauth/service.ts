import {
  ACCESS_TOKEN_EXPIRE_SECONDS,
  DEVICE_GRANT_TYPE,
  REFRESH_TOKEN_EXPIRE_SECONDS,
  issuerFromEnv,
  isValidRedirectUri,
  verifyPkce,
} from "../../lib/oauth";
import {
  buildOidcClaims,
  ID_TOKEN_EXPIRE_SECONDS,
  isOidcEnabled,
  signIdToken,
} from "../../lib/oidc";
import {
  createDcrApplication,
  exchangeAuthorizationCode,
  findActiveRefreshToken,
  findDeviceGrantByDeviceCode,
  findValidGrant,
  issueTokensForDeviceGrant,
  resolveRegistrationAccessToken,
  saveIdTokenForAccessToken,
  updateDcrApplication,
  deleteOAuthApplicationCascade,
  revokeOAuthToken,
  rotateRefreshToken,
  listAuthorizedTokens,
  revokeAuthorizedToken,
  type OAuthApplication,
} from "../../repositories/oauth-repository";
import {
  buildAuthorizationServerMetadata,
  buildProtectedResourceMetadata,
} from "../../lib/oauth";
import {
  buildOpenIdConfiguration,
  loadOidcRsaPrivateKey,
  OIDC_JWKS_MAX_AGE_SECONDS,
} from "../../lib/oidc";
import { withDb } from "../../db/pool";
import { users } from "../../db/schema";
import { eq } from "drizzle-orm";
import type { Bindings } from "../../types/bindings";

// ─── shared result types ──────────────────────────────────────

export type OAuthServiceError = {
  ok: false;
  status: 400 | 401 | 404 | 500;
  error: string;
  description?: string;
};

export type OAuthTokenSuccess = {
  ok: true;
  body: Record<string, unknown>;
};

export type OAuthTokenResult = OAuthTokenSuccess | OAuthServiceError;

export type DcrServiceError = {
  ok: false;
  status: 400 | 401;
  error: string;
  description: string;
};

export type DcrMetadata = {
  name: string;
  redirectUris: string[];
  clientType: "public" | "confidential";
  authorizationGrantType: string;
};

export type DcrClientSuccess = {
  ok: true;
  status: 200 | 201;
  body: Record<string, unknown>;
};

export type DcrDeleteSuccess = {
  ok: true;
  noContent: true;
};

export type DcrResult = DcrClientSuccess | DcrDeleteSuccess | DcrServiceError;

export type RevokeTokenResult =
  | { ok: true; noContent: true }
  | {
      ok: false;
      status: 401;
      error: "invalid_client";
      description: string;
    };

// ─── metadata / settings UI ───────────────────────────────────

export function getAuthorizationServerMetadata(
  env: Bindings,
  requestUrl: string,
): Record<string, unknown> {
  const issuer = issuerFromEnv(env, requestUrl);
  return buildAuthorizationServerMetadata(issuer);
}

export function getProtectedResourceMetadata(
  env: Bindings,
  requestUrl: string,
): Record<string, unknown> {
  const issuer = issuerFromEnv(env, requestUrl);
  return buildProtectedResourceMetadata(issuer);
}

export async function listTokens(env: Bindings, userId: number) {
  const tokens = await listAuthorizedTokens(env, userId);
  return {
    tokens: tokens.map((t) => ({
      id: t.id,
      client_id: t.client_id,
      client_name: t.client_name,
      scope: t.scope,
      issued_at: t.issued_at,
      expires_at: t.expires_at,
    })),
  };
}

export async function revokeAuthorizedTokenForUser(
  env: Bindings,
  userId: number,
  tokenId: number,
): Promise<boolean> {
  return revokeAuthorizedToken(env, userId, tokenId);
}

export function oidcEnabled(env: Bindings): boolean {
  return isOidcEnabled(env);
}

export function getOpenIdConfiguration(
  env: Bindings,
  requestUrl: string,
): Record<string, unknown> {
  return buildOpenIdConfiguration(env, requestUrl);
}

export async function getJwks(env: Bindings): Promise<{
  body: { keys: Record<string, unknown>[] };
  cacheControl: string;
}> {
  const keys: Record<string, unknown>[] = [];
  const rsa = await loadOidcRsaPrivateKey(env);
  if (rsa) {
    keys.push({
      ...rsa.publicJwk,
      alg: "RS256",
      use: "sig",
      kid: rsa.kid,
    });
  }
  return {
    body: { keys },
    cacheControl: `public, max-age=${OIDC_JWKS_MAX_AGE_SECONDS}, stale-while-revalidate=${OIDC_JWKS_MAX_AGE_SECONDS}, stale-if-error=${OIDC_JWKS_MAX_AGE_SECONDS}`,
  };
}

// ─── DCR ──────────────────────────────────────────────────────

const GRANT_TYPE_MAP: Record<string, string> = {
  authorization_code: "authorization-code",
  implicit: "implicit",
  password: "password",
  client_credentials: "client-credentials",
  "urn:ietf:params:oauth:grant-type:device_code":
    "urn:ietf:params:oauth:grant-type:device_code",
};

export function buildDcrResponse(
  env: Bindings,
  requestUrl: string,
  app: OAuthApplication,
  registrationAccessToken: string,
  clientSecretPlain: string | null,
): Record<string, unknown> {
  const issuer = issuerFromEnv(env, requestUrl);
  const grantTypes =
    app.authorization_grant_type === "authorization-code"
      ? ["authorization_code", "refresh_token"]
      : [
          Object.entries(GRANT_TYPE_MAP).find(
            ([, v]) => v === app.authorization_grant_type,
          )?.[0] ?? app.authorization_grant_type,
        ];

  const data: Record<string, unknown> = {
    client_id: app.client_id,
    redirect_uris: app.redirect_uris.split(/\s+/).filter(Boolean),
    grant_types: grantTypes,
    token_endpoint_auth_method:
      app.client_type === "public" ? "none" : "client_secret_basic",
    registration_access_token: registrationAccessToken,
    registration_client_uri: `${issuer}/api/oauth/register/${app.client_id}`,
  };
  if (app.name) data.client_name = app.name;
  if (clientSecretPlain) data.client_secret = clientSecretPlain;
  return data;
}

export type DcrMetadataResult =
  | { ok: true; metadata: DcrMetadata }
  | DcrServiceError;

/**
 * RFC 7591/7592 のクライアントメタデータを検証（POST 登録 / PUT 更新で共通）。
 */
export function parseDcrMetadata(data: unknown): DcrMetadataResult {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return {
      ok: false,
      status: 400,
      error: "invalid_client_metadata",
      description: "Request body must be a JSON object",
    };
  }
  const body = data as Record<string, unknown>;

  const redirectUris = body.redirect_uris;
  if (!Array.isArray(redirectUris)) {
    return {
      ok: false,
      status: 400,
      error: "invalid_client_metadata",
      description: "redirect_uris must be an array",
    };
  }
  if (redirectUris.length === 0) {
    return {
      ok: false,
      status: 400,
      error: "invalid_client_metadata",
      description:
        "redirect_uris is required for grant type 'authorization_code'",
    };
  }
  if (!redirectUris.every((u) => typeof u === "string")) {
    return {
      ok: false,
      status: 400,
      error: "invalid_client_metadata",
      description: "Each redirect_uri must be a string",
    };
  }
  for (const uri of redirectUris as string[]) {
    if (!isValidRedirectUri(uri)) {
      return {
        ok: false,
        status: 400,
        error: "invalid_client_metadata",
        description: `redirect_uris: Enter a valid URL. (${uri})`,
      };
    }
  }

  const grantTypes = (body.grant_types as unknown) ?? ["authorization_code"];
  if (
    !Array.isArray(grantTypes) ||
    !grantTypes.every((g) => typeof g === "string")
  ) {
    return {
      ok: false,
      status: 400,
      error: "invalid_client_metadata",
      description: "grant_types must be an array",
    };
  }
  const meaningful = (grantTypes as string[]).filter(
    (g) => g !== "refresh_token",
  );
  if (meaningful.length === 0) {
    return {
      ok: false,
      status: 400,
      error: "invalid_client_metadata",
      description:
        "grant_types must contain at least one grant type other than refresh_token",
    };
  }
  if (meaningful.length > 1) {
    return {
      ok: false,
      status: 400,
      error: "invalid_client_metadata",
      description:
        "Only one non-refresh_token grant type is supported per application",
    };
  }
  const applicationGrantType = GRANT_TYPE_MAP[meaningful[0]];
  if (!applicationGrantType) {
    return {
      ok: false,
      status: 400,
      error: "invalid_client_metadata",
      description: `Unsupported grant_type: '${meaningful[0]}'`,
    };
  }

  const authMethod =
    typeof body.token_endpoint_auth_method === "string"
      ? body.token_endpoint_auth_method
      : "client_secret_basic";
  if (
    authMethod !== "none" &&
    authMethod !== "client_secret_basic" &&
    authMethod !== "client_secret_post"
  ) {
    return {
      ok: false,
      status: 400,
      error: "invalid_client_metadata",
      description: `Unsupported token_endpoint_auth_method: '${authMethod}'`,
    };
  }
  return {
    ok: true,
    metadata: {
      name: typeof body.client_name === "string" ? body.client_name : "",
      redirectUris: redirectUris as string[],
      clientType: authMethod === "none" ? "public" : "confidential",
      authorizationGrantType: applicationGrantType,
    },
  };
}

function resolveRegTokenError(description: string): DcrServiceError {
  return {
    ok: false,
    status: 401,
    error: "invalid_token",
    description,
  };
}

export async function authenticateDcrRegistration(
  env: Bindings,
  clientId: string,
  authorizationHeader: string | undefined,
): Promise<
  | { ok: true; application: OAuthApplication; rawToken: string }
  | DcrServiceError
> {
  const raw = authorizationHeader?.startsWith("Bearer ")
    ? authorizationHeader.slice(7).trim()
    : undefined;
  if (!raw) {
    return resolveRegTokenError("Registration access token required");
  }
  const resolved = await resolveRegistrationAccessToken(env, raw, clientId);
  if (!resolved) {
    return resolveRegTokenError("Invalid registration access token");
  }
  return {
    ok: true,
    application: resolved.application,
    rawToken: raw,
  };
}

export async function createDcrClient(
  env: Bindings,
  requestUrl: string,
  metadata: DcrMetadata,
): Promise<DcrClientSuccess> {
  const created = await createDcrApplication(env, metadata);
  return {
    ok: true,
    status: 201,
    body: buildDcrResponse(
      env,
      requestUrl,
      created.application,
      created.registrationAccessToken,
      created.clientSecretPlain,
    ),
  };
}

export async function getDcrClient(
  env: Bindings,
  requestUrl: string,
  clientId: string,
  authorizationHeader: string | undefined,
): Promise<DcrClientSuccess | DcrServiceError> {
  const auth = await authenticateDcrRegistration(
    env,
    clientId,
    authorizationHeader,
  );
  if (!auth.ok) return auth;
  return {
    ok: true,
    status: 200,
    body: buildDcrResponse(
      env,
      requestUrl,
      auth.application,
      auth.rawToken,
      null,
    ),
  };
}

export async function updateDcrClient(
  env: Bindings,
  requestUrl: string,
  clientId: string,
  authorizationHeader: string | undefined,
  metadata: DcrMetadata,
): Promise<DcrClientSuccess | DcrServiceError> {
  const auth = await authenticateDcrRegistration(
    env,
    clientId,
    authorizationHeader,
  );
  if (!auth.ok) return auth;

  const newRegToken = await updateDcrApplication(
    env,
    auth.application.id,
    metadata,
    auth.rawToken,
  );
  const updatedApp: OAuthApplication = {
    ...auth.application,
    name: metadata.name,
    redirect_uris: metadata.redirectUris.join(" "),
    client_type: metadata.clientType,
    authorization_grant_type: metadata.authorizationGrantType,
  };
  return {
    ok: true,
    status: 200,
    body: buildDcrResponse(env, requestUrl, updatedApp, newRegToken, null),
  };
}

export async function deleteDcrClient(
  env: Bindings,
  clientId: string,
  authorizationHeader: string | undefined,
): Promise<DcrDeleteSuccess | DcrServiceError> {
  const auth = await authenticateDcrRegistration(
    env,
    clientId,
    authorizationHeader,
  );
  if (!auth.ok) return auth;
  await deleteOAuthApplicationCascade(env, auth.application.id);
  return { ok: true, noContent: true };
}

// ─── token grants ─────────────────────────────────────────────

/** openid scope + 署名可能な algorithm のとき id_token を発行。 */
async function maybeIssueIdToken(
  env: Bindings,
  params: {
    app: OAuthApplication;
    userId: number;
    scope: string;
    accessToken: string;
    nonce?: string;
  },
): Promise<string | null> {
  if (!isOidcEnabled(env)) return null;
  const scopes = new Set(params.scope.split(/\s+/).filter(Boolean));
  if (!scopes.has("openid")) return null;
  const alg = params.app.algorithm;
  if (alg !== "RS256" && alg !== "HS256") return null;
  if (alg === "HS256" && params.app.hash_client_secret) return null;

  const user = await withDb(env, async (db) => {
    const rows = await db
      .select({ username: users.username, email: users.email })
      .from(users)
      .where(eq(users.id, params.userId))
      .limit(1);
    return rows[0];
  });
  const jti = crypto.randomUUID();
  const claims = buildOidcClaims({
    userId: params.userId,
    username: user?.username ?? null,
    email: user?.email ?? null,
    scope: params.scope,
  });
  claims.jti = jti;
  const idToken = await signIdToken({
    env,
    algorithm: alg,
    clientId: params.app.client_id,
    clientSecretPlain:
      alg === "HS256" ? params.app.client_secret : undefined,
    claims,
    nonce: params.nonce || undefined,
  });
  await saveIdTokenForAccessToken(env, {
    jti,
    userId: params.userId,
    applicationId: params.app.id,
    scope: params.scope,
    accessTokenValue: params.accessToken,
    expiresInSeconds: ID_TOKEN_EXPIRE_SECONDS,
  });
  return idToken;
}

export async function handleAuthorizationCodeGrant(
  env: Bindings,
  form: Record<string, string>,
  app: OAuthApplication,
): Promise<OAuthTokenResult> {
  const code = (form.code || "").trim();
  const redirectUri = (form.redirect_uri || "").trim();
  const verifier = (form.code_verifier || "").trim();
  if (!code || !redirectUri || !verifier) {
    return {
      ok: false,
      status: 400,
      error: "invalid_request",
      description: "code, redirect_uri, and code_verifier are required",
    };
  }

  const grant = await findValidGrant(env, code, app.id);
  if (!grant) {
    return {
      ok: false,
      status: 400,
      error: "invalid_grant",
      description: "Invalid or expired code",
    };
  }
  if (grant.redirect_uri !== redirectUri) {
    return {
      ok: false,
      status: 400,
      error: "invalid_grant",
      description: "redirect_uri mismatch",
    };
  }
  const pkceOk = await verifyPkce(
    verifier,
    grant.code_challenge,
    grant.code_challenge_method || "S256",
  );
  if (!pkceOk) {
    return {
      ok: false,
      status: 400,
      error: "invalid_grant",
      description: "PKCE verification failed",
    };
  }

  const issued = await exchangeAuthorizationCode(env, grant, app.id);
  const body: Record<string, unknown> = {
    access_token: issued.accessToken,
    token_type: "Bearer",
    expires_in: issued.expiresIn,
    refresh_token: issued.refreshToken,
    scope: issued.scope,
  };
  const idToken = await maybeIssueIdToken(env, {
    app,
    userId: grant.user_id,
    scope: issued.scope,
    accessToken: issued.accessToken,
    nonce: grant.nonce,
  });
  if (idToken) body.id_token = idToken;
  return { ok: true, body };
}

export async function handleRefreshTokenGrant(
  env: Bindings,
  form: Record<string, string>,
  app: OAuthApplication,
): Promise<OAuthTokenResult> {
  const refresh = (form.refresh_token || "").trim();
  if (!refresh) {
    return {
      ok: false,
      status: 400,
      error: "invalid_request",
      description: "refresh_token is required",
    };
  }
  const row = await findActiveRefreshToken(env, refresh, app.id);
  if (!row) {
    return {
      ok: false,
      status: 400,
      error: "invalid_grant",
      description: "Invalid refresh token",
    };
  }
  const ageSec = (Date.now() - row.created.getTime()) / 1000;
  if (ageSec > REFRESH_TOKEN_EXPIRE_SECONDS) {
    return {
      ok: false,
      status: 400,
      error: "invalid_grant",
      description: "Refresh token expired",
    };
  }
  const issued = await rotateRefreshToken(env, row);
  return {
    ok: true,
    body: {
      access_token: issued.accessToken,
      token_type: "Bearer",
      expires_in: issued.expiresIn ?? ACCESS_TOKEN_EXPIRE_SECONDS,
      refresh_token: issued.refreshToken,
      scope: issued.scope,
    },
  };
}

export async function handleDeviceCodeGrant(
  env: Bindings,
  form: Record<string, string>,
  app: OAuthApplication,
): Promise<OAuthTokenResult> {
  if (app.authorization_grant_type !== DEVICE_GRANT_TYPE) {
    return {
      ok: false,
      status: 400,
      error: "unauthorized_client",
      description: "Application is not authorized for device_code grant",
    };
  }
  const deviceCode = (form.device_code || "").trim();
  if (!deviceCode) {
    return {
      ok: false,
      status: 400,
      error: "invalid_request",
      description: "device_code is required",
    };
  }
  const grant = await findDeviceGrantByDeviceCode(
    env,
    deviceCode,
    app.client_id,
  );
  if (!grant) {
    return { ok: false, status: 404, error: "device_not_found" };
  }
  if (grant.status === "authorization-pending") {
    return { ok: false, status: 400, error: "authorization_pending" };
  }
  if (grant.status === "denied") {
    return { ok: false, status: 400, error: "access_denied" };
  }
  if (grant.status === "expired") {
    return { ok: false, status: 400, error: "expired_token" };
  }
  if (grant.status !== "authorized") {
    return { ok: false, status: 500, error: "internal_error" };
  }
  const issued = await issueTokensForDeviceGrant(env, grant, app.id);
  return {
    ok: true,
    body: {
      access_token: issued.accessToken,
      token_type: "Bearer",
      expires_in: issued.expiresIn,
      refresh_token: issued.refreshToken,
      scope: issued.scope,
    },
  };
}

export async function processTokenGrant(
  env: Bindings,
  grantType: string,
  form: Record<string, string>,
  app: OAuthApplication,
): Promise<OAuthTokenResult> {
  if (grantType === "authorization_code") {
    return handleAuthorizationCodeGrant(env, form, app);
  }
  if (grantType === "refresh_token") {
    return handleRefreshTokenGrant(env, form, app);
  }
  if (grantType === DEVICE_GRANT_TYPE) {
    return handleDeviceCodeGrant(env, form, app);
  }
  return {
    ok: false,
    status: 400,
    error: "unsupported_grant_type",
    description:
      "Only authorization_code, refresh_token, and device_code are supported",
  };
}

export async function revokeOAuthTokenRequest(
  env: Bindings,
  form: Record<string, string>,
  app: OAuthApplication,
): Promise<RevokeTokenResult> {
  const token = (form.token || "").trim();
  if (!token) return { ok: true, noContent: true };
  const hint = (form.token_type_hint || "").trim() || null;
  await revokeOAuthToken(env, token, hint, app.id);
  return { ok: true, noContent: true };
}
