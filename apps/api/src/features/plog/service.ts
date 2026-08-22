import { embedQuery } from "../../lib/embeddings";
import { EDGE_TYPES, NODE_TYPES } from "../../lib/plog-ordering";
import {
  PlogConflictError,
  PlogEditError,
  createConcept,
  createEdge,
  deleteConcept,
  deleteEdge,
  ensureReadyBuildJob,
  getConceptRow,
  getEdgeRow,
  getOrCreateActiveBuildJob,
  getPlogGraph,
  getPlogLearnerState,
  mergeConcepts,
  resetLearnerStates,
  requireOwnedVideo as repositoryRequireOwnedVideo,
  updateConcept,
  updateEdge,
  updateLearningObject,
  type PlogConceptNode,
  type PlogEdgeItem,
} from "../../repositories/plog-repository";
import { getVideoTranscriptState } from "../../repositories/video-repository";
import { processExternalTaskById } from "../../lib/external-tasks";
import type { Bindings } from "../../types/bindings";

export function requireOwnedVideo(
  env: Bindings,
  videoId: number,
  userId: string,
) {
  return repositoryRequireOwnedVideo(env, videoId, userId);
}

export type EditResult<T> =
  | { ok: true; value: T }
  | { ok: false; status: 400 | 404; message: string };

/** PLOG の秒数入力を有限数へ変換し、空値は 0 とする。 */
export function parsePlogSeconds(raw: unknown): number | { error: string } {
  const v = raw || 0.0;
  if (typeof v === "boolean") return v ? 1.0 : 0.0;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)))
    return Number(v);
  return { error: `could not convert string to float: '${String(raw)}'` };
}

/** PLOG の ID 入力を整数へ変換する。 */
export function parsePlogInteger(raw: unknown): number | { error: string } {
  if (raw === null || raw === undefined) {
    return {
      error:
        "int() argument must be a string, a bytes-like object or a real number, not 'NoneType'",
    };
  }
  if (typeof raw === "boolean") return raw ? 1 : 0;
  if (typeof raw === "number" && Number.isInteger(raw)) return raw;
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.trunc(raw);
  if (typeof raw === "string" && /^-?\d+$/.test(raw.trim()))
    return parseInt(raw.trim(), 10);
  return { error: `invalid literal for int() with base 10: '${String(raw)}'` };
}

const notFound = (entity: string): EditResult<never> => ({
  ok: false,
  status: 404,
  message: `${entity} not found.`,
});

const bad = (message: string): EditResult<never> => ({
  ok: false,
  status: 400,
  message,
});

function mapErr(e: unknown): EditResult<never> | null {
  if (e instanceof PlogConflictError || e instanceof PlogEditError) return bad(e.message);
  return null;
}

export async function graphForVideo(
  env: Bindings,
  videoId: number,
  userId: string,
) {
  return getPlogGraph(env, videoId, userId);
}

export async function learnerStateForVideo(
  env: Bindings,
  videoId: number,
  userId: string,
) {
  return getPlogLearnerState(env, videoId, userId);
}

export async function resetLearnerForVideo(
  env: Bindings,
  videoId: number,
  userId: string,
) {
  return resetLearnerStates(env, userId, videoId);
}

export async function rebuildPlog(
  env: Bindings,
  videoId: number,
  userId: string,
) {
  const state = await getVideoTranscriptState(env, videoId, userId);
  if (!state.found) return { notFound: "Video not found." } as const;
  if (!state.hasTranscript) return { notFound: "Transcript not found." } as const;

  const job = await getOrCreateActiveBuildJob(env, videoId);
  if (job.taskId !== null) await processExternalTaskById(env, job.taskId);
  return {
    ok: true as const,
    video_id: videoId,
    status: job.status,
    job_id: job.id,
  };
}

export async function editCreateConcept(
  env: Bindings,
  videoId: number,
  input: { label: string; nodeType: string; introSec: number; sourceQuote: string },
): Promise<EditResult<PlogConceptNode>> {
  const label = (input.label || "").trim();
  if (!label) return bad("label is required");
  if (!NODE_TYPES.has(input.nodeType)) return bad(`Invalid node_type: ${input.nodeType}`);
  try {
    await ensureReadyBuildJob(env, videoId);
    let embedding: number[];
    try {
      embedding = await embedQuery(env, label);
    } catch (e) {
      return bad(`Failed to embed concept label: ${e}`);
    }
    return {
      ok: true,
      value: await createConcept(env, {
        videoId,
        label,
        nodeType: input.nodeType,
        introSec: input.introSec,
        sourceQuote: input.sourceQuote,
        embedding,
      }),
    };
  } catch (e) {
    return mapErr(e) ?? Promise.reject(e);
  }
}

export async function editUpdateConcept(
  env: Bindings,
  videoId: number,
  conceptId: number,
  patch: {
    label?: string;
    nodeType?: string;
    introSec?: number;
    sourceQuote?: string;
  },
): Promise<EditResult<PlogConceptNode>> {
  const existing = await getConceptRow(env, conceptId, videoId);
  if (!existing) return notFound("Concept");
  if (patch.nodeType !== undefined && !NODE_TYPES.has(patch.nodeType))
    return bad(`Invalid node_type: ${patch.nodeType}`);

  let embedding: number[] | undefined;
  let label = patch.label;
  if (label !== undefined) {
    label = label.trim();
    if (!label) return bad("label cannot be empty");
    if (label !== existing.label) {
      try {
        embedding = await embedQuery(env, label);
      } catch (e) {
        return bad(`Failed to embed concept label: ${e}`);
      }
    }
  }
  try {
    const updated = await updateConcept(env, {
      conceptId,
      videoId,
      label,
      nodeType: patch.nodeType,
      introSec: patch.introSec,
      sourceQuote: patch.sourceQuote,
      embedding,
    });
    if (!updated) return notFound("Concept");
    return { ok: true, value: updated };
  } catch (e) {
    return mapErr(e) ?? Promise.reject(e);
  }
}

export async function editDeleteConcept(
  env: Bindings,
  videoId: number,
  conceptId: number,
): Promise<EditResult<{ deleted: true; id: number }>> {
  const ok = await deleteConcept(env, conceptId, videoId);
  if (!ok) return notFound("Concept");
  return { ok: true, value: { deleted: true, id: conceptId } };
}

export async function editMergeConcepts(
  env: Bindings,
  videoId: number,
  survivorId: number,
  absorbId: number,
): Promise<EditResult<PlogConceptNode>> {
  if (survivorId === absorbId) return bad("survivor_id and absorb_id must differ");
  if ((await getConceptRow(env, survivorId, videoId)) === null) return notFound("Concept");
  if ((await getConceptRow(env, absorbId, videoId)) === null) return notFound("Concept");
  const merged = await mergeConcepts(env, videoId, survivorId, absorbId);
  if (!merged) return notFound("Concept");
  return { ok: true, value: merged };
}

export async function editUpdateLearningObject(
  env: Bindings,
  videoId: number,
  conceptId: number,
  patch: {
    openingQuestion?: string;
    hintLadder?: unknown[];
    misconceptions?: unknown[];
    canonicalOrder?: unknown[];
    workedExamples?: unknown[];
    waypoints?: unknown[];
  },
): Promise<EditResult<PlogConceptNode>> {
  const updated = await updateLearningObject(env, {
    conceptId,
    videoId,
    openingQuestion: patch.openingQuestion,
    hintLadder: patch.hintLadder,
    misconceptions: patch.misconceptions,
    canonicalOrder: patch.canonicalOrder,
    workedExamples: patch.workedExamples,
    waypoints: patch.waypoints,
  });
  if (!updated) return notFound("Concept");
  return { ok: true, value: updated };
}

export async function editCreateEdge(
  env: Bindings,
  videoId: number,
  input: { sourceId: number; targetId: number; edgeType: string; quote: string },
): Promise<EditResult<PlogEdgeItem>> {
  if (!EDGE_TYPES.has(input.edgeType)) return bad(`Invalid edge_type: ${input.edgeType}`);
  if (input.sourceId === input.targetId)
    return bad("source_id and target_id must differ");
  if ((await getConceptRow(env, input.sourceId, videoId)) === null)
    return bad("source_id does not exist for this video");
  if ((await getConceptRow(env, input.targetId, videoId)) === null)
    return bad("target_id does not exist for this video");
  try {
    await ensureReadyBuildJob(env, videoId);
    return {
      ok: true,
      value: await createEdge(env, {
        videoId,
        sourceId: input.sourceId,
        targetId: input.targetId,
        edgeType: input.edgeType,
        quote: input.quote,
      }),
    };
  } catch (e) {
    return mapErr(e) ?? Promise.reject(e);
  }
}

export async function editUpdateEdge(
  env: Bindings,
  videoId: number,
  edgeId: number,
  patch: {
    sourceId?: number;
    targetId?: number;
    edgeType?: string;
    quote?: string;
  },
): Promise<EditResult<PlogEdgeItem>> {
  const existing = await getEdgeRow(env, edgeId, videoId);
  if (!existing) return notFound("Edge");
  const nextSource = patch.sourceId ?? existing.source_id;
  const nextTarget = patch.targetId ?? existing.target_id;
  const nextType = patch.edgeType ?? existing.edge_type;
  if (patch.edgeType !== undefined && !EDGE_TYPES.has(patch.edgeType))
    return bad(`Invalid edge_type: ${patch.edgeType}`);
  if (nextSource === nextTarget) return bad("source_id and target_id must differ");
  if ((await getConceptRow(env, nextSource, videoId)) === null)
    return bad("source_id does not exist for this video");
  if ((await getConceptRow(env, nextTarget, videoId)) === null)
    return bad("target_id does not exist for this video");
  try {
    const updated = await updateEdge(env, {
      edgeId,
      videoId,
      sourceId: patch.sourceId,
      targetId: patch.targetId,
      edgeType: patch.edgeType,
      quote: patch.quote,
    });
    if (!updated) return notFound("Edge");
    return { ok: true, value: updated };
  } catch (e) {
    return mapErr(e) ?? Promise.reject(e);
  }
}

export async function editDeleteEdge(
  env: Bindings,
  videoId: number,
  edgeId: number,
): Promise<EditResult<{ deleted: true; id: number }>> {
  const ok = await deleteEdge(env, edgeId, videoId);
  if (!ok) return notFound("Edge");
  return { ok: true, value: { deleted: true, id: edgeId } };
}
