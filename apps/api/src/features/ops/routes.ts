import { createMiddleware } from "hono/factory";
import { requireAuth, jwtMethod, apiKeyMethod } from "../../middleware/auth";
import {
  createFeatureRouter,
  createRoute,
  errorResponse,
  jsonResponse,
} from "../../shared/openapi";
import {
  apiNotFound,
  apiServiceUnavailable,
  toErrorBody,
} from "../../shared/errors";
import {
  createListResponseSchema,
  listResponse,
  parseLimitOffset,
} from "../../shared/pagination";
import {
  opsQuotaPatchSchema,
  opsUsagePatchSchema,
  opsUserIdParamSchema,
  opsUserListQuerySchema,
  opsUserSchema,
  reindexResponseSchema,
} from "./schemas";
import * as opsService from "./service";
import type { AppEnv } from "../../types/bindings";

/** superuser 専用の VideoQ 運用 API。 */
export const opsRoutes = createFeatureRouter();

const requireSuperuser = createMiddleware<AppEnv>(async (c, next) => {
  const userId = c.get("userId");
  if (userId == null) {
    return c.json(
      toErrorBody("UNAUTHORIZED", "Authentication credentials were not provided."),
      401,
    );
  }
  if (!(await opsService.isSuperuser(c.env, userId))) {
    return c.json(
      toErrorBody("FORBIDDEN", "You do not have permission to perform this action."),
      403,
    );
  }
  await next();
});

const opsGuards = [
  requireAuth(apiKeyMethod, jwtMethod),
  requireSuperuser,
] as const;

const listUsersRoute = createRoute({
  method: "get",
  path: "/api/ops/users",
  tags: ["Ops"],
  summary: "List users (superuser)",
  middleware: [...opsGuards] as const,
  request: { query: opsUserListQuerySchema },
  responses: {
    200: jsonResponse(createListResponseSchema(opsUserSchema)),
    401: errorResponse("Unauthorized"),
    403: errorResponse("Forbidden"),
  },
});

opsRoutes.openapi(listUsersRoute, async (c) => {
  const query = c.req.valid("query");
  const { limit, offset } = parseLimitOffset(c);
  const { count, results } = await opsService.listUsers(
    c.env,
    query.q?.trim() ?? "",
    limit,
    offset,
  );
  return c.json(listResponse(results, { total: count, limit, offset }), 200);
});

const getUserRoute = createRoute({
  method: "get",
  path: "/api/ops/users/{id}",
  tags: ["Ops"],
  summary: "Get user (superuser)",
  middleware: [...opsGuards] as const,
  request: { params: opsUserIdParamSchema },
  responses: {
    200: jsonResponse(opsUserSchema),
    404: errorResponse("Not found"),
  },
});

opsRoutes.openapi(getUserRoute, async (c) => {
  const { id } = c.req.valid("param");
  const user = await opsService.getUser(c.env, id);
  if (!user) throw apiNotFound("User not found");
  return c.json(user, 200);
});

const patchQuotaRoute = createRoute({
  method: "patch",
  path: "/api/ops/users/{id}/quota",
  tags: ["Ops"],
  summary: "Patch user quota",
  middleware: [...opsGuards] as const,
  request: {
    params: opsUserIdParamSchema,
    body: {
      content: { "application/json": { schema: opsQuotaPatchSchema } },
      required: true,
    },
  },
  responses: {
    200: jsonResponse(opsUserSchema),
    404: errorResponse("Not found"),
  },
});

opsRoutes.openapi(patchQuotaRoute, async (c) => {
  const { id } = c.req.valid("param");
  const body = c.req.valid("json");
  const user = await opsService.patchQuota(c.env, id, body);
  if (!user) throw apiNotFound("User not found");
  return c.json(user, 200);
});

const patchUsageRoute = createRoute({
  method: "patch",
  path: "/api/ops/users/{id}/usage",
  tags: ["Ops"],
  summary: "Patch user usage counters",
  middleware: [...opsGuards] as const,
  request: {
    params: opsUserIdParamSchema,
    body: {
      content: { "application/json": { schema: opsUsagePatchSchema } },
      required: true,
    },
  },
  responses: {
    200: jsonResponse(opsUserSchema),
    404: errorResponse("Not found"),
  },
});

opsRoutes.openapi(patchUsageRoute, async (c) => {
  const { id } = c.req.valid("param");
  const body = c.req.valid("json");
  const user = await opsService.patchUsage(c.env, id, body);
  if (!user) throw apiNotFound("User not found");
  return c.json(user, 200);
});

const reindexRoute = createRoute({
  method: "post",
  path: "/api/ops/embeddings/reindex-all",
  tags: ["Ops"],
  summary: "Enqueue full embedding reindex",
  middleware: [...opsGuards] as const,
  responses: {
    202: jsonResponse(reindexResponseSchema, "Accepted"),
    503: errorResponse("Unavailable"),
  },
});

opsRoutes.openapi(reindexRoute, async (c) => {
  const res = await opsService.enqueueReindexAll(c.env);
  if ("unavailable" in res) {
    throw apiServiceUnavailable(
      "Failed to enqueue reindex job (SQS not configured).",
    );
  }
  return c.json({ job_id: res.job_id }, 202);
});
