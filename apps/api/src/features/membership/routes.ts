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
import { apiBadRequest, apiNotFound } from "../../shared/errors";
import {
  groupIdParamSchema,
  groupVideoParamsSchema,
  membershipMutationSchema,
  reorderVideosBodySchema,
  tagIdsBodySchema,
  videoIdParamSchema,
  videoIdsBodySchema,
  videoTagParamsSchema,
} from "./schemas";
import * as membershipService from "./service";

export const membershipRoutes = createFeatureRouter();

const writeGuards = [
  requireAuth(apiKeyMethod, jwtMethod),
  requireScope("write"),
] as const;

const addTagsRoute = createRoute({
  method: "post",
  path: "/api/videos/{videoId}/tags",
  tags: ["Membership"],
  summary: "Attach tags to a video",
  middleware: [...writeGuards] as const,
  request: {
    params: videoIdParamSchema,
    body: {
      content: { "application/json": { schema: tagIdsBodySchema } },
      required: true,
    },
  },
  responses: {
    201: jsonResponse(membershipMutationSchema, "Created"),
    400: errorResponse("Bad request"),
    404: errorResponse("Not found"),
  },
});

membershipRoutes.openapi(addTagsRoute, async (c) => {
  const userId = c.get("userId")!;
  const { videoId } = c.req.valid("param");
  const { tag_ids } = c.req.valid("json");
  const res = await membershipService.addTagsToVideo(
    c.env,
    userId,
    videoId,
    tag_ids,
  );
  if ("notFound" in res) throw apiNotFound(res.notFound);
  return c.json(
    {
      message: res.message,
      added_count: res.added_count,
      skipped_count: res.skipped_count,
    },
    201,
  );
});

const removeTagRoute = createRoute({
  method: "delete",
  path: "/api/videos/{videoId}/tags/{tagId}",
  tags: ["Membership"],
  summary: "Detach a tag from a video",
  middleware: [...writeGuards] as const,
  request: { params: videoTagParamsSchema },
  responses: {
    200: jsonResponse(z.object({ message: z.string() })),
    404: errorResponse("Not found"),
  },
});

membershipRoutes.openapi(removeTagRoute, async (c) => {
  const userId = c.get("userId")!;
  const { videoId, tagId } = c.req.valid("param");
  const res = await membershipService.removeTagFromVideo(
    c.env,
    userId,
    videoId,
    tagId,
  );
  if ("notFound" in res) throw apiNotFound(res.notFound);
  return c.json({ message: res.message }, 200);
});

const reorderVideosRoute = createRoute({
  method: "patch",
  path: "/api/videos/groups/{groupId}/videos/order",
  tags: ["Membership"],
  summary: "Reorder videos in a group",
  middleware: [...writeGuards] as const,
  request: {
    params: groupIdParamSchema,
    body: {
      content: { "application/json": { schema: reorderVideosBodySchema } },
      required: true,
    },
  },
  responses: {
    200: jsonResponse(z.object({ message: z.string() })),
    400: errorResponse("Bad request"),
    404: errorResponse("Not found"),
  },
});

membershipRoutes.openapi(reorderVideosRoute, async (c) => {
  const userId = c.get("userId")!;
  const { groupId } = c.req.valid("param");
  const { video_ids } = c.req.valid("json");
  const res = await membershipService.reorderGroupVideos(
    c.env,
    userId,
    groupId,
    video_ids,
  );
  if ("notFound" in res) throw apiNotFound(res.notFound ?? "Not found");
  if ("badRequest" in res) throw apiBadRequest(res.badRequest ?? "Bad request");
  return c.json({ message: res.message }, 200);
});

const addVideosBulkRoute = createRoute({
  method: "post",
  path: "/api/videos/groups/{groupId}/videos",
  tags: ["Membership"],
  summary: "Add videos to a group (bulk)",
  middleware: [...writeGuards] as const,
  request: {
    params: groupIdParamSchema,
    body: {
      content: { "application/json": { schema: videoIdsBodySchema } },
      required: true,
    },
  },
  responses: {
    201: jsonResponse(membershipMutationSchema, "Created"),
    400: errorResponse("Bad request"),
    404: errorResponse("Not found"),
  },
});

membershipRoutes.openapi(addVideosBulkRoute, async (c) => {
  const userId = c.get("userId")!;
  const { groupId } = c.req.valid("param");
  const { video_ids } = c.req.valid("json");
  const res = await membershipService.addVideosToGroupBulk(
    c.env,
    userId,
    groupId,
    video_ids,
  );
  if ("notFound" in res) throw apiNotFound(res.notFound);
  return c.json(
    {
      message: res.message,
      added_count: res.added_count,
      skipped_count: res.skipped_count,
    },
    201,
  );
});

const addVideoRoute = createRoute({
  method: "post",
  path: "/api/videos/groups/{groupId}/videos/{videoId}",
  tags: ["Membership"],
  summary: "Add a single video to a group",
  middleware: [...writeGuards] as const,
  request: { params: groupVideoParamsSchema },
  responses: {
    201: jsonResponse(membershipMutationSchema, "Created"),
    400: errorResponse("Bad request"),
    404: errorResponse("Not found"),
  },
});

membershipRoutes.openapi(addVideoRoute, async (c) => {
  const userId = c.get("userId")!;
  const { groupId, videoId } = c.req.valid("param");
  const res = await membershipService.addVideoToGroupOne(
    c.env,
    userId,
    groupId,
    videoId,
  );
  if ("notFound" in res) throw apiNotFound(res.notFound ?? "Not found");
  if ("badRequest" in res) throw apiBadRequest(res.badRequest ?? "Bad request");
  return c.json({ message: res.message, id: res.id }, 201);
});

const removeVideoRoute = createRoute({
  method: "delete",
  path: "/api/videos/groups/{groupId}/videos/{videoId}",
  tags: ["Membership"],
  summary: "Remove a video from a group",
  middleware: [...writeGuards] as const,
  request: { params: groupVideoParamsSchema },
  responses: {
    204: { description: "Deleted" },
    404: errorResponse("Not found"),
  },
});

membershipRoutes.openapi(removeVideoRoute, async (c) => {
  const userId = c.get("userId")!;
  const { groupId, videoId } = c.req.valid("param");
  const res = await membershipService.removeVideoFromGroupOne(
    c.env,
    userId,
    groupId,
    videoId,
  );
  if ("notFound" in res) throw apiNotFound(res.notFound);
  return c.body(null, 204);
});
