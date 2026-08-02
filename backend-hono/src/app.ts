import { Hono } from "hono";
import type { AppEnv } from "./types/bindings";
import { requestId } from "./middleware/request-id";
import { accessLogger } from "./middleware/logger";
import { corsMiddleware } from "./middleware/cors";
import { onError } from "./middleware/error-handler";
import { health } from "./routes/health";
import { authRoutes } from "./routes/auth";
import { groupRoutes } from "./routes/groups";
import { tagRoutes } from "./routes/tags";
import { membershipRoutes } from "./routes/membership";
import { videoRoutes } from "./routes/videos";
import { chatRoutes } from "./routes/chat";
import { evaluationRoutes } from "./routes/evaluation";
import { plogRoutes } from "./routes/plog";
import { oauthRoutes } from "./routes/oauth";
import { oauthDotExtrasRoutes } from "./routes/oauth-dot-extras";
import { oauthOidcRoutes } from "./routes/oauth-oidc";
import { mcpRoutes } from "./routes/mcp";
import { mediaRoutes } from "./routes/media";
import { opsRoutes } from "./routes/ops";
import { schemaRoutes } from "./routes/schema";

/**
 * Hono アプリの組み立て。
 * Django Web プロセスは不要（運用は /api/ops/、OpenAPI は /api/schema|docs|redoc）。
 * 重量ジョブ consumer は AWS Lambda 側に残置。
 */
export function createApp() {
  const app = new Hono<AppEnv>();

  app.use("*", requestId);
  app.use("*", accessLogger);
  app.use("*", corsMiddleware);

  app.onError(onError);

  app.route("/", health);
  app.route("/api/auth", authRoutes);
  app.route("/", groupRoutes);
  app.route("/", tagRoutes);
  app.route("/", membershipRoutes);
  app.route("/", videoRoutes);
  app.route("/", chatRoutes);
  app.route("/", evaluationRoutes);
  app.route("/", plogRoutes);
  app.route("/", oauthRoutes);
  app.route("/", oauthDotExtrasRoutes);
  app.route("/", oauthOidcRoutes);
  app.route("/", mcpRoutes);
  app.route("/", mediaRoutes);
  app.route("/", opsRoutes);
  app.route("/", schemaRoutes);

  // Django プロキシは廃止。未定義パスは DRF 風 404。
  app.notFound((c) =>
    c.json({ detail: "Not found." }, 404),
  );

  return app;
}
