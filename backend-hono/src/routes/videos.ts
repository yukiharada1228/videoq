import { Hono } from "hono";
import type { Context } from "hono";
import { requireAuth, apiKeyMethod, jwtMethod } from "../middleware/auth";
import { listVideosPage, getVideoDetail } from "../repositories/video-repository";
import { parseLimitOffset, limitOffsetPage } from "../utils/pagination";
import type { AppEnv } from "../types/bindings";

/**
 * 移行済みの動画系ルート（VideoListView と契約互換）。
 *   GET /api/videos/  ── 現在ユーザーの動画一覧（q/status/ordering/tags + limit/offset）
 *
 * `file` は R2 presigned GET URL（youtube 等は null）。認証は [APIKey, CookieJWT]。
 */
export const videoRoutes = new Hono<AppEnv>();

const videoAuth = requireAuth(apiKeyMethod, jwtMethod);

const listVideos = async (c: Context<AppEnv>) => {
  const userId = c.get("userId")!;
  const { limit, offset } = parseLimitOffset(c);

  const tagsParam = c.req.query("tags")?.trim();
  let tagIds: number[] | null = null;
  if (tagsParam) {
    const parsed = tagsParam
      .split(",")
      .filter(Boolean)
      .map((t) => Number(t));
    // Django は int 変換失敗時に tag_ids=None（フィルタ無効）。
    tagIds = parsed.every((n) => Number.isInteger(n)) ? parsed : null;
  }

  const { count, results } = await listVideosPage(
    c.env,
    userId,
    {
      keyword: c.req.query("q")?.trim() ?? "",
      statusFilter: c.req.query("status")?.trim() ?? "",
      sortKey: c.req.query("ordering")?.trim() ?? "",
      tagIds,
    },
    limit,
    offset,
  );
  return c.json(limitOffsetPage(c, count, limit, offset, results));
};

// フルパスで定義し app.route("/", videoRoutes) でマウントする（health と同じ形）。
// サブアプリの root "/" を prefix にマウントすると末尾スラッシュにマッチしないため。
videoRoutes.get("/api/videos", videoAuth, listVideos);
videoRoutes.get("/api/videos/", videoAuth, listVideos);

// 詳細（VideoDetailView）。<int:pk> と同じく数値 id のみ。groups 等はマッチせずプロキシへ。
const detail = async (c: Context<AppEnv>) => {
  const userId = c.get("userId")!;
  const videoId = Number(c.req.param("id"));
  const video = await getVideoDetail(c.env, videoId, userId);
  if (!video) {
    // Django create_error_response("Video not found", 404) と同形
    return c.json(
      { error: { code: "VALIDATION_ERROR", message: "Video not found" } },
      404,
    );
  }
  return c.json(video);
};

videoRoutes.get("/api/videos/:id{[0-9]+}", videoAuth, detail);
videoRoutes.get("/api/videos/:id{[0-9]+}/", videoAuth, detail);
