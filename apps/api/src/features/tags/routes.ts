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
} from "../../shared/openapi";
import { apiNotFound, apiBadRequest } from "../../shared/errors";
import {
  createListResponseSchema,
  listResponse,
  paginationQuerySchema,
  parseLimitOffset,
} from "../../shared/pagination";
import {
  tagCreateSchema,
  tagDetailSchema,
  tagIdParamSchema,
  tagPatchSchema,
  tagPutSchema,
  tagSchema,
} from "./schemas";
import * as tagService from "./service";

export const tagRoutes = createFeatureRouter();

const tagAuth = requireAuth(apiKeyMethod, jwtMethod);
const tagWriteGuards = [
  requireAuth(apiKeyMethod, jwtMethod),
  requireScope("write"),
] as const;

const listTagsRoute = createRoute({
  method: "get",
  path: "/tags",
  tags: ["Tags"],
  summary: "List tags",
  middleware: [tagAuth] as const,
  request: { query: paginationQuerySchema },
  responses: {
    200: jsonResponse(createListResponseSchema(tagSchema)),
    401: errorResponse("Unauthorized"),
  },
});

tagRoutes.openapi(listTagsRoute, async (c) => {
  const userId = c.var.userId!;
  const { limit, offset } = parseLimitOffset(c);
  const { count, results } = await tagService.listTags(c.env, userId, limit, offset);
  return c.json(listResponse(results, { total: count, limit, offset }), 200);
});

const getTagRoute = createRoute({
  method: "get",
  path: "/tags/{id}",
  tags: ["Tags"],
  summary: "Get tag detail",
  middleware: [tagAuth] as const,
  request: { params: tagIdParamSchema },
  responses: {
    200: jsonResponse(tagDetailSchema),
    401: errorResponse("Unauthorized"),
    404: errorResponse("Not found"),
  },
});

tagRoutes.openapi(getTagRoute, async (c) => {
  const userId = c.var.userId!;
  const { id } = c.req.valid("param");
  const tag = await tagService.getTag(c.env, id, userId);
  if (!tag) throw apiNotFound("Tag not found");
  return c.json(tag, 200);
});

const createTagRoute = createRoute({
  method: "post",
  path: "/tags",
  tags: ["Tags"],
  summary: "Create tag",
  middleware: [...tagWriteGuards] as const,
  request: {
    body: { content: { "application/json": { schema: tagCreateSchema } }, required: true },
  },
  responses: {
    201: jsonResponse(tagSchema),
    400: errorResponse("Validation error"),
    401: errorResponse("Unauthorized"),
  },
});

tagRoutes.openapi(createTagRoute, async (c) => {
  const userId = c.var.userId!;
  const body = c.req.valid("json");
  const result = await tagService.createUserTag(c.env, userId, body.name, body.color);
  if ("error" in result) throw apiBadRequest(result.error ?? "Bad request");
  return c.json(result.tag, 201);
});

const patchTagRoute = createRoute({
  method: "patch",
  path: "/tags/{id}",
  tags: ["Tags"],
  summary: "Partial update tag",
  middleware: [...tagWriteGuards] as const,
  request: {
    params: tagIdParamSchema,
    body: { content: { "application/json": { schema: tagPatchSchema } }, required: true },
  },
  responses: {
    200: jsonResponse(tagDetailSchema),
    400: errorResponse("Validation error"),
    404: errorResponse("Not found"),
  },
});

tagRoutes.openapi(patchTagRoute, async (c) => {
  const userId = c.var.userId!;
  const { id } = c.req.valid("param");
  const body = c.req.valid("json");
  const result = await tagService.updateUserTag(c.env, id, userId, body);
  if ("notFound" in result) throw apiNotFound("Tag not found");
  if ("error" in result) throw apiBadRequest(result.error ?? "Bad request");
  return c.json(result.tag, 200);
});

const putTagRoute = createRoute({
  method: "put",
  path: "/tags/{id}",
  tags: ["Tags"],
  summary: "Replace tag",
  middleware: [...tagWriteGuards] as const,
  request: {
    params: tagIdParamSchema,
    body: { content: { "application/json": { schema: tagPutSchema } }, required: true },
  },
  responses: {
    200: jsonResponse(tagDetailSchema),
    400: errorResponse("Validation error"),
    404: errorResponse("Not found"),
  },
});

tagRoutes.openapi(putTagRoute, async (c) => {
  const userId = c.var.userId!;
  const { id } = c.req.valid("param");
  const body = c.req.valid("json");
  const result = await tagService.updateUserTag(c.env, id, userId, body);
  if ("notFound" in result) throw apiNotFound("Tag not found");
  if ("error" in result) throw apiBadRequest(result.error ?? "Bad request");
  return c.json(result.tag, 200);
});

const deleteTagRoute = createRoute({
  method: "delete",
  path: "/tags/{id}",
  tags: ["Tags"],
  summary: "Delete tag",
  middleware: [...tagWriteGuards] as const,
  request: { params: tagIdParamSchema },
  responses: {
    204: { description: "Deleted" },
    404: errorResponse("Not found"),
  },
});

tagRoutes.openapi(deleteTagRoute, async (c) => {
  const userId = c.var.userId!;
  const { id } = c.req.valid("param");
  const res = await tagService.removeTag(c.env, id, userId);
  if ("notFound" in res) throw apiNotFound("Tag not found");
  return c.body(null, 204);
});
