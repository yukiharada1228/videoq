import {
  DEFAULT_SCOPES,
  OAUTH_SCOPES,
  isValidRedirectUri,
  isValidResourceUri,
} from "../../lib/oauth";
import {
  createAuthorizationGrant,
  findApplicationByClientId,
  redirectUriAllowed,
  type OAuthApplication,
} from "../../repositories/oauth-repository";
import type { Bindings } from "../../types/bindings";

export type AuthParams = {
  clientId: string;
  redirectUri: string;
  responseType: string;
  state: string;
  scope: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  resource: string[];
  nonce: string;
};

export type AuthParamsError = {
  error: string;
  description: string;
  redirectUri?: string;
  state?: string;
};

export function resolveScopes(requested: string | null | undefined): string {
  const parts = (requested || DEFAULT_SCOPES.join(" "))
    .split(/\s+/)
    .filter(Boolean);
  const allowed = parts.filter((s) => s in OAUTH_SCOPES);
  return (allowed.length ? allowed : [...DEFAULT_SCOPES]).join(" ");
}

export function scopesDescriptions(scope: string): string[] {
  return scope
    .split(/\s+/)
    .filter(Boolean)
    .map((s) => OAUTH_SCOPES[s] ?? s);
}

function parseResources(
  raw: string | null | undefined,
): string[] | { error: string } {
  if (!raw || !raw.trim()) return [];
  const list = raw.trim().split(/\s+/);
  for (const uri of list) {
    if (!isValidResourceUri(uri)) {
      return {
        error: `The resource '${uri}' is not a valid resource indicator: it must be an absolute URI with a scheme and host.`,
      };
    }
  }
  return list;
}

export function readAuthParams(
  src: Record<string, string | undefined>,
): AuthParams | AuthParamsError {
  const clientId = (src.client_id || "").trim();
  const redirectUri = (src.redirect_uri || "").trim();
  const responseType = (src.response_type || "").trim();
  const state = src.state || "";
  const codeChallenge = (src.code_challenge || "").trim();
  const codeChallengeMethod = (src.code_challenge_method || "").trim();
  const nonce = src.nonce || "";
  const scope = resolveScopes(src.scope);

  if (!clientId) {
    return { error: "invalid_request", description: "Missing client_id" };
  }
  if (responseType !== "code") {
    return {
      error: "unsupported_response_type",
      description: "Only response_type=code is supported",
      redirectUri: redirectUri || undefined,
      state,
    };
  }
  if (!redirectUri || !isValidRedirectUri(redirectUri)) {
    return {
      error: "invalid_request",
      description: "Invalid redirect_uri",
    };
  }
  if (!codeChallenge) {
    return {
      error: "invalid_request",
      description: "PKCE code_challenge is required",
      redirectUri,
      state,
    };
  }
  if (codeChallengeMethod !== "S256" && codeChallengeMethod !== "plain") {
    return {
      error: "invalid_request",
      description: "Unsupported code_challenge_method",
      redirectUri,
      state,
    };
  }
  const resources = parseResources(src.resource);
  if ("error" in resources) {
    return {
      error: "invalid_target",
      description: resources.error,
      redirectUri,
      state,
    };
  }

  return {
    clientId,
    redirectUri,
    responseType,
    state,
    scope,
    codeChallenge,
    codeChallengeMethod,
    resource: resources,
    nonce,
  };
}

export function appendQuery(
  base: string,
  params: Record<string, string>,
): string {
  const u = new URL(base);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") u.searchParams.set(k, v);
  }
  return u.toString();
}

export type AuthorizePrepareResult =
  | {
      kind: "consent";
      app: OAuthApplication;
      params: AuthParams;
    }
  | {
      kind: "skip";
      app: OAuthApplication;
      params: AuthParams;
    }
  | {
      kind: "redirect_error";
      location: string;
    }
  | {
      kind: "html_error";
      status: 400;
      applicationName: string;
      redirectUriHost: string | null;
      isDcrClient: boolean;
      error: string;
      description: string;
    };

/** GET authorize: パラメータ検証〜同意画面 or skip 判定（ログイン済み前提）。 */
export async function prepareAuthorizeGet(
  env: Bindings,
  src: Record<string, string | undefined>,
): Promise<AuthorizePrepareResult | AuthParamsError> {
  const parsed = readAuthParams(src);
  if ("error" in parsed) return parsed;

  const app = await findApplicationByClientId(env, parsed.clientId);
  if (!app) {
    return {
      kind: "html_error",
      status: 400,
      applicationName: "",
      redirectUriHost: null,
      isDcrClient: false,
      error: "invalid_request",
      description: "Invalid client_id",
    };
  }
  if (!redirectUriAllowed(app, parsed.redirectUri)) {
    return {
      kind: "html_error",
      status: 400,
      applicationName: app.name || app.client_id,
      redirectUriHost: null,
      isDcrClient: app.registration_source === "dcr" && app.user_id == null,
      error: "invalid_request",
      description: "Mismatching redirect URI",
    };
  }
  if (app.authorization_grant_type !== "authorization-code") {
    return {
      kind: "redirect_error",
      location: appendQuery(parsed.redirectUri, {
        error: "unauthorized_client",
        error_description: "Client is not authorized for this grant",
        ...(parsed.state ? { state: parsed.state } : {}),
      }),
    };
  }

  if (app.skip_authorization) {
    return { kind: "skip", app, params: parsed };
  }
  return { kind: "consent", app, params: parsed };
}

export async function issueAuthorizationCode(
  env: Bindings,
  userId: number,
  app: OAuthApplication,
  p: AuthParams,
): Promise<string> {
  return createAuthorizationGrant(env, {
    userId,
    applicationId: app.id,
    redirectUri: p.redirectUri,
    scope: p.scope,
    codeChallenge: p.codeChallenge,
    codeChallengeMethod: p.codeChallengeMethod,
    resource: p.resource,
    nonce: p.nonce,
  });
}

export async function resolveAuthorizeErrorRedirect(
  env: Bindings,
  parsed: AuthParamsError,
  clientIdHint: string | undefined,
): Promise<string | null> {
  if (!parsed.redirectUri || !isValidRedirectUri(parsed.redirectUri)) {
    return null;
  }
  if (parsed.error === "invalid_request" && !clientIdHint) return null;
  const app = clientIdHint
    ? await findApplicationByClientId(env, clientIdHint)
    : null;
  if (!app || !redirectUriAllowed(app, parsed.redirectUri)) return null;
  return appendQuery(parsed.redirectUri, {
    error: parsed.error,
    error_description: parsed.description,
    ...(parsed.state ? { state: parsed.state } : {}),
  });
}

export async function prepareAuthorizePost(
  env: Bindings,
  form: Record<string, string>,
): Promise<
  | { kind: "deny"; location: string }
  | { kind: "allow"; app: OAuthApplication; params: AuthParams }
  | {
      kind: "html_error";
      status: 400;
      error: string;
      description: string;
    }
> {
  const parsed = readAuthParams(form);
  if ("error" in parsed) {
    return {
      kind: "html_error",
      status: 400,
      error: parsed.error,
      description: parsed.description,
    };
  }

  const app = await findApplicationByClientId(env, parsed.clientId);
  if (!app || !redirectUriAllowed(app, parsed.redirectUri)) {
    return {
      kind: "html_error",
      status: 400,
      error: "invalid_request",
      description: "Invalid client or redirect_uri",
    };
  }

  const allow = form.allow === "True" || form.allow === "true";
  if (!allow) {
    return {
      kind: "deny",
      location: appendQuery(parsed.redirectUri, {
        error: "access_denied",
        error_description: "The user denied the authorization request",
        ...(parsed.state ? { state: parsed.state } : {}),
      }),
    };
  }
  return { kind: "allow", app, params: parsed };
}
