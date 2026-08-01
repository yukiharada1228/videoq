import { Hono } from "hono";
import type { AppEnv } from "./types/bindings";
import { requestId } from "./middleware/request-id";
import { accessLogger } from "./middleware/logger";
import { corsMiddleware } from "./middleware/cors";
import { onError } from "./middleware/error-handler";
import { health } from "./routes/health";
import { authRoutes } from "./routes/auth";
import { groupRoutes } from "./routes/groups";
import { videoRoutes } from "./routes/videos";
import { chatRoutes } from "./routes/chat";
import { proxyToLegacy } from "./routes/proxy";

/**
 * Hono アプリの組み立て。
 * ミドルウェア順: requestId → logger → CORS。
 * ルート: /health /ready（Worker 自前）→ それ以外は未移行として Django へプロキシ。
 * Phase 1 以降、移行済みルート（/api/auth など）をプロキシより前に登録していく。
 */
export function createApp() {
  const app = new Hono<AppEnv>();

  app.use("*", requestId);
  app.use("*", accessLogger);
  app.use("*", corsMiddleware);

  app.onError(onError);

  // --- Worker が自前で処理するルート ---
  app.route("/", health);

  // 移行済みルート（プロキシより前に登録）。フルパス定義で "/" にマウントする。
  app.route("/api/auth", authRoutes); // /me は末尾スラッシュ両方を明示定義済み
  app.route("/", groupRoutes); // GET /api/videos/groups(/)
  app.route("/", videoRoutes); // GET /api/videos(/)（一覧/詳細, file=R2 presigned）
  app.route("/", chatRoutes); // GET /api/chat/groups/:id/history(/)

  // 未移行の /api/videos/<id>、POST 等は下のプロキシで Django に流れる。

  // --- 未移行ルート: 既存バックエンドへプロキシ（ストラングラーフィグ）---
  app.all("*", proxyToLegacy);

  return app;
}
