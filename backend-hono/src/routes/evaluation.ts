import { Hono } from "hono";
import type { Context } from "hono";
import { requireAuth, apiKeyMethod, jwtMethod } from "../middleware/auth";
import {
  getEvaluationSummary,
  listEvaluationLogs,
} from "../repositories/evaluation-repository";
import { parseLimitOffset, limitOffsetPage } from "../utils/pagination";
import type { AppEnv } from "../types/bindings";

/**
 * 移行済みの評価（RAGAS）参照系ルート。評価の計算自体は Lambda（ragas）に残る。
 *   GET /api/evaluation/groups/<group_id>/summary/ ── 集計スコア
 *   GET /api/evaluation/groups/<group_id>/logs/     ── per-ChatLog 評価一覧
 *
 * 認証は [APIKey, CookieJWT]。未所有/不在は 404 "Group not found"（ピリオド無, view 固定）。
 */
export const evaluationRoutes = new Hono<AppEnv>();

const evalAuth = requireAuth(apiKeyMethod, jwtMethod);

const notFound = (c: Context<AppEnv>) =>
  c.json(
    { error: { code: "VALIDATION_ERROR", message: "Group not found" } },
    404,
  );

const summary = async (c: Context<AppEnv>) => {
  const res = await getEvaluationSummary(
    c.env,
    Number(c.req.param("groupId")),
    c.get("userId")!,
  );
  if ("notFound" in res) return notFound(c);
  return c.json(res);
};

const logs = async (c: Context<AppEnv>) => {
  const { limit, offset } = parseLimitOffset(c);
  const res = await listEvaluationLogs(
    c.env,
    Number(c.req.param("groupId")),
    c.get("userId")!,
    limit,
    offset,
  );
  if ("notFound" in res) return notFound(c);
  return c.json(limitOffsetPage(c, res.count, limit, offset, res.results));
};

evaluationRoutes.get("/api/evaluation/groups/:groupId{[0-9]+}/summary", evalAuth, summary);
evaluationRoutes.get("/api/evaluation/groups/:groupId{[0-9]+}/summary/", evalAuth, summary);
evaluationRoutes.get("/api/evaluation/groups/:groupId{[0-9]+}/logs", evalAuth, logs);
evaluationRoutes.get("/api/evaluation/groups/:groupId{[0-9]+}/logs/", evalAuth, logs);
