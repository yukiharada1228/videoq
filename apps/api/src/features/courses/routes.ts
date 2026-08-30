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
  courseCreateSchema,
  courseDetailSchema,
  courseIdParamSchema,
  courseListItemSchema,
  coursePatchSchema,
  coursePutSchema,
  reorderCoursesSchema,
  shareLinkSchema,
} from "./schemas";
import * as courseService from "./service";

export const courseRoutes = createFeatureRouter();

const courseAuth = requireAuth(apiKeyMethod, sessionMethod);
const courseWriteGuards = [
  requireAuth(apiKeyMethod, sessionMethod),
  requireScope("write"),
] as const;

const listCoursesRoute = createRoute({
  method: "get",
  path: "/courses",
  tags: ["Courses"],
  summary: "List courses",
  middleware: [courseAuth] as const,
  request: { query: paginationQuerySchema },
  responses: {
    200: jsonResponse(createListResponseSchema(courseListItemSchema)),
    401: errorResponse("Unauthorized"),
  },
});

courseRoutes.openapi(listCoursesRoute, async (c) => {
  const userId = c.var.userId!;
  const { limit, offset } = parseLimitOffset(c);
  const { count, results } = await courseService.listCourses(
    c.env,
    userId,
    limit,
    offset,
  );
  return c.json(listResponse(results, { total: count, limit, offset }), 200);
});

const sharedCourseRoute = createRoute({
  method: "get",
  path: "/courses/share/{slug}",
  tags: ["Courses"],
  summary: "Get shared course by slug",
  request: {
    params: z.object({ slug: z.string().min(1) }),
  },
  responses: {
    200: jsonResponse(courseDetailSchema),
    404: errorResponse("Not found"),
  },
});

courseRoutes.openapi(sharedCourseRoute, async (c) => {
  const { slug } = c.req.valid("param");
  const denied = await enforceThrottles(c.env, [
    { scope: "chat_share_token_ip", ident: slug ? clientIp(c) : null },
  ]);
  if (denied) return throttledResponse(c, denied);
  const course = await courseService.getSharedCourse(c.env, slug);
  if (!course) throw apiNotFound("Share link not found");
  return c.json(course, 200);
});

const getCourseRoute = createRoute({
  method: "get",
  path: "/courses/{id}",
  tags: ["Courses"],
  summary: "Get course detail",
  middleware: [courseAuth] as const,
  request: { params: courseIdParamSchema },
  responses: {
    200: jsonResponse(courseDetailSchema),
    404: errorResponse("Not found"),
  },
});

courseRoutes.openapi(getCourseRoute, async (c) => {
  const userId = c.var.userId!;
  const { id } = c.req.valid("param");
  const course = await courseService.getCourse(c.env, id, userId);
  if (!course) throw apiNotFound("Course not found");
  return c.json(course, 200);
});

const createCourseRoute = createRoute({
  method: "post",
  path: "/courses",
  tags: ["Courses"],
  summary: "Create course",
  middleware: [...courseWriteGuards] as const,
  request: {
    body: {
      content: { "application/json": { schema: courseCreateSchema } },
      required: true,
    },
  },
  responses: {
    201: jsonResponse(courseDetailSchema),
    400: errorResponse("Validation error"),
  },
});

courseRoutes.openapi(createCourseRoute, async (c) => {
  const userId = c.var.userId!;
  const body = c.req.valid("json");
  const course = await courseService.createUserCourse(
    c.env,
    userId,
    body.name,
    body.description ?? "",
  );
  return c.json(course, 201);
});

// Static `/courses/order` must be registered before `/courses/{id}` so
// PATCH .../order is not coerced as id="order" → NaN.
const reorderRoute = createRoute({
  method: "patch",
  path: "/courses/order",
  tags: ["Courses"],
  summary: "Reorder courses",
  middleware: [...courseWriteGuards] as const,
  request: {
    body: {
      content: { "application/json": { schema: reorderCoursesSchema } },
      required: true,
    },
  },
  responses: {
    200: jsonResponse(z.object({ message: z.string() })),
    400: errorResponse("Bad request"),
  },
});

courseRoutes.openapi(reorderRoute, async (c) => {
  const userId = c.var.userId!;
  const { course_ids } = c.req.valid("json");
  const res = await courseService.reorderUserCourses(c.env, userId, course_ids);
  if ("mismatch" in res) {
    throw apiBadRequest("Specified course IDs do not match user courses");
  }
  return c.json({ message: "Course order updated" }, 200);
});

const patchCourseRoute = createRoute({
  method: "patch",
  path: "/courses/{id}",
  tags: ["Courses"],
  summary: "Partial update course",
  middleware: [...courseWriteGuards] as const,
  request: {
    params: courseIdParamSchema,
    body: {
      content: { "application/json": { schema: coursePatchSchema } },
      required: true,
    },
  },
  responses: {
    200: jsonResponse(courseDetailSchema),
    404: errorResponse("Not found"),
  },
});

courseRoutes.openapi(patchCourseRoute, async (c) => {
  const userId = c.var.userId!;
  const { id } = c.req.valid("param");
  const body = c.req.valid("json");
  const result = await courseService.updateUserCourse(c.env, id, userId, body);
  if ("notFound" in result) throw apiNotFound("Course not found");
  return c.json(result.course, 200);
});

const putCourseRoute = createRoute({
  method: "put",
  path: "/courses/{id}",
  tags: ["Courses"],
  summary: "Replace course",
  middleware: [...courseWriteGuards] as const,
  request: {
    params: courseIdParamSchema,
    body: {
      content: { "application/json": { schema: coursePutSchema } },
      required: true,
    },
  },
  responses: {
    200: jsonResponse(courseDetailSchema),
    404: errorResponse("Not found"),
  },
});

courseRoutes.openapi(putCourseRoute, async (c) => {
  const userId = c.var.userId!;
  const { id } = c.req.valid("param");
  const body = c.req.valid("json");
  const result = await courseService.updateUserCourse(c.env, id, userId, {
    name: body.name,
    description: body.description ?? "",
  });
  if ("notFound" in result) throw apiNotFound("Course not found");
  return c.json(result.course, 200);
});

const deleteCourseRoute = createRoute({
  method: "delete",
  path: "/courses/{id}",
  tags: ["Courses"],
  summary: "Delete course",
  middleware: [...courseWriteGuards] as const,
  request: { params: courseIdParamSchema },
  responses: {
    204: { description: "Deleted" },
    404: errorResponse("Not found"),
  },
});

courseRoutes.openapi(deleteCourseRoute, async (c) => {
  const userId = c.var.userId!;
  const { id } = c.req.valid("param");
  const res = await courseService.removeCourse(c.env, id, userId);
  if ("notFound" in res) throw apiNotFound("Course not found");
  return c.body(null, 204);
});

const createShareRoute = createRoute({
  method: "post",
  path: "/courses/{id}/share",
  tags: ["Courses"],
  summary: "Create or update share link",
  middleware: [...courseWriteGuards] as const,
  request: {
    params: courseIdParamSchema,
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

courseRoutes.openapi(createShareRoute, async (c) => {
  const userId = c.var.userId!;
  const { id } = c.req.valid("param");
  const { share_slug } = c.req.valid("json");
  const result = await courseService.saveShareLink(c.env, id, userId, share_slug);
  if ("notFound" in result) throw apiNotFound("Course not found");
  if ("error" in result) throw apiBadRequest(result.error ?? "Bad request");
  if ("conflict" in result) {
    throw new ApiError(409, "CONFLICT", result.conflict ?? "Conflict");
  }
  return c.json({ message: "Share link saved", share_slug: result.share_slug }, 201);
});

const deleteShareRoute = createRoute({
  method: "delete",
  path: "/courses/{id}/share",
  tags: ["Courses"],
  summary: "Remove share link",
  middleware: [...courseWriteGuards] as const,
  request: { params: courseIdParamSchema },
  responses: {
    204: { description: "Deleted" },
    404: errorResponse("Not found"),
  },
});

courseRoutes.openapi(deleteShareRoute, async (c) => {
  const userId = c.var.userId!;
  const { id } = c.req.valid("param");
  const result = await courseService.clearShareLink(c.env, id, userId);
  if ("notFound" in result) throw apiNotFound("Course not found");
  if ("notConfigured" in result) throw apiNotFound("Share link is not configured");
  return c.body(null, 204);
});
