import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { apiKey } from "@better-auth/api-key";
import { oauthProvider } from "@better-auth/oauth-provider";
import {
  admin,
  deviceAuthorization,
  jwt,
  username,
} from "better-auth/plugins";
import type { Db } from "../db/pool";
import * as schema from "../db/schema";
import type { Bindings } from "../types/bindings";
import { sendMail } from "./mail";
import { resolveSignupQuotaDefaults } from "../shared/signup-quota";

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

function authBaseURL(env: Bindings): string {
  return (
    env.BETTER_AUTH_URL?.trim() ||
    env.OAUTH_ISSUER_URL?.trim() ||
    env.FRONTEND_URL?.trim() ||
    "http://localhost"
  );
}

/**
 * Per-request Better Auth instance bound to the Hyperdrive-backed Drizzle client.
 * Do not reuse across requests — the DB client is request-scoped.
 */
export function createAuth(env: Bindings, db: Db) {
  const quota = resolveSignupQuotaDefaults(env);
  const baseURL = authBaseURL(env);

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        user: schema.users,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
        apikey: schema.apikey,
        jwks: schema.jwks,
        deviceCode: schema.deviceCode,
        oauthClient: schema.oauthClient,
        oauthRefreshToken: schema.oauthRefreshToken,
        oauthAccessToken: schema.oauthAccessToken,
        oauthConsent: schema.oauthConsent,
      },
    }),
    secret: authSecret(env),
    baseURL,
    basePath: "/api/auth",
    trustedOrigins: trustedOrigins(env),
    // OAuth provider owns /oauth2/token; disable BA's first-party /token alias.
    disabledPaths: ["/token"],
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      sendResetPassword: async ({ user, url }) => {
        await sendMail(env, user.email, "[VideoQ] パスワード再設定のご案内", [
          "VideoQ のパスワード再設定リクエストを受け付けました。",
          "24時間以内に、以下のURLから新しいパスワードを設定してください。",
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
        await sendMail(env, user.email, "[VideoQ] 仮登録が完了しました", [
          "VideoQ へのご登録ありがとうございます。",
          "以下のURLをクリックして、本登録を完了させてください。",
          "",
          url,
        ]);
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
          await sendMail(env, newEmail, "[VideoQ] メールアドレス変更の確認", [
            "VideoQ のメールアドレス変更リクエストを受け付けました。",
            `現在のアカウント: ${user.email}`,
            "以下のURLをクリックして、新しいメールアドレスへの変更を完了させてください。",
            "",
            url,
          ]);
        },
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 14,
      updateAge: 60 * 60 * 24,
      cookieCache: {
        enabled: true,
        maxAge: 5 * 60,
      },
    },
    advanced: {
      database: {
        generateId: ({ model }) => {
          if (model === "user") return false;
          return crypto.randomUUID();
        },
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
      window: 60,
      max: 100,
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            const q = resolveSignupQuotaDefaults(env);
            const username =
              typeof user.username === "string" ? user.username : undefined;
            const displayUsername =
              typeof user.displayUsername === "string"
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
                dateJoined: new Date().toISOString(),
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
      deviceAuthorization({
        verificationUri: `${env.FRONTEND_URL ?? baseURL}/device`,
      }),
      oauthProvider({
        loginPage: "/login",
        consentPage: "/consent",
        allowUnauthenticatedClientRegistration: true,
      }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
