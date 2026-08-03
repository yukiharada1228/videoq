import {
  createFeatureRouter,
  createRoute,
  errorResponse,
  jsonResponse,
  z,
} from "../../shared/openapi";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { requireAuth, apiKeyMethod, jwtMethod } from "../../middleware/auth";
import { apiError, toErrorBody, validationError } from "../../shared/errors";
import { hasTrustedOrigin } from "../../shared/origin";
import {
  clientIp,
  enforceThrottles,
  normalizeThrottleIdent,
  throttledResponse,
  type ThrottleScope,
} from "../../lib/rate-limit";
import type { AppEnv } from "../../types/bindings";
import {
  apiKeyCreateSchema,
  apiKeyIdParamSchema,
  emailBodySchema,
  accessTokenResponseSchema,
  loginBodySchema,
  messageResponseSchema,
  passwordResetConfirmSchema,
  searchApiKeyBodySchema,
  searchApiKeyStatusSchema,
  signupBodySchema,
  actionTokenParamSchema,
} from "./schemas";
import * as authService from "./service";

/**
 * 認証・アカウント系。createRoute + service。URL は trailing slash なし。
 */
export const authRoutes = createFeatureRouter();

const jwtOnly = requireAuth(jwtMethod);
const jwtWriteGuards = [requireAuth(jwtMethod)] as const;
const meAuth = requireAuth(apiKeyMethod, jwtMethod);

function isJsonRequest(c: Context<AppEnv>): boolean {
  const ct = c.req.header("content-type") ?? "";
  return ct.split(";")[0].trim().toLowerCase() === "application/json";
}

const ACCESS_TOKEN_TTL_SECONDS = 10 * 60;
const REFRESH_TOKEN_TTL_SECONDS = 14 * 24 * 60 * 60;

function refreshCookieName(c: Context<AppEnv>): string {
  return c.env.ENVIRONMENT === "production" ? "__Host-vq_refresh" : "vq_refresh";
}

function setRefreshCookie(c: Context<AppEnv>, refresh: string): void {
  const secure = c.env.ENVIRONMENT === "production";
  setCookie(c, refreshCookieName(c), refresh, {
    httpOnly: true,
    secure,
    sameSite: secure ? "None" : "Lax",
    maxAge: REFRESH_TOKEN_TTL_SECONDS,
    path: "/",
  });
}

function clearRefreshCookie(c: Context<AppEnv>): void {
  const secure = c.env.ENVIRONMENT === "production";
  deleteCookie(c, refreshCookieName(c), {
    path: "/",
    sameSite: secure ? "None" : "Lax",
    secure,
  });
}

function refreshTokenFromCookie(c: Context<AppEnv>): string | undefined {
  return getCookie(c, refreshCookieName(c));
}

const requireTrustedOrigin = createMiddleware<AppEnv>(async (c, next) => {
  if (!hasTrustedOrigin(c)) {
    return c.json(toErrorBody("FORBIDDEN", "Origin is not allowed"), 403);
  }
  return next();
});

/** login/signup は application/json のみ受け付け、単純リクエスト経由の偽造を防ぐ。 */
const requireJson = createMiddleware<AppEnv>(async (c, next) => {
  if (!isJsonRequest(c)) {
    return c.json(
      toErrorBody(
        "UNSUPPORTED_MEDIA_TYPE",
        `Unsupported media type "${c.req.header("content-type") ?? ""}" in request.`,
      ),
      415,
    );
  }
  return next();
});

const loginThrottle = createMiddleware<AppEnv>(async (c, next) => {
  const ip = clientIp(c);
  const denied = await enforceThrottles(c.env, [{ scope: "login_ip", ident: ip }]);
  if (denied) return throttledResponse(c, denied);
  return next();
});

const signupThrottle = createMiddleware<AppEnv>(async (c, next) => {
  const ip = clientIp(c);
  const denied = await enforceThrottles(c.env, [{ scope: "signup_ip", ident: ip }]);
  if (denied) return throttledResponse(c, denied);
  return next();
});

const passwordResetThrottle = createMiddleware<AppEnv>(async (c, next) => {
  const ip = clientIp(c);
  const denied = await enforceThrottles(c.env, [
    { scope: "password_reset_ip", ident: ip },
  ]);
  if (denied) return throttledResponse(c, denied);
  return next();
});

const emailChangeThrottle = createMiddleware<AppEnv>(async (c, next) => {
  const userId = c.get("userId")!;
  const denied = await enforceThrottles(c.env, [
    { scope: "email_change_user", ident: String(userId) },
  ]);
  if (denied) return throttledResponse(c, denied);
  return next();
});

async function enforceValidatedIdentity(
  c: Context<AppEnv>,
  scope: ThrottleScope,
  value: string,
) {
  const denied = await enforceThrottles(c.env, [
    { scope, ident: normalizeThrottleIdent(value, true) },
  ]);
  return denied ? throttledResponse(c, denied) : null;
}

// --- Sessions ---
const loginRoute = createRoute({
  method: "post",
  path: "/api/auth/sessions",
  tags: ["Auth"],
  summary: "Login and create a rotating refresh session",
  middleware: [requireJson, loginThrottle] as const,
  request: {
    body: {
      content: { "application/json": { schema: loginBodySchema } },
      required: true,
    },
  },
  responses: {
    200: jsonResponse(accessTokenResponseSchema),
    400: errorResponse("Authentication or validation failed"),
    415: errorResponse("Unsupported media type"),
    429: errorResponse("Rate limited"),
  },
});
authRoutes.openapi(loginRoute, async (c) => {
  const { username, password } = c.req.valid("json");
  const throttled = await enforceValidatedIdentity(c, "login_username", username);
  if (throttled) return throttled;
  const res = await authService.login(c.env, username, password);
  if (!res.ok) {
    return apiError(c, 400, "Authentication failed", "AUTHENTICATION_FAILED");
  }
  setRefreshCookie(c, res.refreshToken);
  return c.json(
    {
      access_token: res.accessToken,
      token_type: "Bearer" as const,
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
    },
    200,
  );
});

const logoutRoute = createRoute({
  method: "delete",
  path: "/api/auth/sessions",
  tags: ["Auth"],
  summary: "Revoke refresh session",
  middleware: [requireTrustedOrigin] as const,
  responses: { 204: { description: "No content" } },
});
authRoutes.openapi(logoutRoute, async (c) => {
  await authService.logout(c.env, refreshTokenFromCookie(c));
  clearRefreshCookie(c);
  return c.body(null, 204);
});

const refreshRoute = createRoute({
  method: "post",
  path: "/api/auth/tokens",
  tags: ["Auth"],
  summary: "Rotate tokens from refresh cookie",
  middleware: [requireTrustedOrigin] as const,
  responses: {
    200: jsonResponse(accessTokenResponseSchema),
    401: errorResponse("Invalid refresh token"),
  },
});
authRoutes.openapi(refreshRoute, async (c) => {
  const res = await authService.refreshSession(c.env, refreshTokenFromCookie(c));
  if (!res.ok) {
    return apiError(c, 401, "Invalid refresh token", "AUTHENTICATION_FAILED");
  }
  setRefreshCookie(c, res.refreshToken);
  return c.json(
    {
      access_token: res.accessToken,
      token_type: "Bearer" as const,
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
    },
    200,
  );
});

// --- Email verification ---
const verifyEmailRoute = createRoute({
  method: "patch",
  path: "/api/auth/email-verifications/{token}",
  tags: ["Auth"],
  summary: "Verify email",
  request: { params: actionTokenParamSchema },
  responses: {
    200: jsonResponse(messageResponseSchema),
    400: errorResponse("Invalid link"),
  },
});
authRoutes.openapi(verifyEmailRoute, async (c) => {
  const { token } = c.req.valid("param");
  const res = await authService.verifyEmail(c.env, token);
  if (!res.ok) return apiError(c, 400, res.message);
  return c.json(
    { message: "Email verification completed. Please sign in." },
    200,
  );
});

// --- Password reset ---
const requestPasswordResetRoute = createRoute({
  method: "post",
  path: "/api/auth/password-resets",
  tags: ["Auth"],
  summary: "Request password reset email",
  middleware: [passwordResetThrottle] as const,
  request: {
    body: {
      content: { "application/json": { schema: emailBodySchema } },
      required: true,
    },
  },
  responses: {
    200: jsonResponse(messageResponseSchema),
    400: errorResponse("Validation error"),
    429: errorResponse("Rate limited"),
  },
});
authRoutes.openapi(requestPasswordResetRoute, async (c) => {
  const { email } = c.req.valid("json");
  const throttled = await enforceValidatedIdentity(
    c,
    "password_reset_email",
    email,
  );
  if (throttled) return throttled;
  const res = await authService.requestPasswordReset(c.env, email);
  if (!res.ok) return validationError(c, res.details);
  return c.json(
    { message: "Password reset email sent. Please check your email." },
    200,
  );
});

const confirmPasswordResetRoute = createRoute({
  method: "patch",
  path: "/api/auth/password-resets/{token}",
  tags: ["Auth"],
  summary: "Confirm password reset",
  request: {
    params: actionTokenParamSchema,
    body: {
      content: { "application/json": { schema: passwordResetConfirmSchema } },
      required: true,
    },
  },
  responses: {
    200: jsonResponse(messageResponseSchema),
    400: errorResponse("Validation or invalid link"),
  },
});
authRoutes.openapi(confirmPasswordResetRoute, async (c) => {
  const { token } = c.req.valid("param");
  const { new_password } = c.req.valid("json");
  const res = await authService.confirmPasswordReset(
    c.env,
    token,
    new_password,
  );
  if (!res.ok) {
    if ("details" in res) return validationError(c, res.details);
    return apiError(c, 400, res.message);
  }
  return c.json(
    {
      message:
        "Password reset successfully. Please sign in with your new password.",
    },
    200,
  );
});

// --- Email change ---
const requestEmailChangeRoute = createRoute({
  method: "patch",
  path: "/api/auth/me/email",
  tags: ["Auth"],
  summary: "Request email change",
  middleware: [jwtOnly, emailChangeThrottle] as const,
  request: {
    body: {
      content: { "application/json": { schema: emailBodySchema } },
      required: true,
    },
  },
  responses: {
    200: jsonResponse(messageResponseSchema),
    400: errorResponse("Validation error"),
    401: errorResponse("Unauthorized"),
    429: errorResponse("Rate limited"),
  },
});
authRoutes.openapi(requestEmailChangeRoute, async (c) => {
  const { email } = c.req.valid("json");
  const throttled = await enforceValidatedIdentity(c, "email_change_email", email);
  if (throttled) return throttled;
  const res = await authService.requestEmailChange(
    c.env,
    c.get("userId")!,
    email,
  );
  if (!res.ok) {
    if ("internalError" in res) {
      return c.json(
        {
          error: {
            code: "INTERNAL_ERROR",
            message: "An internal server error occurred.",
          },
        },
        500,
      );
    }
    return validationError(c, res.details);
  }
  return c.json(
    {
      message:
        "Email change confirmation sent. Please check your new email address.",
    },
    200,
  );
});

const confirmEmailChangeRoute = createRoute({
  method: "patch",
  path: "/api/auth/email-change/{token}",
  tags: ["Auth"],
  summary: "Confirm email change",
  request: { params: actionTokenParamSchema },
  responses: {
    200: jsonResponse(messageResponseSchema),
    400: errorResponse("Invalid link"),
  },
});
authRoutes.openapi(confirmEmailChangeRoute, async (c) => {
  const { token } = c.req.valid("param");
  const res = await authService.confirmEmailChange(c.env, token);
  if (!res.ok) return apiError(c, 400, res.message);
  return c.json({ message: "Email address updated." }, 200);
});

// --- Signup ---
const signupRoute = createRoute({
  method: "post",
  path: "/api/auth/users",
  tags: ["Auth"],
  summary: "Sign up",
  middleware: [requireJson, signupThrottle] as const,
  request: {
    body: {
      content: { "application/json": { schema: signupBodySchema } },
      required: true,
    },
  },
  responses: {
    201: jsonResponse(messageResponseSchema),
    400: errorResponse("Validation error"),
    415: errorResponse("Unsupported media type"),
    429: errorResponse("Rate limited"),
  },
});
authRoutes.openapi(signupRoute, async (c) => {
  const body = c.req.valid("json");
  const throttled = await enforceValidatedIdentity(c, "signup_email", body.email);
  if (throttled) return throttled;
  const res = await authService.signup(c.env, body);
  if (!res.ok) {
    if ("internalError" in res) {
      return c.json(
        {
          error: {
            code: "INTERNAL_ERROR",
            message: "An internal server error occurred.",
          },
        },
        500,
      );
    }
    return validationError(c, res.details);
  }
  return c.json({ message: authService.SIGNUP_OK_MESSAGE }, 201);
});

// --- API keys ---
const listApiKeysRoute = createRoute({
  method: "get",
  path: "/api/auth/api-keys",
  tags: ["Auth"],
  summary: "List API keys",
  middleware: [jwtOnly] as const,
  responses: {
    200: jsonResponse(z.array(z.record(z.string(), z.unknown()))),
    401: errorResponse("Unauthorized"),
  },
});
authRoutes.openapi(listApiKeysRoute, async (c) => {
  return c.json(await authService.listUserApiKeys(c.env, c.get("userId")!), 200);
});

const createApiKeyRoute = createRoute({
  method: "post",
  path: "/api/auth/api-keys",
  tags: ["Auth"],
  summary: "Create API key",
  middleware: [...jwtWriteGuards] as const,
  request: {
    body: {
      content: { "application/json": { schema: apiKeyCreateSchema } },
      required: true,
    },
  },
  responses: {
    201: jsonResponse(z.record(z.string(), z.unknown())),
    400: errorResponse("Validation error"),
    401: errorResponse("Unauthorized"),
  },
});
authRoutes.openapi(createApiKeyRoute, async (c) => {
  const { name, access_level } = c.req.valid("json");
  const res = await authService.createUserApiKey(
    c.env,
    c.get("userId")!,
    name,
    access_level,
  );
  if (!res.ok) return validationError(c, res.details);
  return c.json({ ...res.apiKey.apiKey, api_key: res.apiKey.rawKey }, 201);
});

const revokeApiKeyRoute = createRoute({
  method: "delete",
  path: "/api/auth/api-keys/{id}",
  tags: ["Auth"],
  summary: "Revoke API key",
  middleware: [...jwtWriteGuards] as const,
  request: { params: apiKeyIdParamSchema },
  responses: {
    204: { description: "No content" },
    404: errorResponse("Not found"),
    401: errorResponse("Unauthorized"),
  },
});
authRoutes.openapi(revokeApiKeyRoute, async (c) => {
  const { id } = c.req.valid("param");
  const ok = await authService.revokeUserApiKey(c.env, c.get("userId")!, id);
  if (!ok) return apiError(c, 404, "API key not found");
  return c.body(null, 204);
});

// --- SearchAPI key ---
const searchApiKeyStatusRoute = createRoute({
  method: "get",
  path: "/api/auth/searchapi-key",
  tags: ["Auth"],
  summary: "SearchAPI key status",
  middleware: [jwtOnly] as const,
  responses: {
    200: jsonResponse(searchApiKeyStatusSchema),
    401: errorResponse("Unauthorized"),
  },
});
authRoutes.openapi(searchApiKeyStatusRoute, async (c) => {
  return c.json(
    await authService.searchApiKeyStatus(c.env, c.get("userId")!),
    200,
  );
});

const saveSearchApiKeyRoute = createRoute({
  method: "put",
  path: "/api/auth/searchapi-key",
  tags: ["Auth"],
  summary: "Save SearchAPI key",
  middleware: [...jwtWriteGuards] as const,
  request: {
    body: {
      content: { "application/json": { schema: searchApiKeyBodySchema } },
      required: true,
    },
  },
  responses: {
    200: jsonResponse(messageResponseSchema),
    400: errorResponse("Validation error"),
    404: errorResponse("Not found"),
  },
});
authRoutes.openapi(saveSearchApiKeyRoute, async (c) => {
  const { api_key } = c.req.valid("json");
  const res = await authService.saveUserSearchApiKey(
    c.env,
    c.get("userId")!,
    api_key,
  );
  if (!res.ok) {
    if ("notFound" in res) {
      return apiError(c, 404, "User not found", "NOT_FOUND");
    }
    return validationError(c, res.details);
  }
  return c.json({ message: "SearchAPI API key saved." }, 200);
});

const removeSearchApiKeyRoute = createRoute({
  method: "delete",
  path: "/api/auth/searchapi-key",
  tags: ["Auth"],
  summary: "Delete SearchAPI key",
  middleware: [...jwtWriteGuards] as const,
  responses: {
    200: jsonResponse(messageResponseSchema),
    404: errorResponse("Not found"),
  },
});
authRoutes.openapi(removeSearchApiKeyRoute, async (c) => {
  const ok = await authService.removeUserSearchApiKey(c.env, c.get("userId")!);
  if (!ok) return apiError(c, 404, "User not found", "NOT_FOUND");
  return c.json({ message: "SearchAPI API key deleted." }, 200);
});

// --- Me ---
const meRoute = createRoute({
  method: "get",
  path: "/api/auth/me",
  tags: ["Auth"],
  summary: "Current user",
  middleware: [meAuth] as const,
  responses: {
    200: jsonResponse(z.object({ data: z.record(z.string(), z.unknown()) })),
    401: errorResponse("Unauthorized"),
    404: errorResponse("Not found"),
  },
});
authRoutes.openapi(meRoute, async (c) => {
  const user = await authService.getMe(c.env, c.get("userId")!);
  if (!user) return c.json(toErrorBody("NOT_FOUND", "Not found."), 404);
  return c.json({ data: user }, 200);
});
