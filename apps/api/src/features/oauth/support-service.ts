import {
  DEFAULT_SCOPES,
  DEVICE_CODE_EXPIRE_SECONDS,
  DEVICE_FLOW_INTERVAL,
  DEVICE_GRANT_TYPE,
  OAUTH_SCOPES,
  issuerFromEnv,
} from "../../lib/oauth";
import {
  bearerHasIntrospectionScope,
  createDeviceGrant,
  findApplicationByClientId,
  findDeviceGrantByUserCode,
  findTokenForIntrospection,
  updateDeviceGrantStatus,
  verifyClientSecret,
  type OAuthApplication,
} from "../../repositories/oauth-repository";
import type { Bindings } from "../../types/bindings";

export type OAuthClientAuthResult =
  | { ok: true; app: OAuthApplication }
  | { ok: false; status: 400 | 401; error: string; description: string };

export type OAuthProtocolJsonError = {
  status: 400 | 401 | 403;
  error: string;
  description?: string;
};

export type IntrospectResult =
  | { kind: "forbidden" }
  | { kind: "error"; error: OAuthProtocolJsonError }
  | { kind: "inactive" }
  | {
      kind: "active";
      body: {
        active: true;
        scope: string;
        exp: number;
        client_id?: string;
        username?: string;
      };
    };

export type DeviceAuthorizationResult =
  | { kind: "error"; error: OAuthProtocolJsonError }
  | {
      kind: "success";
      body: {
        device_code: string;
        user_code: string;
        verification_uri: string;
        verification_uri_complete: string;
        expires_in: number;
        interval: number;
      };
    };

export type DeviceUserCodeFlowResult =
  | { action: "invalid" }
  | { action: "redirect_status"; clientId: string; userCode: string }
  | { action: "redirect_confirm"; clientId: string; userCode: string };

export type DeviceConfirmResult =
  | { action: "redirect_status"; clientId: string; userCode: string }
  | { action: "done"; clientId: string; userCode: string };

/** RFC 7662 / RFC 8628 向け client 認証（form + optional Basic）。 */
export async function authenticateClientForm(
  env: Bindings,
  form: Record<string, string>,
  authorizationHeader?: string | null,
): Promise<OAuthClientAuthResult> {
  let clientId = (form.client_id || "").trim();
  let clientSecret = form.client_secret ?? "";
  const authz = authorizationHeader || "";
  if (authz.startsWith("Basic ")) {
    try {
      const decoded = atob(authz.slice(6));
      const idx = decoded.indexOf(":");
      if (idx >= 0) {
        clientId = decodeURIComponent(decoded.slice(0, idx));
        clientSecret = decodeURIComponent(decoded.slice(idx + 1));
      }
    } catch {
      return {
        ok: false,
        status: 401,
        error: "invalid_client",
        description: "Invalid client authentication",
      };
    }
  }
  if (!clientId) {
    return {
      ok: false,
      status: 400,
      error: "invalid_client",
      description: "Missing client_id",
    };
  }
  const app = await findApplicationByClientId(env, clientId);
  if (!app) {
    return {
      ok: false,
      status: 401,
      error: "invalid_client",
      description: "No application found for client_id.",
    };
  }
  if (app.client_type === "confidential") {
    if (!(await verifyClientSecret(app, clientSecret))) {
      return {
        ok: false,
        status: 401,
        error: "invalid_client",
        description: "Invalid client credentials",
      };
    }
  }
  return { ok: true, app };
}

/** RFC 7662 token introspection。 */
export async function introspectToken(
  env: Bindings,
  input: {
    token: string;
    form: Record<string, string>;
    authorizationHeader: string;
  },
): Promise<IntrospectResult> {
  const authz = input.authorizationHeader || "";
  const clientAuth = await authenticateClientForm(env, input.form, authz);
  let allowed = false;
  if (authz.startsWith("Basic ") || (input.form.client_id || "").trim()) {
    if (!clientAuth.ok) {
      return {
        kind: "error",
        error: {
          status: clientAuth.status,
          error: clientAuth.error,
          description: clientAuth.description,
        },
      };
    }
    allowed = true;
  } else {
    const bearerTok = authz.startsWith("Bearer ") ? authz.slice(7).trim() : "";
    if (bearerTok && (await bearerHasIntrospectionScope(env, bearerTok))) {
      allowed = true;
    }
  }
  if (!allowed) return { kind: "forbidden" };
  if (!input.token) {
    return {
      kind: "error",
      error: {
        status: 400,
        error: "invalid_request",
        description: "Token parameter is missing.",
      },
    };
  }
  const active = await findTokenForIntrospection(env, input.token);
  if (!active) return { kind: "inactive" };
  return {
    kind: "active",
    body: {
      active: true,
      scope: active.scope,
      exp: active.exp,
      client_id: active.client_id || undefined,
      username: active.username ?? undefined,
    },
  };
}

/** RFC 8628 device authorization。 */
export async function authorizeDevice(
  env: Bindings,
  requestUrl: string,
  input: {
    form: Record<string, string>;
    authorizationHeader?: string | null;
  },
): Promise<DeviceAuthorizationResult> {
  const auth = await authenticateClientForm(
    env,
    input.form,
    input.authorizationHeader,
  );
  if (!auth.ok) {
    return {
      kind: "error",
      error: {
        status: auth.status,
        error: auth.error,
        description: auth.description,
      },
    };
  }
  if (auth.app.authorization_grant_type !== DEVICE_GRANT_TYPE) {
    return {
      kind: "error",
      error: {
        status: 400,
        error: "unauthorized_client",
        description: "Application is not authorized for device_code grant",
      },
    };
  }
  const requested = (input.form.scope || "").trim();
  const scopes = requested
    ? requested.split(/\s+/).filter((s) => s in OAUTH_SCOPES)
    : [...DEFAULT_SCOPES];
  const scope = (scopes.length ? scopes : [...DEFAULT_SCOPES]).join(" ");
  const grant = await createDeviceGrant(env, auth.app.client_id, scope);
  const issuer = issuerFromEnv(env, requestUrl);
  const verificationUri = `${issuer}/api/oauth/device/`;
  return {
    kind: "success",
    body: {
      device_code: grant.deviceCode,
      user_code: grant.userCode,
      verification_uri: verificationUri,
      verification_uri_complete: `${verificationUri}?user_code=${encodeURIComponent(grant.userCode)}`,
      expires_in: DEVICE_CODE_EXPIRE_SECONDS,
      interval: DEVICE_FLOW_INTERVAL,
    },
  };
}

/** HTML device user-code POST: 次の遷移先を決定。 */
export async function resolveDeviceUserCodeFlow(
  env: Bindings,
  userCode: string,
): Promise<DeviceUserCodeFlowResult> {
  const grant = await findDeviceGrantByUserCode(env, userCode);
  if (!grant || grant.status === "expired") {
    return { action: "invalid" };
  }
  if (grant.status !== "authorization-pending") {
    return {
      action: "redirect_status",
      clientId: grant.clientId,
      userCode: grant.userCode,
    };
  }
  return {
    action: "redirect_confirm",
    clientId: grant.clientId,
    userCode: grant.userCode,
  };
}

/** HTML device confirm POST: allow/deny 後の遷移先を決定。 */
export async function resolveDeviceConfirmDecision(
  env: Bindings,
  clientId: string,
  userCode: string,
  userId: number,
  denied: boolean,
): Promise<DeviceConfirmResult> {
  const grant = await findDeviceGrantByUserCode(env, userCode, clientId);
  if (!grant || grant.status !== "authorization-pending") {
    return { action: "redirect_status", clientId, userCode };
  }
  await updateDeviceGrantStatus(
    env,
    grant.id,
    denied ? "denied" : "authorized",
    userId,
  );
  return { action: "done", clientId, userCode };
}
