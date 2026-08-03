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
import { ApiError } from "../../shared/errors";
import type { AppEnv } from "../../types/bindings";
import {
  createConceptBodySchema,
  createEdgeBodySchema,
  editDeleteResponseSchema,
  learnerStateResponseSchema,
  mergeConceptBodySchema,
  plogConceptNodeSchema,
  plogConceptParamSchema,
  plogEdgeParamSchema,
  plogEdgeSchema,
  plogGraphSchema,
  plogVideoParamSchema,
  rebuildResponseSchema,
  updateConceptBodySchema,
  updateEdgeBodySchema,
  updateLearningObjectBodySchema,
} from "./schemas";
import * as plogService from "./service";
import type { EditResult } from "./service";

/**
 * Plog（学習グラフ）。読み取り/rebuild/編集は OpenAPI。
 * 未所有/不在は 404 "Video not found."（ピリオド有・VALIDATION_ERROR）。
 */
export const plogRoutes = createFeatureRouter();

const plogAuth = requireAuth(apiKeyMethod, jwtMethod);
const plogWriteGuards = [
  requireAuth(apiKeyMethod, jwtMethod),
  requireScope("write"),
] as const;
const learnerResetGuards = [
  requireAuth(apiKeyMethod, jwtMethod),
  requireScope("read"),
] as const;

const videoNotFoundError = () =>
  new ApiError(404, "VALIDATION_ERROR", "Video not found.");

const editBadRequest = (message: string) =>
  new ApiError(400, "VALIDATION_ERROR", message);

async function requireOwnedVideoId(
  env: AppEnv["Bindings"],
  videoId: number,
  userId: number,
): Promise<void> {
  const owner = await plogService.requireOwnedVideo(env, videoId, userId);
  if ("notFound" in owner) throw videoNotFoundError();
}

function respondEdit<T>(result: EditResult<T>): T {
  if (!result.ok) throw new ApiError(result.status, "VALIDATION_ERROR", result.message);
  return result.value;
}

const jsonBody = <S extends z.ZodType>(schema: S) => ({
  content: { "application/json": { schema } },
  required: true as const,
});

const learnerStateRoute = createRoute({
  method: "get",
  path: "/{videoId}/plog/learner-state",
  tags: ["Plog"],
  summary: "Get learner state",
  middleware: [plogAuth] as const,
  request: { params: plogVideoParamSchema },
  responses: {
    200: jsonResponse(learnerStateResponseSchema),
    404: errorResponse("Not found"),
  },
});

plogRoutes.openapi(learnerStateRoute, async (c) => {
  const { videoId } = c.req.valid("param");
  const res = await plogService.learnerStateForVideo(
    c.env,
    videoId,
    c.var.userId!,
  );
  if ("notFound" in res) throw videoNotFoundError();
  return c.json(res, 200);
});

const resetLearnerRoute = createRoute({
  method: "delete",
  path: "/{videoId}/plog/learner-state",
  tags: ["Plog"],
  summary: "Reset learner state",
  middleware: [...learnerResetGuards] as const,
  request: { params: plogVideoParamSchema },
  responses: {
    200: jsonResponse(z.object({ deleted: z.number().int() })),
    404: errorResponse("Not found"),
  },
});

plogRoutes.openapi(resetLearnerRoute, async (c) => {
  const { videoId } = c.req.valid("param");
  const res = await plogService.resetLearnerForVideo(
    c.env,
    videoId,
    c.var.userId!,
  );
  if ("notFound" in res) throw videoNotFoundError();
  return c.json({ deleted: res.deleted }, 200);
});

const graphRoute = createRoute({
  method: "get",
  path: "/{videoId}/plog",
  tags: ["Plog"],
  summary: "Get plog graph",
  middleware: [plogAuth] as const,
  request: { params: plogVideoParamSchema },
  responses: {
    200: jsonResponse(plogGraphSchema),
    404: errorResponse("Not found"),
  },
});

plogRoutes.openapi(graphRoute, async (c) => {
  const { videoId } = c.req.valid("param");
  const res = await plogService.graphForVideo(c.env, videoId, c.var.userId!);
  if ("notFound" in res) throw videoNotFoundError();
  return c.json(res, 200);
});

const rebuildRoute = createRoute({
  method: "post",
  path: "/{videoId}/plog/rebuild",
  tags: ["Plog"],
  summary: "Enqueue plog rebuild",
  middleware: [...plogWriteGuards] as const,
  request: { params: plogVideoParamSchema },
  responses: {
    202: jsonResponse(rebuildResponseSchema, "Accepted"),
    404: errorResponse("Not found"),
  },
});

plogRoutes.openapi(rebuildRoute, async (c) => {
  const { videoId } = c.req.valid("param");
  const res = await plogService.rebuildPlog(c.env, videoId, c.var.userId!);
  if ("notFound" in res) {
    throw new ApiError(404, "VALIDATION_ERROR", res.notFound ?? "Not found");
  }
  return c.json(
    { video_id: res.video_id, status: res.status, job_id: res.job_id },
    202,
  );
});

const createConceptRoute = createRoute({
  method: "post",
  path: "/{videoId}/plog/concepts",
  tags: ["Plog"],
  summary: "Create plog concept",
  middleware: [...plogWriteGuards] as const,
  request: {
    params: plogVideoParamSchema,
    body: jsonBody(createConceptBodySchema),
  },
  responses: {
    201: jsonResponse(plogConceptNodeSchema),
    400: errorResponse("Validation error"),
    404: errorResponse("Not found"),
  },
});

plogRoutes.openapi(createConceptRoute, async (c) => {
  const { videoId } = c.req.valid("param");
  await requireOwnedVideoId(c.env, videoId, c.var.userId!);
  const body = c.req.valid("json");
  const intro = plogService.parsePlogSeconds(body.intro_sec);
  if (typeof intro === "object") throw editBadRequest(intro.error);
  const value = respondEdit(
    await plogService.editCreateConcept(c.env, videoId, {
      label: String(body.label ?? ""),
      nodeType: String(body.node_type || "object"),
      introSec: intro,
      sourceQuote: String(body.source_quote ?? ""),
    }),
  );
  return c.json(value, 201);
});

const updateConceptRoute = createRoute({
  method: "patch",
  path: "/{videoId}/plog/concepts/{conceptId}",
  tags: ["Plog"],
  summary: "Update plog concept",
  middleware: [...plogWriteGuards] as const,
  request: {
    params: plogConceptParamSchema,
    body: jsonBody(updateConceptBodySchema),
  },
  responses: {
    200: jsonResponse(plogConceptNodeSchema),
    400: errorResponse("Validation error"),
    404: errorResponse("Not found"),
  },
});

plogRoutes.openapi(updateConceptRoute, async (c) => {
  const { videoId, conceptId } = c.req.valid("param");
  await requireOwnedVideoId(c.env, videoId, c.var.userId!);
  const body = c.req.valid("json");
  const patch: {
    label?: string;
    nodeType?: string;
    introSec?: number;
    sourceQuote?: string;
  } = {};
  if (body.label !== undefined) patch.label = body.label;
  if (body.node_type !== undefined) patch.nodeType = body.node_type;
  if (body.source_quote !== undefined) patch.sourceQuote = body.source_quote;
  if (body.intro_sec !== undefined) {
    const n = Number(body.intro_sec);
    if (!Number.isFinite(n)) throw editBadRequest("intro_sec must be a number");
    patch.introSec = n;
  }
  return c.json(
    respondEdit(await plogService.editUpdateConcept(c.env, videoId, conceptId, patch)),
    200,
  );
});

const deleteConceptRoute = createRoute({
  method: "delete",
  path: "/{videoId}/plog/concepts/{conceptId}",
  tags: ["Plog"],
  summary: "Delete plog concept",
  middleware: [...plogWriteGuards] as const,
  request: { params: plogConceptParamSchema },
  responses: {
    200: jsonResponse(editDeleteResponseSchema),
    404: errorResponse("Not found"),
  },
});

plogRoutes.openapi(deleteConceptRoute, async (c) => {
  const { videoId, conceptId } = c.req.valid("param");
  await requireOwnedVideoId(c.env, videoId, c.var.userId!);
  return c.json(
    respondEdit(await plogService.editDeleteConcept(c.env, videoId, conceptId)),
    200,
  );
});

const mergeConceptRoute = createRoute({
  method: "post",
  path: "/{videoId}/plog/concepts/{conceptId}/merge",
  tags: ["Plog"],
  summary: "Merge plog concepts",
  middleware: [...plogWriteGuards] as const,
  request: {
    params: plogConceptParamSchema,
    body: jsonBody(mergeConceptBodySchema),
  },
  responses: {
    200: jsonResponse(plogConceptNodeSchema),
    400: errorResponse("Validation error"),
    404: errorResponse("Not found"),
  },
});

plogRoutes.openapi(mergeConceptRoute, async (c) => {
  const { videoId, conceptId } = c.req.valid("param");
  await requireOwnedVideoId(c.env, videoId, c.var.userId!);
  const body = c.req.valid("json");
  const absorbId = plogService.parsePlogInteger(body.absorb_id);
  if (typeof absorbId === "object") throw editBadRequest(absorbId.error);
  return c.json(
    respondEdit(
      await plogService.editMergeConcepts(c.env, videoId, conceptId, absorbId),
    ),
    200,
  );
});

const updateLearningObjectRoute = createRoute({
  method: "patch",
  path: "/{videoId}/plog/concepts/{conceptId}/learning-object",
  tags: ["Plog"],
  summary: "Update plog learning object",
  middleware: [...plogWriteGuards] as const,
  request: {
    params: plogConceptParamSchema,
    body: jsonBody(updateLearningObjectBodySchema),
  },
  responses: {
    200: jsonResponse(plogConceptNodeSchema),
    404: errorResponse("Not found"),
  },
});

plogRoutes.openapi(updateLearningObjectRoute, async (c) => {
  const { videoId, conceptId } = c.req.valid("param");
  await requireOwnedVideoId(c.env, videoId, c.var.userId!);
  const body = c.req.valid("json");
  const patch: Parameters<typeof plogService.editUpdateLearningObject>[3] = {};
  if (body.opening_question !== undefined) patch.openingQuestion = body.opening_question;
  if (body.hint_ladder !== undefined) patch.hintLadder = body.hint_ladder;
  if (body.misconceptions !== undefined) patch.misconceptions = body.misconceptions;
  if (body.canonical_order !== undefined) patch.canonicalOrder = body.canonical_order;
  if (body.worked_examples !== undefined) patch.workedExamples = body.worked_examples;
  if (body.waypoints !== undefined) patch.waypoints = body.waypoints;
  return c.json(
    respondEdit(
      await plogService.editUpdateLearningObject(c.env, videoId, conceptId, patch),
    ),
    200,
  );
});

const createEdgeRoute = createRoute({
  method: "post",
  path: "/{videoId}/plog/edges",
  tags: ["Plog"],
  summary: "Create plog edge",
  middleware: [...plogWriteGuards] as const,
  request: {
    params: plogVideoParamSchema,
    body: jsonBody(createEdgeBodySchema),
  },
  responses: {
    201: jsonResponse(plogEdgeSchema),
    400: errorResponse("Validation error"),
    404: errorResponse("Not found"),
  },
});

plogRoutes.openapi(createEdgeRoute, async (c) => {
  const { videoId } = c.req.valid("param");
  await requireOwnedVideoId(c.env, videoId, c.var.userId!);
  const body = c.req.valid("json");
  const sourceId = plogService.parsePlogInteger(body.source_id);
  if (typeof sourceId === "object") throw editBadRequest(sourceId.error);
  const targetId = plogService.parsePlogInteger(body.target_id);
  if (typeof targetId === "object") throw editBadRequest(targetId.error);
  const value = respondEdit(
    await plogService.editCreateEdge(c.env, videoId, {
      sourceId,
      targetId,
      edgeType: String(body.edge_type || ""),
      quote: String(body.quote ?? ""),
    }),
  );
  return c.json(value, 201);
});

const updateEdgeRoute = createRoute({
  method: "patch",
  path: "/{videoId}/plog/edges/{edgeId}",
  tags: ["Plog"],
  summary: "Update plog edge",
  middleware: [...plogWriteGuards] as const,
  request: {
    params: plogEdgeParamSchema,
    body: jsonBody(updateEdgeBodySchema),
  },
  responses: {
    200: jsonResponse(plogEdgeSchema),
    400: errorResponse("Validation error"),
    404: errorResponse("Not found"),
  },
});

plogRoutes.openapi(updateEdgeRoute, async (c) => {
  const { videoId, edgeId } = c.req.valid("param");
  await requireOwnedVideoId(c.env, videoId, c.var.userId!);
  const data = c.req.valid("json");
  const patch: {
    sourceId?: number;
    targetId?: number;
    edgeType?: string;
    quote?: string;
  } = {};
  if (data.edge_type !== undefined) patch.edgeType = data.edge_type;
  if (data.quote !== undefined) patch.quote = data.quote;
  for (const key of ["source_id", "target_id"] as const) {
    if (data[key] !== undefined) {
      const n = Number(data[key]);
      if (!Number.isInteger(n)) throw editBadRequest(`${key} must be an integer`);
      if (key === "source_id") patch.sourceId = n;
      else patch.targetId = n;
    }
  }
  if (
    patch.sourceId === undefined &&
    patch.targetId === undefined &&
    patch.edgeType === undefined &&
    patch.quote === undefined
  ) {
    throw editBadRequest(
      "Provide at least one of: source_id, target_id, edge_type, quote",
    );
  }
  return c.json(
    respondEdit(await plogService.editUpdateEdge(c.env, videoId, edgeId, patch)),
    200,
  );
});

const deleteEdgeRoute = createRoute({
  method: "delete",
  path: "/{videoId}/plog/edges/{edgeId}",
  tags: ["Plog"],
  summary: "Delete plog edge",
  middleware: [...plogWriteGuards] as const,
  request: { params: plogEdgeParamSchema },
  responses: {
    200: jsonResponse(editDeleteResponseSchema),
    404: errorResponse("Not found"),
  },
});

plogRoutes.openapi(deleteEdgeRoute, async (c) => {
  const { videoId, edgeId } = c.req.valid("param");
  await requireOwnedVideoId(c.env, videoId, c.var.userId!);
  return c.json(
    respondEdit(await plogService.editDeleteEdge(c.env, videoId, edgeId)),
    200,
  );
});
