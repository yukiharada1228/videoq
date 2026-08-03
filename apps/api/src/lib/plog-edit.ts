/**
 * EditPlogGraphUseCase 相当のオーケストレーション。
 * 認可済み video 前提で呼ばれる（routes 側で requireOwnedVideo）。
 */
import { embedQuery } from "./embeddings";
import { EDGE_TYPES, NODE_TYPES, ORDERING, isDag } from "./plog-ordering";
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
  listOrderingEdges,
  mergeConcepts,
  updateConcept,
  updateEdge,
  updateLearningObject,
  type PlogConceptNode,
  type PlogEdgeItem,
} from "../repositories/plog-repository";
import type { Bindings } from "../types/bindings";

export type EditResult<T> =
  | { ok: true; value: T }
  | { ok: false; status: 400 | 404; message: string };

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

async function assertOrderingDag(
  env: Bindings,
  videoId: number,
  proposed: { sourceId: number; targetId: number; edgeType: string },
  excludeEdgeId?: number,
): Promise<void> {
  if (!ORDERING.has(proposed.edgeType)) return;
  const edges = await listOrderingEdges(env, videoId);
  const pairs: [string, string][] = [];
  for (const e of edges) {
    if (excludeEdgeId !== undefined && e.id === excludeEdgeId) continue;
    pairs.push([String(e.source_id), String(e.target_id)]);
  }
  pairs.push([String(proposed.sourceId), String(proposed.targetId)]);
  if (!isDag(pairs)) {
    throw new PlogEditError("Ordering edges must form a DAG (cycle detected).");
  }
}

function mapErr(e: unknown): EditResult<never> | null {
  if (e instanceof PlogConflictError || e instanceof PlogEditError) return bad(e.message);
  return null;
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
    await assertOrderingDag(env, videoId, input);
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
    await assertOrderingDag(
      env,
      videoId,
      { sourceId: nextSource, targetId: nextTarget, edgeType: nextType },
      edgeId,
    );
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
