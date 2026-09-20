import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { apiKey } from "@better-auth/api-key";
import { oauthProvider } from "@better-auth/oauth-provider";
import {
  admin,
  jwt,
  username,
} from "better-auth/plugins";
import { eq } from "drizzle-orm";
import type { Db } from "../db/pool";
import * as schema from "../db/schema";
import type { Bindings } from "../types/bindings";
import { sendMail } from "./mail";
import { authLogger, summarizeAuthApiError } from "./auth-error-log";
import { rateLimitBackend } from "./rate-limit";
import { MCP_OAUTH_SCOPES } from "./mcp-auth";
import { resolveSignupQuotaDefaults } from "../shared/signup-quota";
import { passwordResetIdentifierStorage, videoqAuthSecurity, videoqOAuthClaims } from "./auth-security";
import { videoqResourceAccess } from "./auth-access";

function trustedOrigins(env: Bindings): string[] {
  return (env.CORS_ALLOW_ORIGIN ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function authSecret(env: Bindings): string {
  const secret = env.BETTER_AUTH_SECRET?.trim() || env.AUTH_JWT_SECRET?.trim();
  if (!secret) throw new Error("BETTER_AUTH_SECRET is required");
  return secret;
}

/** The first email approves the change; only the second completes it. */
function emailChangeMailUrl(url: string, stage: "approval" | "verification"): string {
  const link = new URL(url);
  const callbackURL = link.searchParams.get("callbackURL");
  if (!callbackURL) return url;
  const callback = new URL(callbackURL, link);
  // Leave other callers' callback pages unchanged. This is a display hint for
  // the app's confirmation page, never an authorization or verification check.
  if (!/^\/(?:en\/|ja\/)?change-email\/?$/.test(callback.pathname)) return url;
  if (stage === "approval") callback.searchParams.set("step", "verify-new");
  else if (callback.searchParams.get("step") === "verify-new") callback.searchParams.delete("step");
  else return url;
  link.searchParams.set("callbackURL", callback.href);
  return link.href;
}

export function authBaseURL(env: Bindings): string {
  return (
    env.BETTER_AUTH_URL?.trim() ||
    env.OAUTH_ISSUER_URL?.trim() ||
    env.FRONTEND_URL?.trim() ||
    "http://localhost"
  ).replace(/\/+$/, "");
}

/** OAuth access tokenの発行・検証で共有する唯一のresource audience。 */
export const oauthResourceAudience = (env: Bindings): string =>
  `${authBaseURL(env)}/api/mcp`;

export function oauthProviderConfig(env: Bindings) {
  const resource = oauthResourceAudience(env);
  return {
    scopes: [...MCP_OAUTH_SCOPES],
    grantTypes: ["authorization_code", "refresh_token"],
    extensions: [videoqOAuthClaims],
    resources: [
      {
        identifier: resource,
        name: "VideoQ MCP",
        allowedScopes: [...MCP_OAUTH_SCOPES],
        accessTokenTtl: 15 * 60,
      },
    ],
    resourceSeedMode: "merge" as const,
    clientRegistrationDefaultResources: [resource],
    clientRegistrationAllowedResources: [resource],
    // DCR clients that omit scope still receive the VideoQ read/write scopes;
    // clients may explicitly request only videoq.read for least privilege.
    clientRegistrationDefaultScopes: [...MCP_OAUTH_SCOPES],
    clientRegistrationAllowedScopes: [...MCP_OAUTH_SCOPES],
    loginPage: "/login",
    consentPage: "/consent",
    // MCP clients (Claude etc.) need unauthenticated DCR for public clients.
    allowDynamicClientRegistration: true,
    allowUnauthenticatedClientRegistration: true,
    // Confidential clients from DCR get a bounded secret lifetime.
    clientRegistrationClientSecretExpiration: "30d",
    rateLimit: {
      register: { window: 60, max: 5 },
      token: { window: 60, max: 20 },
      authorize: { window: 60, max: 30 },
    },
    // The Hono app explicitly exposes the RFC 8414 issuer-path route.
    silenceWarnings: { oauthAuthServerConfig: true },
  };
}

/** Normalize an email local-part (or name) into a BA username candidate. */
export function usernameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "user";
  let base = local
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (base.length < 3) base = `user_${base}`.replace(/_+/g, "_");
  if (base.length < 3) base = "user";
  return base.slice(0, 150);
}

async function allocateUniqueUsername(db: Db, preferred: string): Promise<string> {
  let seed = preferred.includes("@")
    ? usernameFromEmail(preferred)
    : preferred
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 150);
  if (seed.length < 3) seed = usernameFromEmail(preferred.includes("@") ? preferred : `${seed || "user"}@x`);

  for (let i = 0; i < 50; i++) {
    const suffix = i === 0 ? "" : `_${i}`;
    const candidate = `${seed.slice(0, Math.max(1, 150 - suffix.length))}${suffix}`;
    const rows = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.username, candidate))
      .limit(1);
    if (rows.length === 0) return candidate;
  }
  return `user_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

type AuthRateLimitStorage = NonNullable<
  NonNullable<Parameters<typeof betterAuth>[0]["rateLimit"]>["customStorage"]
>;

/** Better Auth 側のレート制限窓。DO に載るのでこの値が全 isolate 共通になる。 */
const AUTH_RATE_LIMIT_WINDOW_SEC = 60;

/** パスワード再設定トークンの有効期限。案内メールの文面と必ず一致させる。 */
export const PASSWORD_RESET_TOKEN_TTL_SEC = 60 * 60;

/**
 * Better Auth のレート制限を RateLimiter Durable Object に載せる。
 *
 * 既定の `memory` ストレージは isolate ごとに独立するため、Workers では
 * ログイン・登録・パスワード再設定・OAuth の制限を、別 isolate に当たるだけで
 * 迂回できてしまう。DO なら 1 キー = 1 インスタンスで直列化される。
 */
export function durableRateLimitStorage(env: Bindings): AuthRateLimitStorage {
  const backend = rateLimitBackend(env);
  // アプリ側スコープ（`throttle_*`）とキー空間を分ける。
  const scoped = (key: string) => `better_auth_${key}`;
  return {
    async consume(key, rule) {
      const { allowed, retryAfterSec } = await backend.consume(
        scoped(key),
        rule.max,
        rule.window,
      );
      return { allowed, retryAfter: allowed ? null : retryAfterSec };
    },
  };
}

/**
 * Per-request Better Auth instance bound to the Hyperdrive-backed Drizzle client.
 * Do not reuse across requests — the DB client is request-scoped.
 */
export function createAuth(env: Bindings, db: Db) {
  const quota = resolveSignupQuotaDefaults(env);
  const baseURL = authBaseURL(env);
  const googleClientId = env.GOOGLE_CLIENT_ID?.trim();
  const googleClientSecret = env.GOOGLE_CLIENT_SECRET?.trim();
  const googleEnabled = Boolean(googleClientId && googleClientSecret);
  const oauth = oauthProvider(oauthProviderConfig(env));

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "pg",
      transaction: true,
      schema: {
        user: schema.users,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
        apikey: schema.apikey,
        jwks: schema.jwks,
        oauthClient: schema.oauthClient,
        oauthResource: schema.oauthResource,
        oauthClientResource: schema.oauthClientResource,
        oauthRefreshToken: schema.oauthRefreshToken,
        oauthAccessToken: schema.oauthAccessToken,
        oauthConsent: schema.oauthConsent,
        oauthClientAssertion: schema.oauthClientAssertion,
      },
    }),
    secret: authSecret(env),
    baseURL,
    basePath: "/api/auth",
    trustedOrigins: trustedOrigins(env),
    logger: authLogger,
    onAPIError: {
      errorURL: `${(env.FRONTEND_URL ?? baseURL).replace(/\/+$/, "")}/login`,
      onError: (error) => {
        console.error(
          JSON.stringify({
            level: "error",
            event: "better_auth_api_error",
            ...summarizeAuthApiError(error),
          }),
        );
      },
    },
    // OAuth provider owns /oauth2/token; disable BA's first-party /token alias.
    disabledPaths: ["/token"],
    verification: {
      storeIdentifier: passwordResetIdentifierStorage,
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
      // 案内メールの文面と同じ値を明示しておき、既定値の変更で乖離させない。
      resetPasswordTokenExpiresIn: PASSWORD_RESET_TOKEN_TTL_SEC,
      sendResetPassword: async ({ user, url }) => {
        await sendMail(env, user.email, "[VideoQ] パスワード再設定のご案内", [
          "VideoQ のパスワード再設定リクエストを受け付けました。",
          `${PASSWORD_RESET_TOKEN_TTL_SEC / 3600}時間以内に、以下のURLから新しいパスワードを設定してください。`,
          "",
          url,
          "",
          "もしこのリクエストに心当たりがない場合は、このメールを破棄してください。",
        ]);
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        await sendMail(env, user.email, "[VideoQ] メールアドレスの確認", [
          "VideoQ のメールアドレス確認リクエストを受け付けました。",
          "以下のURLをクリックして、このメールアドレスの確認を完了させてください。",
          "",
          emailChangeMailUrl(url, "verification"),
        ]);
      },
    },
    socialProviders: googleEnabled
      ? {
          google: {
            clientId: googleClientId!,
            clientSecret: googleClientSecret!,
            prompt: "select_account",
            requireEmailVerification: true,
            mapProfileToUser: async (profile) => {
              const email =
                typeof profile.email === "string" ? profile.email : "";
              // Google is authoritative for Gmail and hosted Workspace mail.
              // A third-party email may have changed owners since Google
              // originally verified it; require our own mailbox verification.
              const authoritativeEmail = email.toLowerCase().endsWith("@gmail.com") ||
                (typeof profile.hd === "string" && profile.hd.trim().length > 0);
              const preferred =
                typeof profile.name === "string" && profile.name.trim()
                  ? profile.name.trim()
                  : email;
              const allocated = await allocateUniqueUsername(db, email || preferred);
              return {
                name: preferred || allocated,
                email,
                emailVerified: profile.email_verified === true && authoritativeEmail,
                image: typeof profile.picture === "string" ? profile.picture : undefined,
                username: allocated,
                displayUsername: allocated,
              };
            },
          },
        }
      : {},
    account: {
      // Encrypt provider access/refresh tokens with the auth secret at rest.
      // Better Auth still accepts legacy plaintext tokens during the transition.
      encryptOAuthTokens: true,
      accountLinking: {
        enabled: true,
      },
    },
    user: {
      additionalFields: {
        maxVideoUploadSizeMb: {
          type: "number",
          required: true,
          defaultValue: quota.maxVideoUploadSizeMb,
          input: false,
        },
        aiAnswersLimit: {
          type: "number",
          required: false,
          defaultValue: quota.aiAnswersLimit,
          input: false,
        },
        isOverQuota: {
          type: "boolean",
          required: true,
          defaultValue: false,
          input: false,
        },
        processingLimitMinutes: {
          type: "number",
          required: false,
          defaultValue: quota.processingLimitMinutes,
          input: false,
        },
        storageLimitGb: {
          type: "number",
          required: false,
          defaultValue: quota.storageLimitGb,
          input: false,
        },
        usedAiAnswers: {
          type: "number",
          required: true,
          defaultValue: 0,
          input: false,
        },
        usedProcessingSeconds: {
          type: "number",
          required: true,
          defaultValue: 0,
          input: false,
        },
        usedStorageBytes: {
          type: "number",
          required: true,
          defaultValue: 0,
          input: false,
        },
        isSuperuser: {
          type: "boolean",
          required: true,
          defaultValue: false,
          input: false,
        },
        isStaff: {
          type: "boolean",
          required: true,
          defaultValue: false,
          input: false,
        },
        isActive: {
          type: "boolean",
          required: true,
          defaultValue: true,
          input: false,
        },
        firstName: {
          type: "string",
          required: true,
          defaultValue: "",
          input: false,
        },
        lastName: {
          type: "string",
          required: true,
          defaultValue: "",
          input: false,
        },
        passwordResetRequired: {
          type: "boolean",
          required: true,
          defaultValue: false,
          input: false,
        },
      },
      changeEmail: {
        enabled: true,
        sendChangeEmailConfirmation: async ({ user, newEmail, url }) => {
          await sendMail(env, user.email, "[VideoQ] メールアドレス変更の承認", [
            "VideoQ のメールアドレス変更リクエストを受け付けました。",
            `現在のアカウント: ${user.email}`,
            `変更先のメールアドレス: ${newEmail}`,
            "変更を承認する場合は、以下のURLをクリックしてください。承認後、新しいメールアドレスへ確認メールを送信します。",
            "",
            emailChangeMailUrl(url, "approval"),
            "",
            "このリクエストに心当たりがない場合は、リンクを開かないでください。",
          ]);
        },
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 14,
      updateAge: 60 * 60 * 24,
      cookieCache: {
        // All Better Auth endpoints must observe suspension and revocation.
        enabled: false,
      },
    },
    advanced: {
      // Keep origin/CSRF enforcement identical in tests and deployed Workers.
      disableOriginCheck: false,
      disableCSRFCheck: false,
      // Better Auth default: string UUIDs for all models including user.
      database: {
        generateId: () => crypto.randomUUID(),
      },
      // Cloudflare Workers uses a single, edge-controlled client IP header.
      // X-Forwarded-For keeps the local Caddy reverse proxy usable; Better Auth
      // rejects multi-hop values unless trusted proxies are configured.
      ipAddress: {
        ipAddressHeaders: ["cf-connecting-ip", "x-forwarded-for"],
      },
      useSecureCookies: env.ENVIRONMENT === "production",
      defaultCookieAttributes: {
        sameSite: "lax",
        httpOnly: true,
        path: "/",
      },
    },
    rateLimit: {
      enabled: true,
      window: AUTH_RATE_LIMIT_WINDOW_SEC,
      max: 100,
      // serverless では memory ストレージが isolate 間で共有されない。
      customStorage: durableRateLimitStorage(env),
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            const q = resolveSignupQuotaDefaults(env);
            let username =
              typeof user.username === "string" && user.username.trim()
                ? user.username.trim()
                : undefined;
            if (!username) {
              username = await allocateUniqueUsername(
                db,
                typeof user.email === "string" ? user.email : "user",
              );
            }
            const displayUsername =
              typeof user.displayUsername === "string" && user.displayUsername.trim()
                ? user.displayUsername
                : username;
            const name =
              (typeof user.name === "string" && user.name) ||
              username ||
              user.email;
            return {
              data: {
                ...user,
                name,
                username,
                displayUsername,
                maxVideoUploadSizeMb: q.maxVideoUploadSizeMb,
                aiAnswersLimit: q.aiAnswersLimit,
                processingLimitMinutes: q.processingLimitMinutes,
                storageLimitGb: q.storageLimitGb,
                isOverQuota: false,
                usedAiAnswers: 0,
                usedProcessingSeconds: 0,
                usedStorageBytes: 0,
                isSuperuser: false,
                isStaff: false,
                isActive: true,
                firstName: "",
                lastName: "",
                role: "user",
                passwordResetRequired: false,
              },
            };
          },
        },
      },
    },
    plugins: [
      username({
        minUsernameLength: 3,
        maxUsernameLength: 150,
      }),
      admin({
        defaultRole: "user",
        adminRoles: ["admin"],
      }),
      apiKey({
        enableMetadata: true,
        defaultPrefix: "vq_",
        apiKeyHeaders: ["x-api-key"],
        startingCharactersConfig: {
          shouldStore: true,
          charactersLength: 8,
        },
      }),
      jwt(),
      oauth,
      videoqAuthSecurity(oauth.options),
      videoqResourceAccess(env, oauthResourceAudience(env)),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
