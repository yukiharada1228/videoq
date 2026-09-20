import type { BetterAuthPlugin } from "better-auth";
import { createAuthEndpoint } from "better-auth/api";
import {
  enforceDpopBinding,
  isDpopBindingError,
  parseAccessTokenAuthorization,
  verifyJwsAccessToken,
  type DpopReplayStore,
} from "better-auth/oauth2";
import { errors as jwtErrors } from "jose";
import { z } from "zod";
import type { Bindings } from "../types/bindings";
import { hasActiveGrant, isBanned, isInactive, OAUTH_GRANT_CLAIM } from "./auth-security";
import { MCP_READ_SCOPE, MCP_WRITE_SCOPE } from "./mcp-auth";
import { rateLimitBackend } from "./rate-limit";

export type ResourceAccessResult =
  | { kind: "ok"; userId: string; via: "apikey" | "oauth"; accessLevel: string }
  | { kind: "invalid"; message: string }
  | { kind: "forbidden"; message: string; requiredScope: string };

function accessLevelFromMetadata(metadata: unknown): string {
  // The API key plugin owns metadata deserialization, including legacy rows.
  if (!metadata || typeof metadata !== "object") return "read_only";
  const current = "accessLevel" in metadata ? metadata.accessLevel : undefined;
  const legacy = "access_level" in metadata ? metadata.access_level : undefined;
  const level = current ?? legacy;
  return typeof level === "string" ? level : "read_only";
}

/**
 * Resource-server policy exposed only through auth.api, never HTTP endpoints.
 * Better Auth verifies credentials; this extension applies VideoQ account,
 * consent and read/write access policy to the verified identity.
 */
export function videoqResourceAccess(env: Bindings, audience: string) {
  const replayStore: DpopReplayStore = {
    async reserve({ key, expiresAt, now }) {
      const ttl = Math.max(1, Math.ceil((expiresAt.getTime() - now.getTime()) / 1000));
      return (await rateLimitBackend(env).consume(`dpop_${key}`, 1, ttl)).allowed;
    },
  };
  return {
    id: "videoq-resource-access",
    endpoints: {
      verifyVideoqApiKey: createAuthEndpoint.serverOnly({
        method: "POST", body: z.object({ key: z.string() }),
      }, async (ctx): Promise<ResourceAccessResult> => {
        const plugin = ctx.context.getPlugin("api-key");
        if (!plugin) throw new Error("VideoQ requires the Better Auth API key plugin");
        const result = await plugin.endpoints.verifyApiKey({ body: ctx.body, context: ctx.context });
        if (!result.valid || !result.key) return { kind: "invalid", message: "Invalid API key" };
        const user = await ctx.context.internalAdapter.findUserById(result.key.referenceId);
        if (!user || isBanned(user) || isInactive(user)) {
          return { kind: "invalid", message: "User is inactive" };
        }
        return {
          kind: "ok", userId: user.id, via: "apikey",
          accessLevel: accessLevelFromMetadata(result.key.metadata),
        };
      }),
      verifyVideoqOAuth: createAuthEndpoint.serverOnly({
        method: "POST",
        body: z.object({
          authorizationHeader: z.string().nullish(),
          dpopProofJwt: z.string().nullish(),
          method: z.string(), url: z.string(),
        }),
      }, async (ctx): Promise<ResourceAccessResult> => {
        const authorization = parseAccessTokenAuthorization(ctx.body.authorizationHeader);
        if (!authorization?.token || authorization.scheme === "Unknown") {
          return { kind: "invalid", message: "Invalid OAuth access token" };
        }
        const jwt = ctx.context.getPlugin("jwt");
        if (!jwt) throw new Error("VideoQ requires the Better Auth JWT plugin");
        let payload;
        try {
          // verifyAccessTokenRequest currently accepts only a remote JWKS URL.
          // Workers cannot fetch their own same-zone Route, so compose the
          // public verifier and DPoP helper with the JWT plugin's local endpoint.
          payload = await verifyJwsAccessToken(authorization.token, {
            jwksFetch: () => jwt.endpoints.getJwks({ context: ctx.context }),
            jwksCacheKey: env,
            verifyOptions: { issuer: ctx.context.baseURL, audience },
          });
          await enforceDpopBinding({
            payload, authorization, proofJwt: ctx.body.dpopProofJwt,
            method: ctx.body.method, url: ctx.body.url, replayStore,
          });
        } catch (error) {
          // Match Better Auth's resource verifier: malformed credentials are
          // refusals, while database/JWKS/replay-store failures remain errors.
          const invalidJwt = error instanceof jwtErrors.JOSEError && !(
            error instanceof jwtErrors.JWKSInvalid ||
            error instanceof jwtErrors.JWKSTimeout ||
            error instanceof jwtErrors.JWKSMultipleMatchingKeys
          );
          if (invalidJwt || isDpopBindingError(error)) {
            return { kind: "invalid", message: "Invalid OAuth access token" };
          }
          throw error;
        }
        // The composed verifier has no scope parser. Keep this RFC 6749 shape
        // check until the standard request verifier supports local JWKS.
        const scope = payload.scope;
        if (scope !== undefined && (typeof scope !== "string" || !scope ||
          scope.split(" ").some((value) => !/^[\x21\x23-\x5b\x5d-\x7e]+$/.test(value)))) {
          return { kind: "invalid", message: "Invalid OAuth access token" };
        }
        const scopes = typeof scope === "string" ? scope.split(" ") : [];
        const userId = payload.sub;
        if (!userId || !await hasActiveGrant(ctx.context, {
          userId, clientId: payload.client_id,
          referenceId: payload[OAUTH_GRANT_CLAIM], scopes,
        })) return { kind: "invalid", message: "OAuth authorization has been revoked" };
        if (!scopes.includes(MCP_READ_SCOPE)) {
          return {
            kind: "forbidden", message: "OAuth token lacks videoq.read scope",
            requiredScope: MCP_READ_SCOPE,
          };
        }
        return {
          kind: "ok", userId, via: "oauth",
          accessLevel: scopes.includes(MCP_WRITE_SCOPE) ? "all" : "read_only",
        };
      }),
    },
  } satisfies BetterAuthPlugin;
}
