import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import { type Db, withDb } from "../db/pool";
import {
  appLearnerconceptstate,
  appPlogbuildjob,
  appPlogconcept,
  appPlogedge,
  appPloglearningobject,
  appPlogsummarynode,
  appVideo,
} from "../db/schema";
import type {
  PlogConcept,
  PlogEdge,
  PlogGraphSnapshot,
  PlogLearningObject,
  PlogSummaryNode,
} from "../lib/plog-runtime";
import { stableKey } from "../utils/py-json";
import type { Bindings } from "../types/bindings";

// concept_dto_to_dict / edge_dto_to_dict に一致する形。
export type PlogConceptNode = {
  id: number;
  label: string;
  node_type: string;
  intro_sec: number;
  source_quote: string;
  opening_question: string;
  hint_ladder: unknown[];
  misconceptions: unknown[];
  canonical_order: unknown[];
  worked_examples: unknown[];
  waypoints: unknown[];
  hint_count: number;
  waypoint_count: number;
};
export type PlogEdgeItem = {
  id: number;
  source_id: number;
  source_label: string;
  target_id: number;
  target_label: string;
  edge_type: string;
  quote: string;
};
export type PlogGraph = {
  video_id: number;
  build_status: string;
  input_tokens: number;
  output_tokens: number;
  error_message: string;
  summary_node_count: number;
  concepts: PlogConceptNode[];
  edges: PlogEdgeItem[];
};

export type LearnerStateItem = {
  concept_id: number;
  label: string;
  reached: boolean;
  hint_index: number;
  last_grade: string;
  active: boolean;
};

const parseArr = (v: unknown): unknown[] => (v ? JSON.parse(v as string) : []);

function mapConcept(r: Record<string, unknown>): PlogConceptNode {
  const hint_ladder = parseArr(r.hint_ladder);
  const waypoints = parseArr(r.waypoints);
  return {
    id: Number(r.id),
    label: r.label as string,
    node_type: r.node_type as string,
    intro_sec: Number(r.intro_sec),
    source_quote: (r.source_quote as string) ?? "",
    opening_question: (r.opening_question as string) ?? "",
    hint_ladder,
    misconceptions: parseArr(r.misconceptions),
    canonical_order: parseArr(r.canonical_order),
    worked_examples: parseArr(r.worked_examples),
    waypoints,
    hint_count: hint_ladder.length,
    waypoint_count: waypoints.length,
  };
}

async function fetchConceptNode(
  db: Db,
  conceptId: number,
  videoId: number,
): Promise<PlogConceptNode | null> {
  const rows = await db
    .select({
      id: appPlogconcept.id,
      label: appPlogconcept.label,
      node_type: appPlogconcept.nodeType,
      intro_sec: appPlogconcept.introSec,
      source_quote: appPlogconcept.sourceQuote,
      opening_question: appPloglearningobject.openingQuestion,
      hint_ladder: sql<string | null>`${appPloglearningobject.hintLadder}::text`.as("hint_ladder"),
      misconceptions: sql<string | null>`${appPloglearningobject.misconceptions}::text`.as(
        "misconceptions",
      ),
      canonical_order: sql<string | null>`${appPloglearningobject.canonicalOrder}::text`.as(
        "canonical_order",
      ),
      worked_examples: sql<string | null>`${appPloglearningobject.workedExamples}::text`.as(
        "worked_examples",
      ),
      waypoints: sql<string | null>`${appPloglearningobject.waypoints}::text`.as("waypoints"),
    })
    .from(appPlogconcept)
    .leftJoin(
      appPloglearningobject,
      eq(appPloglearningobject.conceptId, appPlogconcept.id),
    )
    .where(and(eq(appPlogconcept.id, conceptId), eq(appPlogconcept.videoId, videoId)))
    .limit(1);
  return rows.length === 0 ? null : mapConcept(rows[0] as Record<string, unknown>);
}

async function fetchEdgeItem(
  db: Db,
  edgeId: number,
  videoId: number,
): Promise<PlogEdgeItem | null> {
  const result = await db.execute(sql`
    SELECT e.id, e.source_id, e.target_id, e.edge_type, e.quote,
           sc.label AS source_label, tc.label AS target_label
      FROM app_plogedge e
      JOIN app_plogconcept sc ON sc.id = e.source_id
      JOIN app_plogconcept tc ON tc.id = e.target_id
     WHERE e.id = ${edgeId} AND e.video_id = ${videoId}
  `);
  const rows = result.rows as Array<Record<string, unknown>>;
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    id: Number(r.id),
    source_id: Number(r.source_id),
    source_label: r.source_label as string,
    target_id: Number(r.target_id),
    target_label: r.target_label as string,
    edge_type: r.edge_type as string,
    quote: r.quote as string,
  };
}

async function videoOwnedBy(db: Db, videoId: number, userId: number): Promise<boolean> {
  const rows = await db
    .select({ id: appVideo.id })
    .from(appVideo)
    .where(and(eq(appVideo.id, videoId), eq(appVideo.userId, userId)))
    .limit(1);
  return rows.length > 0;
}

/**
 * Plog グラフ（PlogGraphView）。所有者のみ（未所有/不在は notFound→404 "Video not found."）。
 * build job 無し→build_status="missing"の空グラフ。concepts は intro_sec,id 順、edges は id 順、
 * label は source/target concept を join。学習オブジェクト(JSON)は LEFT JOIN。
 */
export async function getPlogGraph(
  env: Bindings,
  videoId: number,
  userId: number,
): Promise<{ notFound: true } | PlogGraph> {
  return withDb(env, async (db) => {
    if (!(await videoOwnedBy(db, videoId, userId))) {
      return { notFound: true } as const;
    }

    const jobRows = await db
      .select({
        status: appPlogbuildjob.status,
        input_tokens: appPlogbuildjob.inputTokens,
        output_tokens: appPlogbuildjob.outputTokens,
        error_message: appPlogbuildjob.errorMessage,
      })
      .from(appPlogbuildjob)
      .where(eq(appPlogbuildjob.videoId, videoId))
      .orderBy(desc(appPlogbuildjob.createdAt))
      .limit(1);

    if (jobRows.length === 0) {
      return {
        video_id: videoId,
        build_status: "missing",
        input_tokens: 0,
        output_tokens: 0,
        error_message: "",
        summary_node_count: 0,
        concepts: [],
        edges: [],
      };
    }
    const j = jobRows[0];

    const conceptsRes = await db.execute(sql`
      SELECT c.id, c.label, c.node_type, c.intro_sec, c.source_quote,
             lo.opening_question,
             lo.hint_ladder::text     AS hint_ladder,
             lo.misconceptions::text  AS misconceptions,
             lo.canonical_order::text AS canonical_order,
             lo.worked_examples::text AS worked_examples,
             lo.waypoints::text       AS waypoints
        FROM app_plogconcept c
        LEFT JOIN app_ploglearningobject lo ON lo.concept_id = c.id
       WHERE c.video_id = ${videoId}
       ORDER BY c.intro_sec, c.id
    `);
    const edgesRes = await db.execute(sql`
      SELECT e.id, e.source_id, e.target_id, e.edge_type, e.quote,
             sc.label AS source_label, tc.label AS target_label
        FROM app_plogedge e
        JOIN app_plogconcept sc ON sc.id = e.source_id
        JOIN app_plogconcept tc ON tc.id = e.target_id
       WHERE e.video_id = ${videoId}
       ORDER BY e.id
    `);
    const sumRes = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(appPlogsummarynode)
      .where(eq(appPlogsummarynode.videoId, videoId));

    const concepts: PlogConceptNode[] = (conceptsRes.rows as Array<Record<string, unknown>>).map(
      mapConcept,
    );
    const edges: PlogEdgeItem[] = (edgesRes.rows as Array<Record<string, unknown>>).map((r) => ({
      id: Number(r.id),
      source_id: Number(r.source_id),
      source_label: r.source_label as string,
      target_id: Number(r.target_id),
      target_label: r.target_label as string,
      edge_type: r.edge_type as string,
      quote: r.quote as string,
    }));

    return {
      video_id: videoId,
      build_status: j.status,
      input_tokens: j.input_tokens,
      output_tokens: j.output_tokens,
      error_message: j.error_message,
      summary_node_count: sumRes[0].c,
      concepts,
      edges,
    };
  });
}

/**
 * 学習者状態（PlogLearnerStateView）。user × video の LearnerConceptState + concept.label。
 * 未所有/不在は notFound→404 "Video not found."。
 */
export async function getPlogLearnerState(
  env: Bindings,
  videoId: number,
  userId: number,
): Promise<{ notFound: true } | { states: LearnerStateItem[] }> {
  return withDb(env, async (db) => {
    if (!(await videoOwnedBy(db, videoId, userId))) {
      return { notFound: true } as const;
    }

    const rows = await db
      .select({
        concept_id: appLearnerconceptstate.conceptId,
        label: appPlogconcept.label,
        reached: appLearnerconceptstate.reached,
        hint_index: appLearnerconceptstate.hintIndex,
        last_grade: appLearnerconceptstate.lastGrade,
        active: appLearnerconceptstate.active,
      })
      .from(appLearnerconceptstate)
      .innerJoin(appPlogconcept, eq(appPlogconcept.id, appLearnerconceptstate.conceptId))
      .where(
        and(eq(appLearnerconceptstate.userId, userId), eq(appPlogconcept.videoId, videoId)),
      )
      .orderBy(asc(appLearnerconceptstate.id));

    return {
      states: rows.map((r) => ({
        concept_id: Number(r.concept_id),
        label: r.label,
        reached: r.reached,
        hint_index: r.hint_index,
        last_grade: r.last_grade,
        active: r.active,
      })),
    };
  });
}

// PlogBuildJobEntity 相当（rebuild レスポンスで使う id/status）。
export type PlogBuildJob = { id: number; status: string };

/** 最新の build job（created_at DESC 先頭）。無ければ null。 */
export async function getLatestBuildJob(
  env: Bindings,
  videoId: number,
): Promise<PlogBuildJob | null> {
  return withDb(env, async (db) => {
    const rows = await db
      .select({ id: appPlogbuildjob.id, status: appPlogbuildjob.status })
      .from(appPlogbuildjob)
      .where(eq(appPlogbuildjob.videoId, videoId))
      .orderBy(desc(appPlogbuildjob.createdAt))
      .limit(1);
    if (rows.length === 0) return null;
    return { id: Number(rows[0].id), status: rows[0].status };
  });
}

/** build job を新規作成（status='pending'）。作成した {id, status} を返す。 */
export async function createBuildJob(
  env: Bindings,
  videoId: number,
): Promise<PlogBuildJob> {
  return withDb(env, async (db) => {
    const rows = await db
      .insert(appPlogbuildjob)
      .values({
        videoId,
        status: "pending",
        errorMessage: "",
        inputTokens: 0,
        outputTokens: 0,
        createdAt: sql`CURRENT_TIMESTAMP`,
        updatedAt: sql`CURRENT_TIMESTAMP`,
        finishedAt: null,
      })
      .returning({ id: appPlogbuildjob.id, status: appPlogbuildjob.status });
    return { id: Number(rows[0].id), status: rows[0].status };
  });
}

// ---------------------------------------------------------------------------
// 書き込み（EditPlogGraphUseCase / ResetLearnerStateUseCase）
// ---------------------------------------------------------------------------

export class PlogConflictError extends Error {
  readonly name = "PlogConflictError";
}

export class PlogEditError extends Error {
  readonly name = "PlogEditError";
}

/** 所有者確認。無ければ notFound。 */
export async function requireOwnedVideo(
  env: Bindings,
  videoId: number,
  userId: number,
): Promise<{ notFound: true } | { ok: true }> {
  return withDb(env, async (db) =>
    (await videoOwnedBy(db, videoId, userId))
      ? ({ ok: true } as const)
      : ({ notFound: true } as const),
  );
}

/**
 * ensure_ready_build_job 相当。
 * ready ならそのまま / pending|running なら編集不可 / それ以外は ready ジョブを作成。
 */
export async function ensureReadyBuildJob(
  env: Bindings,
  videoId: number,
): Promise<void> {
  return withDb(env, async (db) => {
    const rows = await db
      .select({ status: appPlogbuildjob.status })
      .from(appPlogbuildjob)
      .where(eq(appPlogbuildjob.videoId, videoId))
      .orderBy(desc(appPlogbuildjob.createdAt))
      .limit(1);
    if (rows.length > 0) {
      const status = rows[0].status;
      if (status === "ready") return;
      if (status === "pending" || status === "running") {
        throw new PlogEditError("Cannot edit graph while a rebuild is in progress.");
      }
    }
    await db.insert(appPlogbuildjob).values({
      videoId,
      status: "ready",
      errorMessage: "",
      inputTokens: 0,
      outputTokens: 0,
      createdAt: sql`CURRENT_TIMESTAMP`,
      updatedAt: sql`CURRENT_TIMESTAMP`,
      finishedAt: null,
    });
  });
}

export async function getConceptNode(
  env: Bindings,
  conceptId: number,
  videoId: number,
): Promise<PlogConceptNode | null> {
  return withDb(env, async (db) => fetchConceptNode(db, conceptId, videoId));
}

export type ConceptRow = {
  id: number;
  label: string;
  node_type: string;
  intro_sec: number;
  source_quote: string;
};

export async function getConceptRow(
  env: Bindings,
  conceptId: number,
  videoId: number,
): Promise<ConceptRow | null> {
  return withDb(env, async (db) => {
    const rows = await db
      .select({
        id: appPlogconcept.id,
        label: appPlogconcept.label,
        node_type: appPlogconcept.nodeType,
        intro_sec: appPlogconcept.introSec,
        source_quote: appPlogconcept.sourceQuote,
      })
      .from(appPlogconcept)
      .where(and(eq(appPlogconcept.id, conceptId), eq(appPlogconcept.videoId, videoId)))
      .limit(1);
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      id: Number(r.id),
      label: r.label,
      node_type: r.node_type,
      intro_sec: Number(r.intro_sec),
      source_quote: r.source_quote ?? "",
    };
  });
}

export async function createConcept(
  env: Bindings,
  params: {
    videoId: number;
    label: string;
    nodeType: string;
    introSec: number;
    sourceQuote: string;
    embedding: readonly number[];
  },
): Promise<PlogConceptNode> {
  return withDb(env, async (db) =>
    db.transaction(async (tx) => {
      let conceptId: number;
      try {
        const rows = await tx
          .insert(appPlogconcept)
          .values({
            videoId: params.videoId,
            label: params.label.slice(0, 255),
            nodeType: params.nodeType,
            introSec: params.introSec,
            sourceQuote: params.sourceQuote,
            embedding: [...params.embedding],
            createdAt: sql`CURRENT_TIMESTAMP`,
          })
          .returning({ id: appPlogconcept.id });
        conceptId = Number(rows[0].id);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "";
        if (msg.includes("plog_concept_unique_label_per_video") || msg.includes("unique")) {
          throw new PlogConflictError("A concept with this label already exists.");
        }
        throw e;
      }

      await tx.execute(sql`
        INSERT INTO app_ploglearningobject
           (concept_id, opening_question, hint_ladder, misconceptions, canonical_order,
            worked_examples, waypoints, created_at)
         VALUES (${conceptId}, '', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb,
                 CURRENT_TIMESTAMP)
         ON CONFLICT (concept_id) DO NOTHING
      `);

      const concept = await fetchConceptNode(tx, conceptId, params.videoId);
      return concept!;
    }),
  );
}

export async function updateConcept(
  env: Bindings,
  params: {
    conceptId: number;
    videoId: number;
    label?: string;
    nodeType?: string;
    introSec?: number;
    sourceQuote?: string;
    embedding?: readonly number[];
  },
): Promise<PlogConceptNode | null> {
  return withDb(env, async (db) => {
    const set: Record<string, unknown> = {};
    if (params.label !== undefined) set.label = params.label.slice(0, 255);
    if (params.nodeType !== undefined) set.nodeType = params.nodeType;
    if (params.introSec !== undefined) set.introSec = params.introSec;
    if (params.sourceQuote !== undefined) set.sourceQuote = params.sourceQuote;
    if (params.embedding !== undefined) set.embedding = [...params.embedding];

    if (Object.keys(set).length === 0) {
      return fetchConceptNode(db, params.conceptId, params.videoId);
    }

    try {
      const rows = await db
        .update(appPlogconcept)
        .set(set)
        .where(
          and(eq(appPlogconcept.id, params.conceptId), eq(appPlogconcept.videoId, params.videoId)),
        )
        .returning({ id: appPlogconcept.id });
      if (rows.length === 0) return null;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "";
      if (msg.includes("plog_concept_unique_label_per_video") || msg.includes("unique")) {
        throw new PlogConflictError("A concept with this label already exists.");
      }
      throw e;
    }
    return fetchConceptNode(db, params.conceptId, params.videoId);
  });
}

/**
 * concept 削除。DB に ON DELETE CASCADE が無いため依存を明示削除する
 * （Django ORM collector 相当: learner → LO → edges → concept）。
 */
export async function deleteConcept(
  env: Bindings,
  conceptId: number,
  videoId: number,
): Promise<boolean> {
  return withDb(env, async (db) =>
    db.transaction(async (tx) => {
      const exists = await tx
        .select({ id: appPlogconcept.id })
        .from(appPlogconcept)
        .where(and(eq(appPlogconcept.id, conceptId), eq(appPlogconcept.videoId, videoId)))
        .limit(1);
      if (exists.length === 0) return false;

      await tx
        .delete(appLearnerconceptstate)
        .where(eq(appLearnerconceptstate.conceptId, conceptId));
      await tx
        .delete(appPloglearningobject)
        .where(eq(appPloglearningobject.conceptId, conceptId));
      await tx
        .delete(appPlogedge)
        .where(
          and(
            eq(appPlogedge.videoId, videoId),
            or(eq(appPlogedge.sourceId, conceptId), eq(appPlogedge.targetId, conceptId)),
          ),
        );
      const deleted = await tx
        .delete(appPlogconcept)
        .where(and(eq(appPlogconcept.id, conceptId), eq(appPlogconcept.videoId, videoId)))
        .returning({ id: appPlogconcept.id });
      return deleted.length > 0;
    }),
  );
}

export type OrderingEdgePair = { id: number; source_id: number; target_id: number; edge_type: string };

/** ordering 辺の一覧（DAG 検証用）。 */
export async function listOrderingEdges(
  env: Bindings,
  videoId: number,
): Promise<OrderingEdgePair[]> {
  return withDb(env, async (db) => {
    const rows = await db
      .select({
        id: appPlogedge.id,
        source_id: appPlogedge.sourceId,
        target_id: appPlogedge.targetId,
        edge_type: appPlogedge.edgeType,
      })
      .from(appPlogedge)
      .where(
        and(
          eq(appPlogedge.videoId, videoId),
          inArray(appPlogedge.edgeType, ["prerequisite_of", "builds_on"]),
        ),
      );
    return rows.map((r) => ({
      id: Number(r.id),
      source_id: Number(r.source_id),
      target_id: Number(r.target_id),
      edge_type: r.edge_type,
    }));
  });
}

export type EdgeRow = {
  id: number;
  source_id: number;
  target_id: number;
  edge_type: string;
  quote: string;
};

export async function getEdgeRow(
  env: Bindings,
  edgeId: number,
  videoId: number,
): Promise<EdgeRow | null> {
  return withDb(env, async (db) => {
    const rows = await db
      .select({
        id: appPlogedge.id,
        source_id: appPlogedge.sourceId,
        target_id: appPlogedge.targetId,
        edge_type: appPlogedge.edgeType,
        quote: appPlogedge.quote,
      })
      .from(appPlogedge)
      .where(and(eq(appPlogedge.id, edgeId), eq(appPlogedge.videoId, videoId)))
      .limit(1);
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      id: Number(r.id),
      source_id: Number(r.source_id),
      target_id: Number(r.target_id),
      edge_type: r.edge_type,
      quote: r.quote ?? "",
    };
  });
}

export async function createEdge(
  env: Bindings,
  params: {
    videoId: number;
    sourceId: number;
    targetId: number;
    edgeType: string;
    quote: string;
  },
): Promise<PlogEdgeItem> {
  return withDb(env, async (db) => {
    let edgeId: number;
    try {
      const rows = await db
        .insert(appPlogedge)
        .values({
          videoId: params.videoId,
          sourceId: params.sourceId,
          targetId: params.targetId,
          edgeType: params.edgeType,
          quote: params.quote,
          validationStatus: "validated",
          createdAt: sql`CURRENT_TIMESTAMP`,
        })
        .returning({ id: appPlogedge.id });
      edgeId = Number(rows[0].id);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "";
      if (msg.includes("plog_edge_unique_typed_pair") || msg.includes("unique")) {
        throw new PlogConflictError("This edge already exists.");
      }
      throw e;
    }
    const item = await fetchEdgeItem(db, edgeId, params.videoId);
    return item!;
  });
}

export async function updateEdge(
  env: Bindings,
  params: {
    edgeId: number;
    videoId: number;
    sourceId?: number;
    targetId?: number;
    edgeType?: string;
    quote?: string;
  },
): Promise<PlogEdgeItem | null> {
  return withDb(env, async (db) => {
    const set: Record<string, unknown> = {};
    if (params.sourceId !== undefined) set.sourceId = params.sourceId;
    if (params.targetId !== undefined) set.targetId = params.targetId;
    if (params.edgeType !== undefined) set.edgeType = params.edgeType;
    if (params.quote !== undefined) set.quote = params.quote;
    if (Object.keys(set).length === 0) {
      return fetchEdgeItem(db, params.edgeId, params.videoId);
    }

    try {
      const rows = await db
        .update(appPlogedge)
        .set(set)
        .where(and(eq(appPlogedge.id, params.edgeId), eq(appPlogedge.videoId, params.videoId)))
        .returning({ id: appPlogedge.id });
      if (rows.length === 0) return null;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "";
      if (msg.includes("plog_edge_unique_typed_pair") || msg.includes("unique")) {
        throw new PlogConflictError("This edge already exists.");
      }
      throw e;
    }
    return fetchEdgeItem(db, params.edgeId, params.videoId);
  });
}

export async function deleteEdge(
  env: Bindings,
  edgeId: number,
  videoId: number,
): Promise<boolean> {
  return withDb(env, async (db) => {
    const rows = await db
      .delete(appPlogedge)
      .where(and(eq(appPlogedge.id, edgeId), eq(appPlogedge.videoId, videoId)))
      .returning({ id: appPlogedge.id });
    return rows.length > 0;
  });
}

export async function updateLearningObject(
  env: Bindings,
  params: {
    conceptId: number;
    videoId: number;
    openingQuestion?: string;
    hintLadder?: unknown[];
    misconceptions?: unknown[];
    canonicalOrder?: unknown[];
    workedExamples?: unknown[];
    waypoints?: unknown[];
  },
): Promise<PlogConceptNode | null> {
  return withDb(env, async (db) => {
    const exists = await db
      .select({ id: appPlogconcept.id })
      .from(appPlogconcept)
      .where(and(eq(appPlogconcept.id, params.conceptId), eq(appPlogconcept.videoId, params.videoId)))
      .limit(1);
    if (exists.length === 0) return null;

    await db.execute(sql`
      INSERT INTO app_ploglearningobject
         (concept_id, opening_question, hint_ladder, misconceptions, canonical_order,
          worked_examples, waypoints, created_at)
       VALUES (${params.conceptId}, '', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb,
               CURRENT_TIMESTAMP)
       ON CONFLICT (concept_id) DO NOTHING
    `);

    const set: Record<string, unknown> = {};
    if (params.openingQuestion !== undefined) set.openingQuestion = params.openingQuestion;
    if (params.hintLadder !== undefined) set.hintLadder = params.hintLadder.map(String);
    if (params.misconceptions !== undefined) set.misconceptions = params.misconceptions.map(String);
    if (params.canonicalOrder !== undefined) set.canonicalOrder = params.canonicalOrder.map(String);
    if (params.workedExamples !== undefined) set.workedExamples = params.workedExamples.map(String);
    if (params.waypoints !== undefined) set.waypoints = params.waypoints;

    if (Object.keys(set).length > 0) {
      await db
        .update(appPloglearningobject)
        .set(set)
        .where(eq(appPloglearningobject.conceptId, params.conceptId));
    }
    return fetchConceptNode(db, params.conceptId, params.videoId);
  });
}

/**
 * merge_concepts（Paper §3.1）。absorb → survivor へ辺・LO・learner を寄せて absorb を削除。
 */
export async function mergeConcepts(
  env: Bindings,
  videoId: number,
  survivorId: number,
  absorbId: number,
): Promise<PlogConceptNode | null> {
  return withDb(env, async (db) =>
    db.transaction(async (tx) => {
      const concepts = await tx
        .select({ id: appPlogconcept.id })
        .from(appPlogconcept)
        .where(
          and(
            eq(appPlogconcept.videoId, videoId),
            inArray(appPlogconcept.id, [survivorId, absorbId]),
          ),
        );
      if (concepts.length !== 2) return null;

      const fromAbsorb = await tx
        .select({
          id: appPlogedge.id,
          target_id: appPlogedge.targetId,
          edge_type: appPlogedge.edgeType,
        })
        .from(appPlogedge)
        .where(and(eq(appPlogedge.videoId, videoId), eq(appPlogedge.sourceId, absorbId)));

      for (const e of fromAbsorb) {
        if (Number(e.target_id) === survivorId) {
          await tx.delete(appPlogedge).where(eq(appPlogedge.id, e.id));
          continue;
        }
        const dup = await tx
          .select({ id: appPlogedge.id })
          .from(appPlogedge)
          .where(
            and(
              eq(appPlogedge.videoId, videoId),
              eq(appPlogedge.sourceId, survivorId),
              eq(appPlogedge.targetId, e.target_id),
              eq(appPlogedge.edgeType, e.edge_type),
            ),
          )
          .limit(1);
        if (dup.length > 0) {
          await tx.delete(appPlogedge).where(eq(appPlogedge.id, e.id));
        } else {
          await tx
            .update(appPlogedge)
            .set({ sourceId: survivorId })
            .where(eq(appPlogedge.id, e.id));
        }
      }

      const toAbsorb = await tx
        .select({
          id: appPlogedge.id,
          source_id: appPlogedge.sourceId,
          edge_type: appPlogedge.edgeType,
        })
        .from(appPlogedge)
        .where(and(eq(appPlogedge.videoId, videoId), eq(appPlogedge.targetId, absorbId)));

      for (const e of toAbsorb) {
        if (Number(e.source_id) === survivorId) {
          await tx.delete(appPlogedge).where(eq(appPlogedge.id, e.id));
          continue;
        }
        const dup = await tx
          .select({ id: appPlogedge.id })
          .from(appPlogedge)
          .where(
            and(
              eq(appPlogedge.videoId, videoId),
              eq(appPlogedge.sourceId, e.source_id),
              eq(appPlogedge.targetId, survivorId),
              eq(appPlogedge.edgeType, e.edge_type),
            ),
          )
          .limit(1);
        if (dup.length > 0) {
          await tx.delete(appPlogedge).where(eq(appPlogedge.id, e.id));
        } else {
          await tx
            .update(appPlogedge)
            .set({ targetId: survivorId })
            .where(eq(appPlogedge.id, e.id));
        }
      }

      await tx.execute(sql`
        INSERT INTO app_ploglearningobject
           (concept_id, opening_question, hint_ladder, misconceptions, canonical_order,
            worked_examples, waypoints, created_at)
         VALUES (${survivorId}, '', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb,
                 CURRENT_TIMESTAMP)
         ON CONFLICT (concept_id) DO NOTHING
      `);

      const survivorLoRes = await tx.execute(sql`
        SELECT opening_question, hint_ladder::text, misconceptions::text,
               canonical_order::text, worked_examples::text, waypoints::text
          FROM app_ploglearningobject WHERE concept_id = ${survivorId}
      `);
      const absorbLoRes = await tx.execute(sql`
        SELECT opening_question, hint_ladder::text, misconceptions::text,
               canonical_order::text, worked_examples::text, waypoints::text
          FROM app_ploglearningobject WHERE concept_id = ${absorbId}
      `);

      if (absorbLoRes.rows.length > 0) {
        const s = survivorLoRes.rows[0] as Record<string, string | null>;
        const a = absorbLoRes.rows[0] as Record<string, string | null>;
        let opening = s.opening_question ?? "";
        if (!opening.trim() && a.opening_question) opening = a.opening_question;

        const mergeList = (leftRaw: string | null, rightRaw: string | null): unknown[] => {
          const left = leftRaw ? (JSON.parse(leftRaw) as unknown[]) : [];
          const right = rightRaw ? (JSON.parse(rightRaw) as unknown[]) : [];
          const merged: unknown[] = [];
          const seen = new Set<string>();
          for (const item of [...left, ...right]) {
            const key = stableKey(item);
            if (seen.has(key)) continue;
            seen.add(key);
            merged.push(item);
          }
          return merged;
        };

        await tx.execute(sql`
          UPDATE app_ploglearningobject SET
             opening_question = ${opening},
             hint_ladder = ${JSON.stringify(mergeList(s.hint_ladder, a.hint_ladder))}::jsonb,
             misconceptions = ${JSON.stringify(mergeList(s.misconceptions, a.misconceptions))}::jsonb,
             canonical_order = ${JSON.stringify(mergeList(s.canonical_order, a.canonical_order))}::jsonb,
             worked_examples = ${JSON.stringify(mergeList(s.worked_examples, a.worked_examples))}::jsonb,
             waypoints = ${JSON.stringify(mergeList(s.waypoints, a.waypoints))}::jsonb
           WHERE concept_id = ${survivorId}
        `);
      }

      const absorbStates = await tx
        .select({
          id: appLearnerconceptstate.id,
          user_id: appLearnerconceptstate.userId,
          reached: appLearnerconceptstate.reached,
          hint_index: appLearnerconceptstate.hintIndex,
          last_grade: appLearnerconceptstate.lastGrade,
          active: appLearnerconceptstate.active,
        })
        .from(appLearnerconceptstate)
        .where(eq(appLearnerconceptstate.conceptId, absorbId));

      for (const state of absorbStates) {
        const existing = await tx
          .select({
            id: appLearnerconceptstate.id,
            reached: appLearnerconceptstate.reached,
            hint_index: appLearnerconceptstate.hintIndex,
            last_grade: appLearnerconceptstate.lastGrade,
            active: appLearnerconceptstate.active,
          })
          .from(appLearnerconceptstate)
          .where(
            and(
              eq(appLearnerconceptstate.userId, state.user_id),
              eq(appLearnerconceptstate.conceptId, survivorId),
            ),
          )
          .limit(1);

        if (existing.length === 0) {
          await tx
            .update(appLearnerconceptstate)
            .set({ conceptId: survivorId })
            .where(eq(appLearnerconceptstate.id, state.id));
        } else {
          const ex = existing[0];
          await tx
            .update(appLearnerconceptstate)
            .set({
              reached: Boolean(ex.reached) || Boolean(state.reached),
              hintIndex: Math.max(Number(ex.hint_index), Number(state.hint_index)),
              active: Boolean(ex.active) || Boolean(state.active),
              lastGrade: ex.last_grade || state.last_grade || "",
            })
            .where(eq(appLearnerconceptstate.id, ex.id));
          await tx.delete(appLearnerconceptstate).where(eq(appLearnerconceptstate.id, state.id));
        }
      }

      await tx
        .delete(appLearnerconceptstate)
        .where(eq(appLearnerconceptstate.conceptId, absorbId));
      await tx
        .delete(appPloglearningobject)
        .where(eq(appPloglearningobject.conceptId, absorbId));
      await tx
        .delete(appPlogedge)
        .where(
          and(
            eq(appPlogedge.videoId, videoId),
            or(eq(appPlogedge.sourceId, absorbId), eq(appPlogedge.targetId, absorbId)),
          ),
        );
      await tx
        .delete(appPlogconcept)
        .where(and(eq(appPlogconcept.id, absorbId), eq(appPlogconcept.videoId, videoId)));

      return fetchConceptNode(tx, survivorId, videoId);
    }),
  );
}

/** ResetLearnerStateUseCase: 当該 user×video の learner state を全削除。件数を返す。 */
export async function resetLearnerStates(
  env: Bindings,
  userId: number,
  videoId: number,
): Promise<{ notFound: true } | { deleted: number }> {
  return withDb(env, async (db) => {
    if (!(await videoOwnedBy(db, videoId, userId))) {
      return { notFound: true } as const;
    }
    const result = await db.execute(sql`
      DELETE FROM app_learnerconceptstate
       WHERE user_id = ${userId}
         AND concept_id IN (SELECT id FROM app_plogconcept WHERE video_id = ${videoId})
    `);
    return { deleted: result.rowCount ?? 0 };
  });
}

/**
 * Study モード用グラフ読み込み（Django `list_ready_graphs`）。
 * 最新 build job が `ready` の動画だけ、concepts(+embedding)/edges/LO/summary を返す。
 */
export async function listReadyGraphs(
  env: Bindings,
  videoIds: readonly number[],
): Promise<PlogGraphSnapshot[]> {
  if (videoIds.length === 0) return [];

  return withDb(env, async (db) => {
    const ready: PlogGraphSnapshot[] = [];
    for (const videoId of videoIds) {
      const jobRows = await db
        .select({ status: appPlogbuildjob.status })
        .from(appPlogbuildjob)
        .where(eq(appPlogbuildjob.videoId, videoId))
        .orderBy(desc(appPlogbuildjob.createdAt))
        .limit(1);
      if (jobRows.length === 0 || jobRows[0].status !== "ready") continue;

      const conceptsRes = await db.execute(sql`
        SELECT c.id, c.video_id, c.label, c.node_type, c.intro_sec, c.source_quote,
               c.embedding::text AS embedding,
               lo.id AS lo_id, lo.opening_question,
               lo.hint_ladder::text AS hint_ladder,
               lo.misconceptions::text AS misconceptions,
               lo.canonical_order::text AS canonical_order,
               lo.worked_examples::text AS worked_examples,
               lo.waypoints::text AS waypoints
          FROM app_plogconcept c
          LEFT JOIN app_ploglearningobject lo ON lo.concept_id = c.id
         WHERE c.video_id = ${videoId}
         ORDER BY c.intro_sec, c.id
      `);
      const edgesRes = await db
        .select({
          id: appPlogedge.id,
          video_id: appPlogedge.videoId,
          source_id: appPlogedge.sourceId,
          target_id: appPlogedge.targetId,
          edge_type: appPlogedge.edgeType,
          quote: appPlogedge.quote,
        })
        .from(appPlogedge)
        .where(eq(appPlogedge.videoId, videoId))
        .orderBy(asc(appPlogedge.id));
      const sumRes = await db
        .select({
          id: appPlogsummarynode.id,
          video_id: appPlogsummarynode.videoId,
          parent_id: appPlogsummarynode.parentId,
          level: appPlogsummarynode.level,
          text: appPlogsummarynode.text,
          start_sec: appPlogsummarynode.startSec,
          end_sec: appPlogsummarynode.endSec,
        })
        .from(appPlogsummarynode)
        .where(eq(appPlogsummarynode.videoId, videoId))
        .orderBy(asc(appPlogsummarynode.level), asc(appPlogsummarynode.startSec));

      const concepts: PlogConcept[] = [];
      const learning_objects: Record<number, PlogLearningObject> = {};
      for (const r of conceptsRes.rows as Array<Record<string, unknown>>) {
        let embedding: number[] = [];
        try {
          const raw = r.embedding ? JSON.parse(r.embedding as string) : [];
          embedding = Array.isArray(raw) ? raw.map(Number) : [];
        } catch {
          embedding = [];
        }
        const conceptId = Number(r.id);
        concepts.push({
          id: conceptId,
          video_id: Number(r.video_id),
          label: r.label as string,
          node_type: r.node_type as string,
          intro_sec: Number(r.intro_sec),
          source_quote: (r.source_quote as string) ?? "",
          embedding,
        });
        if (r.lo_id != null) {
          learning_objects[conceptId] = {
            id: Number(r.lo_id),
            concept_id: conceptId,
            opening_question: (r.opening_question as string) ?? "",
            hint_ladder: parseArr(r.hint_ladder).map(String),
            misconceptions: parseArr(r.misconceptions).map(String),
            canonical_order: parseArr(r.canonical_order).map(String),
            worked_examples: parseArr(r.worked_examples).map(String),
            waypoints: parseArr(r.waypoints) as Record<string, unknown>[],
          };
        }
      }
      const edges: PlogEdge[] = edgesRes.map((r) => ({
        id: Number(r.id),
        video_id: Number(r.video_id),
        source_id: Number(r.source_id),
        target_id: Number(r.target_id),
        edge_type: r.edge_type,
        quote: r.quote ?? "",
      }));
      const summary_nodes: PlogSummaryNode[] = sumRes.map((r) => ({
        id: Number(r.id),
        video_id: Number(r.video_id),
        parent_id: r.parent_id == null ? null : Number(r.parent_id),
        level: Number(r.level),
        text: r.text ?? "",
        start_sec: Number(r.start_sec),
        end_sec: Number(r.end_sec),
      }));

      ready.push({
        video_id: videoId,
        concepts,
        edges,
        learning_objects,
        summary_nodes,
        build_status: "ready",
      });
    }
    return ready;
  });
}

/** Study の citation / L0 用。title + transcript をまとめて取得。 */
export async function getVideoTitleAndTranscript(
  env: Bindings,
  videoId: number,
): Promise<{ title: string; transcript: string } | null> {
  return withDb(env, async (db) => {
    const rows = await db
      .select({ title: appVideo.title, transcript: appVideo.transcript })
      .from(appVideo)
      .where(eq(appVideo.id, videoId))
      .limit(1);
    if (rows.length === 0) return null;
    return {
      title: rows[0].title || `Video ${videoId}`,
      transcript: rows[0].transcript || "",
    };
  });
}
