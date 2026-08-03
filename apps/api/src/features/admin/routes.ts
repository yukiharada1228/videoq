import { createMiddleware } from "hono/factory";
import { requireAuth, jwtMethod, apiKeyMethod } from "../../middleware/auth";
import {
  createFeatureRouter,
  createRoute,
  errorResponse,
  jsonResponse,
} from "../../shared/openapi";
import {
  apiBadRequest,
  apiForbidden,
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
  adminFlagsPatchSchema,
  adminJobResponseSchema,
  adminQuotaPatchSchema,
  adminUsagePatchSchema,
  adminUserIdParamSchema,
  adminUserListQuerySchema,
  adminUserSchema,
} from "./schemas";
import * as adminService from "./service";
import type { AppEnv } from "../../types/bindings";

/** superuser 専用の VideoQ 管理 API。 */
export const adminRoutes = createFeatureRouter();

const requireSuperuser = createMiddleware<AppEnv>(async (c, next) => {
  const userId = c.get("userId");
  if (userId == null) {
    return c.json(
      toErrorBody("UNAUTHORIZED", "Authentication credentials were not provided."),
      401,
    );
  }
  if (!(await adminService.isSuperuser(c.env, userId))) {
    return c.json(
      toErrorBody("FORBIDDEN", "You do not have permission to perform this action."),
      403,
    );
  }
  await next();
});

const adminGuards = [
  requireAuth(apiKeyMethod, jwtMethod),
  requireSuperuser,
] as const;

const listUsersRoute = createRoute({
  method: "get",
  path: "/api/admin/users",
  tags: ["Admin"],
  summary: "List users (superuser)",
  middleware: [...adminGuards] as const,
  request: { query: adminUserListQuerySchema },
  responses: {
    200: jsonResponse(createListResponseSchema(adminUserSchema)),
    401: errorResponse("Unauthorized"),
    403: errorResponse("Forbidden"),
  },
});

adminRoutes.openapi(listUsersRoute, async (c) => {
  const query = c.req.valid("query");
  const { limit, offset } = parseLimitOffset(c);
  const { count, results } = await adminService.listUsers(
    c.env,
    query.q?.trim() ?? "",
    limit,
    offset,
  );
  return c.json(listResponse(results, { total: count, limit, offset }), 200);
});

const getUserRoute = createRoute({
  method: "get",
  path: "/api/admin/users/{id}",
  tags: ["Admin"],
  summary: "Get user (superuser)",
  middleware: [...adminGuards] as const,
  request: { params: adminUserIdParamSchema },
  responses: {
    200: jsonResponse(adminUserSchema),
    404: errorResponse("Not found"),
  },
});

adminRoutes.openapi(getUserRoute, async (c) => {
  const { id } = c.req.valid("param");
  const user = await adminService.getUser(c.env, id);
  if (!user) throw apiNotFound("User not found");
  return c.json(user, 200);
});

const patchQuotaRoute = createRoute({
  method: "patch",
  path: "/api/admin/users/{id}/quota",
  tags: ["Admin"],
  summary: "Patch user quota",
  middleware: [...adminGuards] as const,
  request: {
    params: adminUserIdParamSchema,
    body: {
      content: { "application/json": { schema: adminQuotaPatchSchema } },
      required: true,
    },
  },
  responses: {
    200: jsonResponse(adminUserSchema),
    404: errorResponse("Not found"),
  },
});

adminRoutes.openapi(patchQuotaRoute, async (c) => {
  const { id } = c.req.valid("param");
  const body = c.req.valid("json");
  const user = await adminService.patchQuota(c.env, id, body);
  if (!user) throw apiNotFound("User not found");
  return c.json(user, 200);
});

const patchUsageRoute = createRoute({
  method: "patch",
  path: "/api/admin/users/{id}/usage",
  tags: ["Admin"],
  summary: "Patch user usage counters",
  middleware: [...adminGuards] as const,
  request: {
    params: adminUserIdParamSchema,
    body: {
      content: { "application/json": { schema: adminUsagePatchSchema } },
      required: true,
    },
  },
  responses: {
    200: jsonResponse(adminUserSchema),
    404: errorResponse("Not found"),
  },
});

adminRoutes.openapi(patchUsageRoute, async (c) => {
  const { id } = c.req.valid("param");
  const body = c.req.valid("json");
  const user = await adminService.patchUsage(c.env, id, body);
  if (!user) throw apiNotFound("User not found");
  return c.json(user, 200);
});

const patchFlagsRoute = createRoute({
  method: "patch",
  path: "/api/admin/users/{id}/flags",
  tags: ["Admin"],
  summary: "Patch user flags",
  middleware: [...adminGuards] as const,
  request: {
    params: adminUserIdParamSchema,
    body: {
      content: { "application/json": { schema: adminFlagsPatchSchema } },
      required: true,
    },
  },
  responses: {
    200: jsonResponse(adminUserSchema),
    400: errorResponse("Bad request"),
    404: errorResponse("Not found"),
  },
});

adminRoutes.openapi(patchFlagsRoute, async (c) => {
  const { id } = c.req.valid("param");
  const body = c.req.valid("json");
  const res = await adminService.patchFlags(c.env, c.get("userId")!, id, body);
  if ("notFound" in res) throw apiNotFound("User not found");
  if ("selfLockout" in res) {
    throw apiBadRequest(
      "Cannot deactivate yourself or remove your own superuser flag.",
      "CANNOT_LOCKOUT_SELF",
    );
  }
  return c.json(res.user, 200);
});

const deleteUserRoute = createRoute({
  method: "delete",
  path: "/api/admin/users/{id}",
  tags: ["Admin"],
  summary: "Hard-delete user (superuser)",
  middleware: [...adminGuards] as const,
  request: {
    params: adminUserIdParamSchema,
  },
  responses: {
    202: jsonResponse(adminJobResponseSchema, "Accepted"),
    400: errorResponse("Bad request"),
    403: errorResponse("Forbidden"),
    404: errorResponse("Not found"),
    503: errorResponse("Unavailable"),
  },
});

adminRoutes.openapi(deleteUserRoute, async (c) => {
  const { id } = c.req.valid("param");
  const res = await adminService.deleteUser(c.env, c.get("userId")!, id);
  if ("self" in res) {
    throw apiBadRequest("Cannot delete your own account via Admin.", "CANNOT_DELETE_SELF");
  }
  if ("notFound" in res) throw apiNotFound("User not found");
  if ("forbiddenSuperuser" in res) {
    throw apiForbidden("Cannot delete another superuser.", "CANNOT_DELETE_SUPERUSER");
  }
  if ("unavailable" in res) {
    throw apiServiceUnavailable(
      "Failed to enqueue user deletion job (SQS not configured).",
    );
  }
  return c.json({ job_id: res.job_id }, 202);
});

const reindexRoute = createRoute({
  method: "post",
  path: "/api/admin/embeddings/reindex-all",
  tags: ["Admin"],
  summary: "Enqueue full embedding reindex",
  middleware: [...adminGuards] as const,
  responses: {
    202: jsonResponse(adminJobResponseSchema, "Accepted"),
    503: errorResponse("Unavailable"),
  },
});

adminRoutes.openapi(reindexRoute, async (c) => {
  const res = await adminService.enqueueReindexAll(c.env);
  if ("unavailable" in res) {
    throw apiServiceUnavailable(
      "Failed to enqueue reindex job (SQS not configured).",
    );
  }
  return c.json({ job_id: res.job_id }, 202);
});
