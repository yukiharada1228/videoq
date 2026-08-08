import { requireAuth, apiKeyMethod, sessionMethod } from "../../middleware/auth";
import {
  createFeatureRouter,
  createRoute,
  errorResponse,
  jsonResponse,
} from "../../shared/openapi";
import { apiNotFound } from "../../shared/errors";
import {
  createListResponseSchema,
  listResponse,
  parseLimitOffset,
} from "../../shared/pagination";
import {
  evaluationGroupParamSchema,
  evaluationLogSchema,
  evaluationLogsQuerySchema,
  evaluationSummarySchema,
} from "./schemas";
import * as evaluationService from "./service";

/**
 * 評価（RAGAS）参照系。計算自体は Lambda 側。
 * 未所有/不在は 404 "Group not found"。
 */
export const evaluationRoutes = createFeatureRouter();

const evalAuth = requireAuth(apiKeyMethod, sessionMethod);

const summaryRoute = createRoute({
  method: "get",
  path: "/groups/{groupId}/summary",
  tags: ["Evaluation"],
  summary: "Group evaluation summary",
  middleware: [evalAuth] as const,
  request: { params: evaluationGroupParamSchema },
  responses: {
    200: jsonResponse(evaluationSummarySchema),
    401: errorResponse("Unauthorized"),
    404: errorResponse("Not found"),
  },
});

evaluationRoutes.openapi(summaryRoute, async (c) => {
  const { groupId } = c.req.valid("param");
  const res = await evaluationService.summaryForGroup(
    c.env,
    groupId,
    c.var.userId!,
  );
  if ("notFound" in res) throw apiNotFound("Group not found");
  return c.json(res, 200);
});

const logsRoute = createRoute({
  method: "get",
  path: "/groups/{groupId}/logs",
  tags: ["Evaluation"],
  summary: "Group evaluation logs",
  middleware: [evalAuth] as const,
  request: {
    params: evaluationGroupParamSchema,
    query: evaluationLogsQuerySchema,
  },
  responses: {
    200: jsonResponse(createListResponseSchema(evaluationLogSchema)),
    401: errorResponse("Unauthorized"),
    404: errorResponse("Not found"),
  },
});

evaluationRoutes.openapi(logsRoute, async (c) => {
  const { groupId } = c.req.valid("param");
  const { limit, offset } = parseLimitOffset(c);
  const res = await evaluationService.logsForGroup(
    c.env,
    groupId,
    c.var.userId!,
    limit,
    offset,
  );
  if ("notFound" in res) throw apiNotFound("Group not found");
  return c.json(
    listResponse(res.results, { total: res.count, limit, offset }),
    200,
  );
});
