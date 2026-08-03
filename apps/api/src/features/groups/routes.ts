import {
  requireAuth,
  requireScope,
  apiKeyMethod,
  jwtMethod,
} from "../../middleware/auth";
import {
  createFeatureRouter,
  createRoute,
  errorResponse,
  jsonResponse,
  z,
} from "../../shared/openapi";
import {
  apiBadRequest,
  apiNotFound,
  ApiError,
} from "../../shared/errors";
import {
  createListResponseSchema,
  listResponse,
  paginationQuerySchema,
  parseLimitOffset,
} from "../../shared/pagination";
import {
  clientIp,
  enforceThrottles,
  throttledResponse,
} from "../../lib/rate-limit";
import {
  groupCreateSchema,
  groupDetailSchema,
  groupIdParamSchema,
  groupListItemSchema,
  groupPatchSchema,
  groupPutSchema,
  reorderGroupsSchema,
  shareLinkSchema,
} from "./schemas";
import * as groupService from "./service";

export const groupRoutes = createFeatureRouter();

const groupAuth = requireAuth(apiKeyMethod, jwtMethod);
const groupWriteGuards = [
  requireAuth(apiKeyMethod, jwtMethod),
  requireScope("write"),
] as const;

const listGroupsRoute = createRoute({
  method: "get",
  path: "/groups",
  tags: ["Groups"],
  summary: "List groups",
  middleware: [groupAuth] as const,
  request: { query: paginationQuerySchema },
  responses: {
    200: jsonResponse(createListResponseSchema(groupListItemSchema)),
    401: errorResponse("Unauthorized"),
  },
});

groupRoutes.openapi(listGroupsRoute, async (c) => {
  const userId = c.var.userId!;
  const { limit, offset } = parseLimitOffset(c);
  const { count, results } = await groupService.listGroups(
    c.env,
    userId,
    limit,
    offset,
  );
  return c.json(listResponse(results, { total: count, limit, offset }), 200);
});

const sharedGroupRoute = createRoute({
  method: "get",
  path: "/groups/share/{slug}",
  tags: ["Groups"],
  summary: "Get shared group by slug",
  request: {
    params: z.object({ slug: z.string().min(1) }),
  },
  responses: {
    200: jsonResponse(groupDetailSchema),
    404: errorResponse("Not found"),
  },
});

groupRoutes.openapi(sharedGroupRoute, async (c) => {
  const { slug } = c.req.valid("param");
  const denied = await enforceThrottles(c.env, [
    { scope: "chat_share_token_ip", ident: slug ? clientIp(c) : null },
  ]);
  if (denied) return throttledResponse(c, denied);
  const group = await groupService.getSharedGroup(c.env, slug);
  if (!group) throw apiNotFound("Share link not found");
  return c.json(group, 200);
});

const getGroupRoute = createRoute({
  method: "get",
  path: "/groups/{id}",
  tags: ["Groups"],
  summary: "Get group detail",
  middleware: [groupAuth] as const,
  request: { params: groupIdParamSchema },
  responses: {
    200: jsonResponse(groupDetailSchema),
    404: errorResponse("Not found"),
  },
});

groupRoutes.openapi(getGroupRoute, async (c) => {
  const userId = c.var.userId!;
  const { id } = c.req.valid("param");
  const group = await groupService.getGroup(c.env, id, userId);
  if (!group) throw apiNotFound("Group not found");
  return c.json(group, 200);
});

const createGroupRoute = createRoute({
  method: "post",
  path: "/groups",
  tags: ["Groups"],
  summary: "Create group",
  middleware: [...groupWriteGuards] as const,
  request: {
    body: {
      content: { "application/json": { schema: groupCreateSchema } },
      required: true,
    },
  },
  responses: {
    201: jsonResponse(groupDetailSchema),
    400: errorResponse("Validation error"),
  },
});

groupRoutes.openapi(createGroupRoute, async (c) => {
  const userId = c.var.userId!;
  const body = c.req.valid("json");
  const group = await groupService.createUserGroup(
    c.env,
    userId,
    body.name,
    body.description ?? "",
  );
  return c.json(group, 201);
});

const patchGroupRoute = createRoute({
  method: "patch",
  path: "/groups/{id}",
  tags: ["Groups"],
  summary: "Partial update group",
  middleware: [...groupWriteGuards] as const,
  request: {
    params: groupIdParamSchema,
    body: {
      content: { "application/json": { schema: groupPatchSchema } },
      required: true,
    },
  },
  responses: {
    200: jsonResponse(groupDetailSchema),
    404: errorResponse("Not found"),
  },
});

groupRoutes.openapi(patchGroupRoute, async (c) => {
  const userId = c.var.userId!;
  const { id } = c.req.valid("param");
  const body = c.req.valid("json");
  const result = await groupService.updateUserGroup(c.env, id, userId, body);
  if ("notFound" in result) throw apiNotFound("Group not found");
  return c.json(result.group, 200);
});

const putGroupRoute = createRoute({
  method: "put",
  path: "/groups/{id}",
  tags: ["Groups"],
  summary: "Replace group",
  middleware: [...groupWriteGuards] as const,
  request: {
    params: groupIdParamSchema,
    body: {
      content: { "application/json": { schema: groupPutSchema } },
      required: true,
    },
  },
  responses: {
    200: jsonResponse(groupDetailSchema),
    404: errorResponse("Not found"),
  },
});

groupRoutes.openapi(putGroupRoute, async (c) => {
  const userId = c.var.userId!;
  const { id } = c.req.valid("param");
  const body = c.req.valid("json");
  const result = await groupService.updateUserGroup(c.env, id, userId, {
    name: body.name,
    description: body.description ?? "",
  });
  if ("notFound" in result) throw apiNotFound("Group not found");
  return c.json(result.group, 200);
});

const deleteGroupRoute = createRoute({
  method: "delete",
  path: "/groups/{id}",
  tags: ["Groups"],
  summary: "Delete group",
  middleware: [...groupWriteGuards] as const,
  request: { params: groupIdParamSchema },
  responses: {
    204: { description: "Deleted" },
    404: errorResponse("Not found"),
  },
});

groupRoutes.openapi(deleteGroupRoute, async (c) => {
  const userId = c.var.userId!;
  const { id } = c.req.valid("param");
  const res = await groupService.removeGroup(c.env, id, userId);
  if ("notFound" in res) throw apiNotFound("Group not found");
  return c.body(null, 204);
});

const reorderRoute = createRoute({
  method: "patch",
  path: "/groups/order",
  tags: ["Groups"],
  summary: "Reorder groups",
  middleware: [...groupWriteGuards] as const,
  request: {
    body: {
      content: { "application/json": { schema: reorderGroupsSchema } },
      required: true,
    },
  },
  responses: {
    200: jsonResponse(z.object({ message: z.string() })),
    400: errorResponse("Bad request"),
  },
});

groupRoutes.openapi(reorderRoute, async (c) => {
  const userId = c.var.userId!;
  const { group_ids } = c.req.valid("json");
  const res = await groupService.reorderUserGroups(c.env, userId, group_ids);
  if ("mismatch" in res) {
    throw apiBadRequest("Specified group IDs do not match user groups");
  }
  return c.json({ message: "Group order updated" }, 200);
});

const createShareRoute = createRoute({
  method: "post",
  path: "/groups/{id}/share",
  tags: ["Groups"],
  summary: "Create or update share link",
  middleware: [...groupWriteGuards] as const,
  request: {
    params: groupIdParamSchema,
    body: {
      content: { "application/json": { schema: shareLinkSchema } },
      required: true,
    },
  },
  responses: {
    201: jsonResponse(
      z.object({ message: z.string(), share_slug: z.string() }),
    ),
    404: errorResponse("Not found"),
    409: errorResponse("Conflict"),
  },
});

groupRoutes.openapi(createShareRoute, async (c) => {
  const userId = c.var.userId!;
  const { id } = c.req.valid("param");
  const { share_slug } = c.req.valid("json");
  const result = await groupService.saveShareLink(c.env, id, userId, share_slug);
  if ("notFound" in result) throw apiNotFound("Group not found");
  if ("error" in result) throw apiBadRequest(result.error ?? "Bad request");
  if ("conflict" in result) {
    throw new ApiError(409, "CONFLICT", result.conflict ?? "Conflict");
  }
  return c.json({ message: "Share link saved", share_slug: result.share_slug }, 201);
});

const deleteShareRoute = createRoute({
  method: "delete",
  path: "/groups/{id}/share",
  tags: ["Groups"],
  summary: "Remove share link",
  middleware: [...groupWriteGuards] as const,
  request: { params: groupIdParamSchema },
  responses: {
    204: { description: "Deleted" },
    404: errorResponse("Not found"),
  },
});

groupRoutes.openapi(deleteShareRoute, async (c) => {
  const userId = c.var.userId!;
  const { id } = c.req.valid("param");
  const result = await groupService.clearShareLink(c.env, id, userId);
  if ("notFound" in result) throw apiNotFound("Group not found");
  if ("notConfigured" in result) throw apiNotFound("Share link is not configured");
  return c.body(null, 204);
});
