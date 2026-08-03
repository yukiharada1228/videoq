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
import { chatRoutes } from "./features/chat/routes";
import { evaluationRoutes } from "./features/evaluation/routes";
import { plogRoutes } from "./features/plog/routes";
import { oauthRoutes } from "./features/oauth/routes";
import { oauthSupportRoutes } from "./features/oauth/support-routes";
import { oauthOidcRoutes } from "./features/oauth/oidc";
import { mcpRoutes } from "./features/mcp/routes";
import { mediaRoutes } from "./features/media/routes";
import { opsRoutes } from "./features/ops/routes";
import { schemaRoutes } from "./features/schema/routes";

/**
 * Hono アプリの組み立て。全ドメインは features/* にマウントする。
 */
export function createApp() {
  const app = new OpenAPIHono<AppEnv>();

  app.use("*", requestId);
  app.use("*", accessLogger);
  app.use("*", corsMiddleware);

  app.onError(onError);

  app.route("/", healthRoutes);
  app.route("/", authRoutes);
  app.route("/", groupRoutes);
  app.route("/", tagRoutes);
  app.route("/", membershipRoutes);
  app.route("/", videoRoutes);
  app.route("/", chatRoutes);
  app.route("/", evaluationRoutes);
  app.route("/", plogRoutes);
  app.route("/", oauthRoutes);
  app.route("/", oauthSupportRoutes);
  app.route("/", oauthOidcRoutes);
  app.route("/", mcpRoutes);
  app.route("/", mediaRoutes);
  app.route("/", opsRoutes);
  app.route("/", schemaRoutes);

  registerOpenApiDoc(app);

  app.notFound((c) => c.json(toErrorBody("NOT_FOUND", "Not found"), 404));

  return app;
}
