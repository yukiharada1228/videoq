import type { AuthContext, BetterAuthPlugin, GenericEndpointContext } from "better-auth";
import {
  APIError,
  createAuthEndpoint,
  createAuthMiddleware,
  getSessionFromCtx,
  sensitiveSessionMiddleware,
} from "better-auth/api";
import {
  extendOAuthProvider,
  getOAuthProviderApi,
  type OAuthClaimExtensionInput,
  type OAuthOptions,
  type OAuthRefreshToken,
} from "@better-auth/oauth-provider";
import { stripAccessTokenAuthorizationScheme } from "better-auth/oauth2";
import { z } from "zod";

export const OAUTH_GRANT_CLAIM = "videoq_grant";

export type OAuthConsentGrant = {
  id: string;
  userId: string | null;
  clientId: string;
  scopes: string[];
};

function isInactive(user: object): boolean {
  return "isActive" in user && user.isActive === false;
}

function isBanned(user: object): boolean {
  return "banned" in user && user.banned === true;
}

function invalidGrant(): never {
  throw new APIError("BAD_REQUEST", {
    error: "invalid_grant",
    error_description: "Authorization has expired or been revoked. Authorize the application again.",
  });
}

type GrantIdentity = {
  userId: unknown;
  clientId: unknown;
  referenceId: unknown;
  scopes: readonly string[];
};

async function hasActiveGrant(context: AuthContext, grant: GrantIdentity): Promise<boolean> {
  const { userId, clientId, referenceId, scopes } = grant;
  if (
    typeof userId !== "string" || !userId ||
    typeof clientId !== "string" || !clientId ||
    typeof referenceId !== "string" || !referenceId
  ) return false;
  const user = await context.internalAdapter.findUserById(userId);
  if (!user || isInactive(user) || isBanned(user)) return false;
  const consent = await context.adapter.findOne<OAuthConsentGrant>({
    model: "oauthConsent",
    where: [
      { field: "id", value: referenceId },
      { field: "userId", value: userId },
      { field: "clientId", value: clientId },
    ],
  });
  return Boolean(consent && scopes.every((scope) => consent.scopes.includes(scope)));
}

async function requireIssuanceGrant(input: OAuthClaimExtensionInput): Promise<void> {
  if (!await hasActiveGrant(input.ctx.context, {
    userId: input.user?.id, clientId: input.client.clientId,
    referenceId: input.referenceId, scopes: input.scopes,
  })) invalidGrant();
}

const authorizationCodeSchema = z
  .object({
    type: z.literal("authorization_code"),
    userId: z.string().min(1),
    referenceId: z.string().optional(),
    query: z.object({
      client_id: z.string().min(1),
      scope: z.string().optional(),
    }).passthrough(),
  })
  .passthrough();

async function findRefreshToken(
  ctx: GenericEndpointContext, options: OAuthOptions<string[]>, token: string,
) {
  const prefix = options.prefix?.refreshToken;
  if (prefix) {
    if (!token.startsWith(prefix)) return null;
    token = token.slice(prefix.length);
  }
  if (options.formatRefreshToken) token = (await options.formatRefreshToken.decrypt(token)).token;
  return ctx.context.adapter.findOne<OAuthRefreshToken<string[]>>({
    model: "oauthRefreshToken",
    where: [{
      field: "token",
      value: await getOAuthProviderApi(ctx, options).hashToken(token, "refresh_token"),
    }],
  });
}

/** Runs before *all* token formats, including opaque tokens and rotation replay. */
async function checkTokenGrant(ctx: GenericEndpointContext, options: OAuthOptions<string[]>) {
  // Before hooks run ahead of the provider's zod schema, which trims grant_type.
  const grantType = typeof ctx.body?.grant_type === "string" ? ctx.body.grant_type.trim() : undefined;
  if (grantType === "authorization_code" && typeof ctx.body.code === "string") {
    const identifier = await getOAuthProviderApi(ctx, options).hashToken(ctx.body.code, "authorization_code");
    const verification = await ctx.context.internalAdapter.findVerificationValue(identifier);
    // Let the provider consume codes and handle missing/replayed codes itself:
    // its replay handling also revokes tokens issued for the consumed code.
    if (!verification) return;
    let value: unknown;
    try { value = JSON.parse(verification.value); } catch { return; }
    const parsed = authorizationCodeSchema.safeParse(value);
    if (!parsed.success) return;
    const grant = parsed.data;
    if (!await hasActiveGrant(ctx.context, {
      userId: grant.userId, clientId: grant.query.client_id,
      referenceId: grant.referenceId, scopes: grant.query.scope?.split(" ") ?? [],
    })) invalidGrant();
  } else if (grantType === "refresh_token" && typeof ctx.body.refresh_token === "string") {
    const token = await findRefreshToken(ctx, options, ctx.body.refresh_token);
    if (!token) return;
    if (!await hasActiveGrant(ctx.context, {
      userId: token.userId, clientId: token.clientId, referenceId: token.referenceId,
      scopes: typeof ctx.body.scope === "string" ? ctx.body.scope.split(" ") : token.scopes,
    })) invalidGrant();
  }
}

const introspectionSchema = z.object({
  active: z.literal(true),
  sub: z.string(),
  client_id: z.string(),
  scope: z.string(),
  [OAUTH_GRANT_CLAIM]: z.string().optional(),
});

/**
 * Bind each authorization code (and every rotated refresh token) to the
 * immutable consent id. A new consent after revocation must never revive an
 * old grant. Better Auth carries referenceId from code -> refresh -> claims.
 */
export function videoqAuthSecurity(options: OAuthOptions<string[]>): BetterAuthPlugin {
  return {
    id: "videoq-auth-security",
    init(authContext) {
      extendOAuthProvider(authContext, {
        claims: {
          accessToken: async (input) => {
            await requireIssuanceGrant(input);
            return { [OAUTH_GRANT_CLAIM]: input.referenceId };
          },
          idToken: async (input) => {
            // OIDC can issue an ID token alongside an opaque access token.
            await requireIssuanceGrant(input);
            return {};
          },
          userInfo: async ({ ctx, user, jwt, scopes }) => {
            // The provider has already verified the token and its DPoP proof.
            // JWT validation alone does not re-read the grant or user status.
            if (!await hasActiveGrant(ctx.context, {
              userId: user.id, clientId: jwt.client_id ?? jwt.azp,
              referenceId: jwt[OAUTH_GRANT_CLAIM], scopes,
            })) {
              throw new APIError("UNAUTHORIZED", { error: "invalid_token" }, {
                "WWW-Authenticate": 'Bearer error="invalid_token"',
              });
            }
            return {};
          },
        },
      });
      return {
        options: {
          databaseHooks: {
            session: {
              create: {
                before: async (session) => {
                  const user = await authContext.internalAdapter.findUserById(session.userId);
                  if (!user || isInactive(user)) {
                    throw new APIError("FORBIDDEN", {
                      code: "USER_INACTIVE",
                      message: "User is inactive",
                    });
                  }
                },
              },
            },
            verification: {
              create: {
                before: async (verification) => {
                  let value: unknown;
                  try {
                    value = JSON.parse(verification.value);
                  } catch {
                    return;
                  }
                  if (
                    !value || typeof value !== "object" ||
                    !("type" in value) || value.type !== "authorization_code"
                  ) return;
                  const parsed = authorizationCodeSchema.safeParse(value);
                  if (!parsed.success) invalidGrant();
                  const consent = await authContext.adapter.findOne<OAuthConsentGrant>({
                    model: "oauthConsent",
                    where: [
                      { field: "userId", value: parsed.data.userId },
                      { field: "clientId", value: parsed.data.query.client_id },
                    ],
                  });
                  if (!consent) invalidGrant();
                  return {
                    data: {
                      ...verification,
                      value: JSON.stringify({ ...parsed.data, referenceId: consent.id }),
                    },
                  };
                },
              },
            },
          },
        },
      };
    },
    hooks: {
      before: [{
        matcher: ({ path }) => path !== "/sign-out",
        handler: createAuthMiddleware(async (ctx) => {
          // This reads the underlying session endpoint, not auth.api, so it
          // does not recursively invoke this hook. Never authorize from cache.
          const session = await getSessionFromCtx(ctx, { disableCookieCache: true });
          if (session && (isInactive(session.user) || isBanned(session.user))) {
            throw new APIError("FORBIDDEN", {
              code: "USER_INACTIVE",
              message: "User is inactive",
            });
          }
        }),
      }, {
        matcher: ({ path }) => path === "/oauth2/token",
        handler: createAuthMiddleware(async (ctx) => { await checkTokenGrant(ctx, options); }),
      }],
      after: [{
        matcher: ({ path }) => path === "/oauth2/introspect",
        handler: createAuthMiddleware(async (ctx) => {
          // Preserve the provider's client authentication, signature checks and
          // errors. Only narrow a successfully validated introspection result.
          const result = ctx.context.returned;
          if (!result || typeof result !== "object" || !("active" in result) || result.active !== true) return;
          const parsed = introspectionSchema.safeParse(result);
          if (!parsed.success) return ctx.json({ active: false });
          const payload = parsed.data;
          let referenceId = payload[OAUTH_GRANT_CLAIM];
          if (!referenceId && typeof ctx.body?.token === "string") {
            // Refresh-token introspection has no custom claims. Bind it to the
            // stored original consent instead of trusting the current consent.
            const token = await findRefreshToken(ctx, options, stripAccessTokenAuthorizationScheme(ctx.body.token));
            if (token?.userId === payload.sub && token.clientId === payload.client_id) {
              referenceId = token.referenceId;
            }
          }
          if (!await hasActiveGrant(ctx.context, {
            userId: payload.sub, clientId: payload.client_id,
            referenceId, scopes: payload.scope.split(" "),
          })) return ctx.json({ active: false });
        }),
      }],
    },
  };
}

export async function deleteOAuthGrant(
  adapter: AuthContext["adapter"],
  userId: string,
  consentId: string,
): Promise<void> {
  await adapter.transaction(async (tx) => {
    const consent = await tx.findOne<OAuthConsentGrant>({
      model: "oauthConsent",
      where: [{ field: "id", value: consentId }, { field: "userId", value: userId }],
    });
    if (!consent) throw new APIError("NOT_FOUND", { message: "Authorization not found" });
    const where = [
      { field: "userId", value: userId },
      { field: "clientId", value: consent.clientId },
    ];
    // Deleting refresh rows also removes cached rotation replay responses.
    // Delete access tokens first because they can reference refresh rows.
    await tx.deleteMany({ model: "oauthAccessToken", where });
    await tx.deleteMany({ model: "oauthRefreshToken", where });
    await tx.deleteMany({ model: "oauthConsent", where });
  });
}

/** Replace the provider's consent-only deletion with an atomic disconnection. */
export const revokeOAuthConsent = createAuthEndpoint("/oauth2/delete-consent", {
  method: "POST",
  body: z.object({ id: z.string().min(1) }),
  use: [sensitiveSessionMiddleware],
}, async (ctx) => {
  await deleteOAuthGrant(ctx.context.adapter, ctx.context.session.user.id, ctx.body.id);
  return ctx.json({ success: true });
});
