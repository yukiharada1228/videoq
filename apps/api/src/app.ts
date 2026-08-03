import { OpenAPIHono } from "@hono/zod-openapi";
import type { AppEnv } from "./types/bindings";
import { requestId } from "./middleware/request-id";
import { accessLogger } from "./middleware/logger";
import { corsMiddleware } from "./middleware/cors";
import { onError } from "./middleware/error-handler";
import { toErrorBody } from "./shared/errors";
import { registerOpenApiDoc } from "./shared/openapi";
import { healthRoutes } from "./features/health/routes";
import { authRoutes } from "./features/auth/routes";
import { groupRoutes } from "./features/groups/routes";
import { tagRoutes } from "./features/tags/routes";
import { membershipRoutes } from "./features/membership/routes";
import { videoRoutes } from "./features/videos/routes";
import { chatCompletionsRoutes, chatRoutes } from "./features/chat/routes";
import { evaluationRoutes } from "./features/evaluation/routes";
import { plogRoutes } from "./features/plog/routes";
import { oauthRoutes, oauthWellKnownRoutes } from "./features/oauth/routes";
import { oauthSupportRoutes } from "./features/oauth/support-routes";
import {
  oauthOidcRoutes,
  oauthOidcWellKnownRoutes,
} from "./features/oauth/oidc";
import { mcpRoutes } from "./features/mcp/routes";
import { mediaRoutes } from "./features/media/routes";
import { adminRoutes } from "./features/admin/routes";
import { schemaRoutes } from "./features/schema/routes";

/**
 * Hono アプリの組み立て。全ドメインは features/* に prefix マウントする。
 * URL 契約は trailing slash なし（クライアント・emit 側も同じ正本に揃える）。
 */
export function createApp() {
  const app = new OpenAPIHono<AppEnv>();

  app.use("*", requestId);
  app.use("*", accessLogger);
  app.use("*", corsMiddleware);

  app.onError(onError);

  app.route("/", healthRoutes);
  app.route("/", oauthWellKnownRoutes);
  app.route("/", oauthOidcWellKnownRoutes);

  app.route("/api/auth", authRoutes);
  app.route("/api/videos", videoRoutes);
  app.route("/api/videos", tagRoutes);
  app.route("/api/videos", groupRoutes);
  app.route("/api/videos", membershipRoutes);
  app.route("/api/videos", plogRoutes);
  app.route("/api/chat", chatRoutes);
  app.route("/api/v1/chat", chatCompletionsRoutes);
  app.route("/api/evaluation", evaluationRoutes);
  app.route("/api/oauth", oauthRoutes);
  app.route("/api/oauth", oauthSupportRoutes);
  app.route("/api/oauth", oauthOidcRoutes);
  app.route("/api/mcp", mcpRoutes);
  app.route("/api/media", mediaRoutes);
  app.route("/api/admin", adminRoutes);
  app.route("/api", schemaRoutes);

  registerOpenApiDoc(app);

  app.notFound((c) => c.json(toErrorBody("NOT_FOUND", "Not found"), 404));

  return app;
}

export type AppType = ReturnType<typeof createApp>;
