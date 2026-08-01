import { Hono } from "hono";
import type { Context } from "hono";
import { requireAuth, apiKeyMethod, jwtMethod } from "../middleware/auth";
import { listGroupsPage } from "../repositories/group-repository";
import { parseLimitOffset, limitOffsetPage } from "../utils/pagination";
import type { AppEnv } from "../types/bindings";

/**
 * 移行済みのグループ系ルート（VideoGroupListView と契約互換）。
 *   GET /api/videos/groups/  ── 現在ユーザーのグループ一覧（limit/offset ページネーション）
 *
 * ※ 実 URL は `/api/videos/groups/`（video urls に include されているため）。
 *   認証は AuthenticatedViewMixin と同じ [APIKey, CookieJWT]。読み取りなので scope は no-op。
 */
export const groupRoutes = new Hono<AppEnv>();

const groupAuth = requireAuth(apiKeyMethod, jwtMethod);

const listGroups = async (c: Context<AppEnv>) => {
  const userId = c.get("userId")!;
  const { limit, offset } = parseLimitOffset(c);
  const { count, results } = await listGroupsPage(c.env, userId, limit, offset);
  return c.json(limitOffsetPage(c, count, limit, offset, results));
};

groupRoutes.get("/api/videos/groups", groupAuth, listGroups);
groupRoutes.get("/api/videos/groups/", groupAuth, listGroups);
