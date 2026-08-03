import { z } from "../../shared/openapi";

export const plogVideoParamSchema = z.object({
  videoId: z.coerce.number().int().positive(),
});

export const plogConceptParamSchema = plogVideoParamSchema.extend({
  conceptId: z.coerce.number().int().positive(),
});

export const plogEdgeParamSchema = plogVideoParamSchema.extend({
  edgeId: z.coerce.number().int().positive(),
});

export const plogConceptNodeSchema = z
  .object({
    id: z.number().int(),
    label: z.string(),
    node_type: z.string(),
    intro_sec: z.number(),
    source_quote: z.string(),
    opening_question: z.string(),
    hint_ladder: z.array(z.unknown()),
    misconceptions: z.array(z.unknown()),
    canonical_order: z.array(z.unknown()),
    worked_examples: z.array(z.unknown()),
    waypoints: z.array(z.unknown()),
    hint_count: z.number().int(),
    waypoint_count: z.number().int(),
  })
  .openapi("PlogConceptNode");

export const plogEdgeSchema = z
  .object({
    id: z.number().int(),
    source_id: z.number().int(),
    source_label: z.string(),
    target_id: z.number().int(),
    target_label: z.string(),
    edge_type: z.string(),
    quote: z.string(),
  })
  .openapi("PlogEdge");

export const plogGraphSchema = z
  .object({
    video_id: z.number().int(),
    build_status: z.string(),
    input_tokens: z.number().int(),
    output_tokens: z.number().int(),
    error_message: z.string(),
    summary_node_count: z.number().int(),
    concepts: z.array(plogConceptNodeSchema),
    edges: z.array(plogEdgeSchema),
  })
  .openapi("PlogGraph");

export const learnerStateItemSchema = z
  .object({
    concept_id: z.number().int(),
    label: z.string(),
    reached: z.boolean(),
    hint_index: z.number().int(),
    last_grade: z.string(),
    active: z.boolean(),
  })
  .openapi("PlogLearnerStateItem");

export const learnerStateResponseSchema = z
  .object({ states: z.array(learnerStateItemSchema) })
  .openapi("PlogLearnerState");

export const rebuildResponseSchema = z
  .object({
    video_id: z.number().int(),
    status: z.string(),
    job_id: z.number().int(),
  })
  .openapi("PlogRebuildResponse");

export const editDeleteResponseSchema = z
  .object({
    deleted: z.literal(true),
    id: z.number().int(),
  })
  .openapi("PlogEditDeleteResponse");

/** intro_sec は数値変換と既存エラー形式の維持のため routes で検証する。 */
export const createConceptBodySchema = z
  .object({
    label: z.string().optional(),
    node_type: z.string().optional(),
    intro_sec: z.unknown().optional(),
    source_quote: z.string().optional(),
  })
  .openapi("PlogCreateConceptBody");

export const updateConceptBodySchema = z
  .object({
    label: z.string().optional(),
    node_type: z.string().optional(),
    intro_sec: z.unknown().optional(),
    source_quote: z.string().optional(),
  })
  .openapi("PlogUpdateConceptBody");

/** absorb_id は整数変換と既存エラー形式の維持のため unknown。 */
export const mergeConceptBodySchema = z
  .object({
    absorb_id: z.unknown(),
  })
  .openapi("PlogMergeConceptBody");

export const updateLearningObjectBodySchema = z
  .object({
    opening_question: z.string().optional(),
    hint_ladder: z.array(z.unknown()).optional(),
    misconceptions: z.array(z.unknown()).optional(),
    canonical_order: z.array(z.unknown()).optional(),
    worked_examples: z.array(z.unknown()).optional(),
    waypoints: z.array(z.unknown()).optional(),
  })
  .openapi("PlogUpdateLearningObjectBody");

/** source_id / target_id は整数変換と既存エラー形式の維持のため unknown。 */
export const createEdgeBodySchema = z
  .object({
    source_id: z.unknown(),
    target_id: z.unknown(),
    edge_type: z.string().optional(),
    quote: z.string().optional(),
  })
  .openapi("PlogCreateEdgeBody");

export const updateEdgeBodySchema = z
  .object({
    source_id: z.unknown().optional(),
    target_id: z.unknown().optional(),
    edge_type: z.string().optional(),
    quote: z.string().optional(),
  })
  .openapi("PlogUpdateEdgeBody");
