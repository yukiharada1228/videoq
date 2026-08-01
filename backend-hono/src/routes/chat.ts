import { Hono } from "hono";
import type { Context } from "hono";
import { requireAuth, apiKeyMethod, jwtMethod } from "../middleware/auth";
import { getGroupChatHistory } from "../repositories/chat-repository";
import { proxyToLegacy } from "./proxy";
import { parseLimitOffset, limitOffsetPage } from "../utils/pagination";
import type { AppEnv } from "../types/bindings";

/**
 * 移行済みのチャット系ルート。
 *   GET /api/chat/groups/<group_id>/history/ ── グループのチャット履歴（所有者のみ）
 *
 * `?download=csv` は CSV 出力（Django に委譲＝プロキシ）。DELETE 等は未定義でプロキシへ。
 * 認証は ChatGroupHistoryView と同じ [APIKey, CookieJWT]。
 */
export const chatRoutes = new Hono<AppEnv>();

const chatAuth = requireAuth(apiKeyMethod, jwtMethod);

const history = async (c: Context<AppEnv>) => {
  // CSV ダウンロードは当面 Django に委譲（write/export は後続）
  if (c.req.query("download") === "csv") return proxyToLegacy(c);

  const userId = c.get("userId")!;
  const groupId = Number(c.req.param("groupId"));
  const { limit, offset } = parseLimitOffset(c);

  const res = await getGroupChatHistory(c.env, groupId, userId, limit, offset);
  if ("notFound" in res) {
    return c.json(
      { error: { code: "VALIDATION_ERROR", message: "Group not found." } },
      404,
    );
  }
  return c.json(limitOffsetPage(c, res.count, limit, offset, res.results));
};

chatRoutes.get("/api/chat/groups/:groupId{[0-9]+}/history", chatAuth, history);
chatRoutes.get("/api/chat/groups/:groupId{[0-9]+}/history/", chatAuth, history);
