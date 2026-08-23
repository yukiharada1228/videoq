import type { Context } from "hono";
import { OpenAPIHono } from "@hono/zod-openapi";
import type { AppEnv } from "./types/bindings";
import { requestId } from "./middleware/request-id";
import { accessLogger } from "./middleware/logger";
import { corsMiddleware } from "./middleware/cors";
import { securityHeaders } from "./middleware/security-headers";
import { onError } from "./middleware/error-handler";
import { toErrorBody } from "./shared/errors";
import { registerOpenApiDoc } from "./shared/openapi";
import { healthRoutes } from "./features/health/routes";
import { accountRoutes } from "./features/account/routes";
import { groupRoutes } from "./features/groups/routes";
import { groupMembershipRoutes } from "./features/group-memberships/routes";
import { tagRoutes } from "./features/tags/routes";
import { membershipRoutes } from "./features/membership/routes";
import { videoRoutes } from "./features/videos/routes";
import { chatCompletionsRoutes, chatRoutes } from "./features/chat/routes";
import { evaluationRoutes } from "./features/evaluation/routes";
import { plogRoutes } from "./features/plog/routes";
import { mcpRoutes } from "./features/mcp/routes";
import { mediaRoutes } from "./features/media/routes";
import { adminRoutes } from "./features/admin/routes";
import { billingRoutes } from "./features/billing/routes";
import { schemaRoutes } from "./features/schema/routes";
import { withDb } from "./db/pool";
import { createAuth } from "./lib/auth";
import {
  oauthProviderAuthServerMetadata,
  oauthProviderOpenIdConfigMetadata,
} from "@better-auth/oauth-provider";

/**
 * Hono アプリの組み立て。認証は Better Auth (`/api/auth/*`)。
 */
export function createApp() {
  const app = new OpenAPIHono<AppEnv>();

  app.use("*", requestId);
  app.use("*", accessLogger);
  app.use("*", securityHeaders);
  app.use("*", corsMiddleware);

  app.onError(onError);

  app.route("/", healthRoutes);

  // Better Auth handler (sessions, email/password, API keys, OAuth AS, device).
  app.on(["POST", "GET"], "/api/auth/*", async (c) => {
    return withDb(c.env, async (db) => {
      const auth = createAuth(c.env, db);
      return auth.handler(c.req.raw);
    });
  });

  // OAuth / OIDC discovery at well-known roots (MCP clients expect these).
  app.get("/.well-known/oauth-authorization-server", async (c) => {
    return withDb(c.env, async (db) => {
      const auth = createAuth(c.env, db);
      // Plugin typing does not always surface oauth metadata helpers on Auth.
      return oauthProviderAuthServerMetadata(auth as never)(c.req.raw);
    });
  });
  // RFC 8414 alternate form for issuers with a path (`/api/auth`).
  app.get("/.well-known/oauth-authorization-server/api/auth", async (c) => {
    return withDb(c.env, async (db) => {
      const auth = createAuth(c.env, db);
      return oauthProviderAuthServerMetadata(auth as never)(c.req.raw);
    });
  });
  app.get("/.well-known/openid-configuration", async (c) => {
    return withDb(c.env, async (db) => {
      const auth = createAuth(c.env, db);
      return oauthProviderOpenIdConfigMetadata(auth as never)(c.req.raw);
    });
  });
  const protectedResourceMetadata = (c: Context<AppEnv>) => {
    const origin = new URL(c.req.url).origin;
    const issuer = (
      c.env.BETTER_AUTH_URL?.trim() ||
      c.env.OAUTH_ISSUER_URL?.trim() ||
      c.env.FRONTEND_URL?.trim() ||
      origin
    ).replace(/\/+$/, "");
    return c.json({
      resource: `${issuer}/api/mcp`,
      authorization_servers: [issuer],
    });
  };
  app.get("/.well-known/oauth-protected-resource", protectedResourceMetadata);
  // RFC 9728 path form. MCP 401 の resource_metadata が指す先。
  app.get("/.well-known/oauth-protected-resource/api/mcp", protectedResourceMetadata);

  app.route("/api/account", accountRoutes);
  app.route("/api/billing", billingRoutes);
  app.route("/api/videos", groupRoutes);
  app.route("/api/videos", groupMembershipRoutes);
  app.route("/api/videos", tagRoutes);
  app.route("/api/videos", membershipRoutes);
  app.route("/api/videos", plogRoutes);
  app.route("/api/videos", videoRoutes);
  app.route("/api/chat", chatRoutes);
  app.route("/api/v1/chat", chatCompletionsRoutes);
  app.route("/api/evaluation", evaluationRoutes);
  app.route("/api/mcp", mcpRoutes);
  app.route("/api/media", mediaRoutes);
  app.route("/api/admin", adminRoutes);
  app.route("/api", schemaRoutes);

  registerOpenApiDoc(app);

  app.notFound((c) => c.json(toErrorBody("NOT_FOUND", "Not found"), 404));

  return app;
}

export type AppType = ReturnType<typeof createApp>;
