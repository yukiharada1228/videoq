import {
  requireAuth,
  requireScope,
  apiKeyMethod,
  sessionMethod,
} from "../../middleware/auth";
import {
  createFeatureRouter,
  createRoute,
  errorResponse,
  jsonResponse,
} from "../../shared/openapi";
import {
  apiBadRequest,
  apiNotFound,
  validationError,
} from "../../shared/errors";
import {
  createListResponseSchema,
  listResponse,
  parseLimitOffset,
} from "../../shared/pagination";
import {
  uploadRequestSchema,
  uploadResponseSchema,
  videoDetailSchema,
  videoIdParamSchema,
  videoListItemSchema,
  videoListQuerySchema,
  videoMultipartSchema,
  videoStatsSchema,
  videoPatchSchema,
  videoPutSchema,
  youtubeCreateSchema,
} from "./schemas";
import * as videoService from "./service";

export const videoRoutes = createFeatureRouter();

const videoAuth = requireAuth(apiKeyMethod, sessionMethod);
const videoWriteGuards = [
  requireAuth(apiKeyMethod, sessionMethod),
  requireScope("write"),
] as const;

const listVideosRoute = createRoute({
  method: "get",
  path: "/",
  tags: ["Videos"],
  summary: "List videos",
  middleware: [videoAuth] as const,
  request: { query: videoListQuerySchema },
  responses: {
    200: jsonResponse(createListResponseSchema(videoListItemSchema)),
    401: errorResponse("Unauthorized"),
  },
});

videoRoutes.openapi(listVideosRoute, async (c) => {
  const userId = c.var.userId!;
  const query = c.req.valid("query");
  const { limit, offset } = parseLimitOffset(c);
  const { count, results } = await videoService.listUserVideos(
    c.env,
    userId,
    query,
    limit,
    offset,
  );
  return c.json(listResponse(results, { total: count, limit, offset }), 200);
});

// Static `/stats` must be registered before `/{id}` so GET .../stats
// is not coerced as id="stats" → NaN.
const videoStatsRoute = createRoute({
  method: "get",
  path: "/stats",
  tags: ["Videos"],
  summary: "Video status counts",
  middleware: [videoAuth] as const,
  responses: {
    200: jsonResponse(videoStatsSchema),
    401: errorResponse("Unauthorized"),
  },
});

videoRoutes.openapi(videoStatsRoute, async (c) => {
  const stats = await videoService.getUserVideoStats(c.env, c.var.userId!);
  return c.json(stats, 200);
});

const getVideoRoute = createRoute({
  method: "get",
  path: "/{id}",
  tags: ["Videos"],
  summary: "Get video detail",
  middleware: [videoAuth] as const,
  request: { params: videoIdParamSchema },
  responses: {
    200: jsonResponse(videoDetailSchema),
    401: errorResponse("Unauthorized"),
    404: errorResponse("Not found"),
  },
});

videoRoutes.openapi(getVideoRoute, async (c) => {
  const userId = c.var.userId!;
  const { id } = c.req.valid("param");
  const video = await videoService.getUserVideo(c.env, id, userId);
  if (!video) throw apiNotFound("Video not found");
  return c.json(video, 200);
});

const createVideoRoute = createRoute({
  method: "post",
  path: "/",
  tags: ["Videos"],
  summary: "Upload a video",
  middleware: [...videoWriteGuards] as const,
  request: {
    body: {
      content: {
        "multipart/form-data": { schema: videoMultipartSchema },
      },
      required: true,
    },
  },
  responses: {
    201: jsonResponse(videoDetailSchema, "Created"),
    400: errorResponse("Validation error"),
    401: errorResponse("Unauthorized"),
  },
});
videoRoutes.openapi(createVideoRoute, async (c) => {
  const res = await videoService.createVideoFromMultipart(
    c.env,
    c.var.userId!,
    c.req.valid("form") as Record<string, string | File>,
  );
  if (!res.ok) {
    return c.json(res.body, res.status as Parameters<typeof c.json>[1]);
  }
  return c.json(res.video, 201);
});

const requestUploadRoute = createRoute({
  method: "post",
  path: "/uploads",
  tags: ["Videos"],
  summary: "Request presigned upload URL",
  middleware: [...videoWriteGuards] as const,
  request: {
    body: {
      content: { "application/json": { schema: uploadRequestSchema } },
      required: true,
    },
  },
  responses: {
    201: jsonResponse(uploadResponseSchema, "Created"),
    400: errorResponse("Bad request"),
    401: errorResponse("Unauthorized"),
  },
});

videoRoutes.openapi(requestUploadRoute, async (c) => {
  const userId = c.var.userId!;
  const body = c.req.valid("json");
  const res = await videoService.requestPresignedUpload(c.env, userId, body);
  if ("fieldError" in res && res.fieldError) {
    return validationError(c, res.fieldError);
  }
  if ("fileTooLarge" in res) {
    return c.json(
      {
        error: {
          code: "FILE_TOO_LARGE",
          message: `File size exceeds the limit of ${res.maxMb} MB.`,
          params: { max_size_mb: res.maxMb },
        },
      },
      400,
    );
  }
  if ("badRequest" in res && res.badRequest) {
    throw apiBadRequest(
      res.badRequest,
      "code" in res ? res.code : undefined,
    );
  }
  return c.json(res, 201);
});

const createYoutubeRoute = createRoute({
  method: "post",
  path: "/youtube",
  tags: ["Videos"],
  summary: "Register a YouTube video",
  middleware: [...videoWriteGuards] as const,
  request: {
    body: {
      content: { "application/json": { schema: youtubeCreateSchema } },
      required: true,
    },
  },
  responses: {
    201: jsonResponse(videoDetailSchema, "Created"),
    400: errorResponse("Bad request"),
    401: errorResponse("Unauthorized"),
  },
});

videoRoutes.openapi(createYoutubeRoute, async (c) => {
  const userId = c.var.userId!;
  const body = c.req.valid("json");
  const res = await videoService.createUserYoutubeVideo(c.env, userId, body);
  if ("fieldError" in res && res.fieldError) {
    return validationError(c, res.fieldError);
  }
  return c.json(res.video, 201);
});

const patchVideoRoute = createRoute({
  method: "patch",
  path: "/{id}",
  tags: ["Videos"],
  summary: "Patch video (or confirm upload)",
  middleware: [...videoWriteGuards] as const,
  request: {
    params: videoIdParamSchema,
    body: {
      content: { "application/json": { schema: videoPatchSchema } },
      required: true,
    },
  },
  responses: {
    200: jsonResponse(videoDetailSchema),
    400: errorResponse("Bad request"),
    404: errorResponse("Not found"),
  },
});

videoRoutes.openapi(patchVideoRoute, async (c) => {
  const userId = c.var.userId!;
  const { id } = c.req.valid("param");
  const body = c.req.valid("json");

  if (body.status === "uploaded") {
    const res = await videoService.confirmVideoUpload(c.env, id, userId);
    if ("notFound" in res) throw apiNotFound("Video not found");
    if ("badState" in res) throw apiBadRequest(res.message ?? "Bad request");
    return c.json(res.video, 200);
  }

  const res = await videoService.patchUserVideo(c.env, id, userId, {
    title: body.title,
    description: body.description,
    transcript: body.transcript,
  });
  if ("notFound" in res) throw apiNotFound("Video not found");
  if ("fieldError" in res) {
    if (!res.fieldError) throw apiBadRequest("Invalid input.");
    return validationError(c, res.fieldError);
  }
  return c.json(res.video, 200);
});

const putVideoRoute = createRoute({
  method: "put",
  path: "/{id}",
  tags: ["Videos"],
  summary: "Replace video metadata",
  middleware: [...videoWriteGuards] as const,
  request: {
    params: videoIdParamSchema,
    body: {
      content: { "application/json": { schema: videoPutSchema } },
      required: true,
    },
  },
  responses: {
    200: jsonResponse(videoDetailSchema),
    400: errorResponse("Bad request"),
    404: errorResponse("Not found"),
  },
});

videoRoutes.openapi(putVideoRoute, async (c) => {
  const userId = c.var.userId!;
  const { id } = c.req.valid("param");
  const body = c.req.valid("json");

  const res = await videoService.putUserVideo(c.env, id, userId, {
    title: body.title,
    description: body.description,
  });
  if ("notFound" in res) throw apiNotFound("Video not found");
  return c.json(res.video, 200);
});

const deleteVideoRoute = createRoute({
  method: "delete",
  path: "/{id}",
  tags: ["Videos"],
  summary: "Delete video",
  middleware: [...videoWriteGuards] as const,
  request: { params: videoIdParamSchema },
  responses: {
    204: { description: "Deleted" },
    404: errorResponse("Not found"),
  },
});

videoRoutes.openapi(deleteVideoRoute, async (c) => {
  const userId = c.var.userId!;
  const { id } = c.req.valid("param");
  const res = await videoService.deleteUserVideo(c.env, id, userId);
  if ("notFound" in res) throw apiNotFound("Video not found");
  return c.body(null, 204);
});
