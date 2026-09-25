import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { type Db, withDb } from "../db/pool";
import { isUniqueViolation } from "../db/errors";
import {
  learnerConceptStates,
  plogBuildJobs,
  plogConcepts,
  plogEdges,
  plogLearningObjects,
  plogSummaryNodes,
  videos,
} from "../db/schema";
import type { PlogGraphSnapshot } from "../lib/plog-runtime";
import type { PlogWaypoint } from "@videoq/trpc";
import { EDGE_TYPES, ORDERING, isDag } from "../lib/plog-ordering";
import { parseStoredEmbedding } from "../lib/embedding-contract";
import { stableKey } from "../shared/canonical-json";
import { insertJobTask } from "./external-task-repository";
import { buildJobMessage, JOB_BUILD_PLOG } from "../lib/job-message";
import type { Bindings } from "../types/bindings";

// PLOG API が返す concept / edge の表現。
export type PlogConceptNode = {
  id: number;
  label: string;
  node_type: string;
  intro_sec: number;
  source_quote: string;
  opening_question: string;
  hint_ladder: string[];
  misconceptions: string[];
  canonical_order: string[];
  worked_examples: string[];
  waypoints: PlogWaypoint[];
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
  provenance: "generated" | "edited" | "unknown";
};

/** Historical accepted/validated values do not establish authorship or review. */
function edgeProvenance(status: unknown): PlogEdgeItem["provenance"] {
  return status === "generated" || status === "edited" ? status : "unknown";
}
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
const parseStringArr = (v: unknown): string[] => parseArr(v).map(String);
// Older builds stored { text, level }; array order determines the hint rung.
const parseHintLadder = (v: unknown): string[] => parseArr(v).map((hint) =>
  typeof hint === "object" && hint !== null && "text" in hint && typeof hint.text === "string"
    ? hint.text
    : String(hint),
);
const parseWaypoints = (v: unknown): PlogWaypoint[] =>
  parseArr(v).flatMap((item) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) return [];
    const waypoint = item as Record<string, unknown>;
    return [{
      ...(typeof waypoint.start_sec === "number" ? { start_sec: waypoint.start_sec } : {}),
      ...(typeof waypoint.end_sec === "number" ? { end_sec: waypoint.end_sec } : {}),
      ...(typeof waypoint.start_time === "string" ? { start_time: waypoint.start_time } : {}),
      ...(typeof waypoint.end_time === "string" ? { end_time: waypoint.end_time } : {}),
      ...(typeof waypoint.label === "string" ? { label: waypoint.label } : {}),
    }];
  });

function mapConcept(r: Record<string, unknown>): PlogConceptNode {
  const hint_ladder = parseHintLadder(r.hint_ladder);
  const waypoints = parseWaypoints(r.waypoints);
  return {
    id: Number(r.id),
    label: r.label as string,
    node_type: r.node_type as string,
    intro_sec: Number(r.intro_sec),
    source_quote: (r.source_quote as string) ?? "",
    opening_question: (r.opening_question as string) ?? "",
    hint_ladder,
    misconceptions: parseStringArr(r.misconceptions),
    canonical_order: parseStringArr(r.canonical_order),
    worked_examples: parseStringArr(r.worked_examples),
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
      id: plogConcepts.id,
      label: plogConcepts.label,
      node_type: plogConcepts.nodeType,
      intro_sec: plogConcepts.introSec,
      source_quote: plogConcepts.sourceQuote,
      opening_question: plogLearningObjects.openingQuestion,
      hint_ladder: sql<string | null>`${plogLearningObjects.hintLadder}::text`.as("hint_ladder"),
      misconceptions: sql<string | null>`${plogLearningObjects.misconceptions}::text`.as(
        "misconceptions",
      ),
      canonical_order: sql<string | null>`${plogLearningObjects.canonicalOrder}::text`.as(
        "canonical_order",
      ),
      worked_examples: sql<string | null>`${plogLearningObjects.workedExamples}::text`.as(
        "worked_examples",
      ),
      waypoints: sql<string | null>`${plogLearningObjects.waypoints}::text`.as("waypoints"),
    })
    .from(plogConcepts)
    .leftJoin(
      plogLearningObjects,
      eq(plogLearningObjects.conceptId, plogConcepts.id),
    )
    .where(and(eq(plogConcepts.id, conceptId), eq(plogConcepts.videoId, videoId)))
    .limit(1);
  return rows.length === 0 ? null : mapConcept(rows[0] as Record<string, unknown>);
}

async function fetchEdgeItem(
  db: Db,
  edgeId: number,
  videoId: number,
): Promise<PlogEdgeItem | null> {
  const result = await db.execute(sql`
    SELECT e.id, e.source_id, e.target_id, e.edge_type, e.quote, e.validation_status,
           sc.label AS source_label, tc.label AS target_label
      FROM plog_edges e
      JOIN plog_concepts sc ON sc.id = e.source_id
      JOIN plog_concepts tc ON tc.id = e.target_id
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
    provenance: edgeProvenance(r.validation_status),
  };
}

async function videoOwnedBy(db: Db, videoId: number, userId: string): Promise<boolean> {
  const rows = await db
    .select({ id: videos.id })
    .from(videos)
    .where(and(eq(videos.id, videoId), eq(videos.userId, userId)))
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
  userId: string,
): Promise<{ notFound: true } | PlogGraph> {
  return withDb(env, async (db) => {
    if (!(await videoOwnedBy(db, videoId, userId))) {
      return { notFound: true } as const;
    }

    const jobRows = await db
      .select({
        status: plogBuildJobs.status,
        input_tokens: plogBuildJobs.inputTokens,
        output_tokens: plogBuildJobs.outputTokens,
        error_message: plogBuildJobs.errorMessage,
      })
      .from(plogBuildJobs)
      .where(eq(plogBuildJobs.videoId, videoId))
      .orderBy(desc(plogBuildJobs.createdAt), desc(plogBuildJobs.id))
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
        FROM plog_concepts c
        LEFT JOIN plog_learning_objects lo ON lo.concept_id = c.id
       WHERE c.video_id = ${videoId}
       ORDER BY c.intro_sec, c.id
    `);
    const edgesRes = await db.execute(sql`
      SELECT e.id, e.source_id, e.target_id, e.edge_type, e.quote, e.validation_status,
             sc.label AS source_label, tc.label AS target_label
        FROM plog_edges e
        JOIN plog_concepts sc ON sc.id = e.source_id
        JOIN plog_concepts tc ON tc.id = e.target_id
       WHERE e.video_id = ${videoId}
       ORDER BY e.id
    `);
    const sumRes = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(plogSummaryNodes)
      .where(eq(plogSummaryNodes.videoId, videoId));

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
      provenance: edgeProvenance(r.validation_status),
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
  userId: string,
): Promise<{ notFound: true } | { states: LearnerStateItem[] }> {
  return withDb(env, async (db) => {
    if (!(await videoOwnedBy(db, videoId, userId))) {
      return { notFound: true } as const;
    }

    const rows = await db
      .select({
        concept_id: learnerConceptStates.conceptId,
        label: plogConcepts.label,
        reached: learnerConceptStates.reached,
        hint_index: learnerConceptStates.hintIndex,
        last_grade: learnerConceptStates.lastGrade,
        active: learnerConceptStates.active,
      })
      .from(learnerConceptStates)
      .innerJoin(plogConcepts, eq(plogConcepts.id, learnerConceptStates.conceptId))
      .where(
        and(eq(learnerConceptStates.userId, userId), eq(plogConcepts.videoId, videoId)),
      )
      .orderBy(asc(learnerConceptStates.id));

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

// rebuild レスポンスで使う build job の id/status。
export type PlogBuildJob = { id: number; status: string };
export type ActivePlogBuildJob = PlogBuildJob & {
  taskId: number | null;
};

/**
 * 動画ごとの active build job を1件だけ確保する。
 * 動画ロックの下で所有者と字幕を確認し、作成者だけが配送taskを確保する。
 */
export async function getOrCreateActiveBuildJob(
  env: Bindings,
  videoId: number,
  userId: string,
): Promise<ActivePlogBuildJob | { notFound: string }> {
  return withDb(env, async (db) =>
    db.transaction(async (tx) => {
      const [video] = await tx
        .select({ hasTranscript: sql<boolean>`COALESCE(${videos.transcript}, '') <> ''` })
        .from(videos)
        .where(and(eq(videos.id, videoId), eq(videos.userId, userId)))
        .for("update");
      if (!video) return { notFound: "Video not found." };
      if (!video.hasTranscript) return { notFound: "Transcript not found." };
      const inserted = await tx
        .insert(plogBuildJobs)
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
        .onConflictDoNothing()
        .returning({ id: plogBuildJobs.id, status: plogBuildJobs.status });
      if (inserted.length > 0) {
        const buildJobId = Number(inserted[0].id);
        const message = buildJobMessage(JOB_BUILD_PLOG, { video_id: videoId });
        const task = await insertJobTask(tx, {
          message,
          dedupeKey: `plog-build:${buildJobId}`,
        });
        return {
          id: buildJobId,
          status: inserted[0].status,
          taskId: task.id,
        };
      }

      // The worker can finish after our conflicting INSERT. Its build still
      // satisfies this request, even if its status is no longer active.
      const latest = await tx
        .select({ id: plogBuildJobs.id, status: plogBuildJobs.status })
        .from(plogBuildJobs)
        .where(eq(plogBuildJobs.videoId, videoId))
        .orderBy(desc(plogBuildJobs.id))
        .limit(1);
      if (latest.length === 0) {
        throw new Error("PLOG build job disappeared during creation.");
      }
      return {
        id: Number(latest[0].id),
        status: latest[0].status,
        taskId: null,
      };
    }),
  );
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

async function lockEditableGraph(db: Db, videoId: number): Promise<void> {
  await db.execute(sql`SELECT 1 FROM videos WHERE id = ${videoId} FOR UPDATE`);
  const active = await db
    .select({ status: plogBuildJobs.status })
    .from(plogBuildJobs)
    .where(
      and(
        eq(plogBuildJobs.videoId, videoId),
        inArray(plogBuildJobs.status, ["pending", "running"]),
      ),
    )
    .limit(1);
  if (active.some((row) => row.status === "pending" || row.status === "running")) {
    throw new PlogEditError("Cannot edit graph while a rebuild is in progress.");
  }
}

async function assertOrderingDagInTransaction(
  db: Db,
  videoId: number,
  proposed: { sourceId: number; targetId: number; edgeType: string },
  excludeEdgeId?: number,
): Promise<void> {
  if (!ORDERING.has(proposed.edgeType)) return;
  const rows = await db
    .select({
      id: plogEdges.id,
      sourceId: plogEdges.sourceId,
      targetId: plogEdges.targetId,
    })
    .from(plogEdges)
    .where(
      and(
        eq(plogEdges.videoId, videoId),
        inArray(plogEdges.edgeType, [...ORDERING]),
      ),
    );
  const pairs: [string, string][] = rows
    .filter((row) => excludeEdgeId === undefined || Number(row.id) !== excludeEdgeId)
    .map((row) => [String(row.sourceId), String(row.targetId)]);
  pairs.push([String(proposed.sourceId), String(proposed.targetId)]);
  if (!isDag(pairs)) {
    throw new PlogEditError("Ordering edges must form a DAG (cycle detected).");
  }
}

async function assertValidEdgeInTransaction(
  db: Db,
  videoId: number,
  proposed: { sourceId: number; targetId: number; edgeType: string },
  excludeEdgeId?: number,
): Promise<void> {
  if (!EDGE_TYPES.has(proposed.edgeType)) {
    throw new PlogEditError(`Invalid edge_type: ${proposed.edgeType}`);
  }
  if (proposed.sourceId === proposed.targetId) {
    throw new PlogEditError("source_id and target_id must differ");
  }
  const concepts = await db
    .select({ id: plogConcepts.id })
    .from(plogConcepts)
    .where(and(
      eq(plogConcepts.videoId, videoId),
      inArray(plogConcepts.id, [proposed.sourceId, proposed.targetId]),
    ));
  const ids = new Set(concepts.map(concept => Number(concept.id)));
  if (!ids.has(proposed.sourceId)) {
    throw new PlogEditError("source_id does not exist for this video");
  }
  if (!ids.has(proposed.targetId)) {
    throw new PlogEditError("target_id does not exist for this video");
  }
  await assertOrderingDagInTransaction(db, videoId, proposed, excludeEdgeId);
}

/** 所有者確認。無ければ notFound。 */
export async function requireOwnedVideo(
  env: Bindings,
  videoId: number,
  userId: string,
): Promise<{ notFound: true } | { ok: true }> {
  return withDb(env, async (db) =>
    (await videoOwnedBy(db, videoId, userId))
      ? ({ ok: true } as const)
      : ({ notFound: true } as const),
  );
}

/** Called after lockEditableGraph; the ready job commits with the new graph item. */
async function ensureReadyBuildJob(
  db: Db,
  videoId: number,
): Promise<void> {
  const rows = await db
    .select({ status: plogBuildJobs.status })
    .from(plogBuildJobs)
    .where(eq(plogBuildJobs.videoId, videoId))
    .orderBy(desc(plogBuildJobs.createdAt), desc(plogBuildJobs.id))
    .limit(1);
  if (rows[0]?.status === "ready") return;
  await db.insert(plogBuildJobs).values({
    videoId,
    status: "ready",
    errorMessage: "",
    inputTokens: 0,
    outputTokens: 0,
    createdAt: sql`CURRENT_TIMESTAMP`,
    updatedAt: sql`CURRENT_TIMESTAMP`,
    finishedAt: null,
  });
}

export async function getConceptLabel(
  env: Bindings,
  conceptId: number,
  videoId: number,
): Promise<string | null> {
  return withDb(env, async (db) => {
    const rows = await db
      .select({ label: plogConcepts.label })
      .from(plogConcepts)
      .where(and(eq(plogConcepts.id, conceptId), eq(plogConcepts.videoId, videoId)))
      .limit(1);
    return rows[0]?.label ?? null;
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
      await lockEditableGraph(tx, params.videoId);
      await ensureReadyBuildJob(tx, params.videoId);
      let conceptId: number;
      try {
        const rows = await tx
          .insert(plogConcepts)
          .values({
            videoId: params.videoId,
            label: params.label.slice(0, 255),
            nodeType: params.nodeType,
            introSec: params.introSec,
            sourceQuote: params.sourceQuote,
            embedding: [...params.embedding],
            createdAt: sql`CURRENT_TIMESTAMP`,
          })
          .returning({ id: plogConcepts.id });
        conceptId = Number(rows[0].id);
      } catch (e: unknown) {
        if (isUniqueViolation(e)) {
          throw new PlogConflictError("A concept with this label already exists.");
        }
        throw e;
      }

      await tx.execute(sql`
        INSERT INTO plog_learning_objects
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
  return withDb(env, async (db) =>
    db.transaction(async (tx) => {
    await lockEditableGraph(tx, params.videoId);
    // Reusing the stored embedding is safe only while its label still matches.
    const reuseEmbedding = params.label !== undefined && params.embedding === undefined;
    const set: Record<string, unknown> = {};
    if (params.label !== undefined) set.label = params.label.slice(0, 255);
    if (params.nodeType !== undefined) set.nodeType = params.nodeType;
    if (params.introSec !== undefined) set.introSec = params.introSec;
    if (params.sourceQuote !== undefined) set.sourceQuote = params.sourceQuote;
    if (params.embedding !== undefined) set.embedding = [...params.embedding];

    if (Object.keys(set).length === 0) {
      return fetchConceptNode(tx, params.conceptId, params.videoId);
    }

    try {
      const rows = await tx
        .update(plogConcepts)
        .set(set)
        .where(
          and(
            eq(plogConcepts.id, params.conceptId),
            eq(plogConcepts.videoId, params.videoId),
            reuseEmbedding ? eq(plogConcepts.label, params.label!.slice(0, 255)) : undefined,
          ),
        )
        .returning({ id: plogConcepts.id });
      if (rows.length === 0) {
        if (reuseEmbedding) {
          const existing = await tx.select({ id: plogConcepts.id }).from(plogConcepts)
            .where(and(eq(plogConcepts.id, params.conceptId), eq(plogConcepts.videoId, params.videoId)))
            .limit(1);
          if (existing.length > 0) {
            throw new PlogConflictError("Concept label changed. Please retry the edit.");
          }
        }
        return null;
      }
    } catch (e: unknown) {
      if (isUniqueViolation(e)) {
        throw new PlogConflictError("A concept with this label already exists.");
      }
      throw e;
    }
    return fetchConceptNode(tx, params.conceptId, params.videoId);
    }),
  );
}

/** Concept deletion cascades to learner states, learning objects, and incident edges. */
export async function deleteConcept(
  env: Bindings,
  conceptId: number,
  videoId: number,
): Promise<boolean> {
  return withDb(env, async (db) =>
    db.transaction(async (tx) => {
      await lockEditableGraph(tx, videoId);
      const deleted = await tx
        .delete(plogConcepts)
        .where(and(eq(plogConcepts.id, conceptId), eq(plogConcepts.videoId, videoId)))
        .returning({ id: plogConcepts.id });
      return deleted.length > 0;
    }),
  );
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
  return withDb(env, async (db) =>
    db.transaction(async (tx) => {
      await lockEditableGraph(tx, params.videoId);
      await assertValidEdgeInTransaction(tx, params.videoId, params);
      await ensureReadyBuildJob(tx, params.videoId);
      let edgeId: number;
      try {
        const rows = await tx
          .insert(plogEdges)
          .values({
            videoId: params.videoId,
            sourceId: params.sourceId,
            targetId: params.targetId,
            edgeType: params.edgeType,
            quote: params.quote,
            validationStatus: "edited",
            createdAt: sql`CURRENT_TIMESTAMP`,
          })
          .returning({ id: plogEdges.id });
        edgeId = Number(rows[0].id);
      } catch (e: unknown) {
        if (isUniqueViolation(e)) {
          throw new PlogConflictError("This edge already exists.");
        }
        throw e;
      }
      const item = await fetchEdgeItem(tx, edgeId, params.videoId);
      return item!;
    }),
  );
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
  return withDb(env, async (db) =>
    db.transaction(async (tx) => {
      await lockEditableGraph(tx, params.videoId);
      if (params.sourceId !== undefined || params.targetId !== undefined || params.edgeType !== undefined) {
        const current = await tx
          .select({
            sourceId: plogEdges.sourceId,
            targetId: plogEdges.targetId,
            edgeType: plogEdges.edgeType,
          })
          .from(plogEdges)
          .where(and(eq(plogEdges.id, params.edgeId), eq(plogEdges.videoId, params.videoId)))
          .limit(1);
        if (current.length === 0) return null;
        await assertValidEdgeInTransaction(
          tx,
          params.videoId,
          {
            sourceId: params.sourceId ?? Number(current[0].sourceId),
            targetId: params.targetId ?? Number(current[0].targetId),
            edgeType: params.edgeType ?? current[0].edgeType,
          },
          params.edgeId,
        );
      }

      const set: Record<string, unknown> = {};
      if (params.sourceId !== undefined) set.sourceId = params.sourceId;
      if (params.targetId !== undefined) set.targetId = params.targetId;
      if (params.edgeType !== undefined) set.edgeType = params.edgeType;
      if (params.quote !== undefined) set.quote = params.quote;
      if (Object.keys(set).length === 0) {
        return fetchEdgeItem(tx, params.edgeId, params.videoId);
      }
      set.validationStatus = "edited";

      try {
        const rows = await tx
          .update(plogEdges)
          .set(set)
          .where(and(eq(plogEdges.id, params.edgeId), eq(plogEdges.videoId, params.videoId)))
          .returning({ id: plogEdges.id });
        if (rows.length === 0) return null;
      } catch (e: unknown) {
        if (isUniqueViolation(e)) {
          throw new PlogConflictError("This edge already exists.");
        }
        throw e;
      }
      return fetchEdgeItem(tx, params.edgeId, params.videoId);
    }),
  );
}

export async function deleteEdge(
  env: Bindings,
  edgeId: number,
  videoId: number,
): Promise<boolean> {
  return withDb(env, async (db) =>
    db.transaction(async (tx) => {
      await lockEditableGraph(tx, videoId);
      const rows = await tx
        .delete(plogEdges)
        .where(and(eq(plogEdges.id, edgeId), eq(plogEdges.videoId, videoId)))
        .returning({ id: plogEdges.id });
      return rows.length > 0;
    }),
  );
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
  return withDb(env, async (db) =>
    db.transaction(async (tx) => {
    await lockEditableGraph(tx, params.videoId);
    const exists = await tx
      .select({ id: plogConcepts.id })
      .from(plogConcepts)
      .where(and(eq(plogConcepts.id, params.conceptId), eq(plogConcepts.videoId, params.videoId)))
      .limit(1);
    if (exists.length === 0) return null;

    await tx.execute(sql`
      INSERT INTO plog_learning_objects
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
      await tx
        .update(plogLearningObjects)
        .set(set)
        .where(eq(plogLearningObjects.conceptId, params.conceptId));
    }
    return fetchConceptNode(tx, params.conceptId, params.videoId);
    }),
  );
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
      await lockEditableGraph(tx, videoId);
      const concepts = await tx
        .select({ id: plogConcepts.id })
        .from(plogConcepts)
        .where(
          and(
            eq(plogConcepts.videoId, videoId),
            inArray(plogConcepts.id, [survivorId, absorbId]),
          ),
        );
      if (concepts.length !== 2) return null;

      const orderingEdges = await tx
        .select({
          sourceId: plogEdges.sourceId,
          targetId: plogEdges.targetId,
        })
        .from(plogEdges)
        .where(and(eq(plogEdges.videoId, videoId), inArray(plogEdges.edgeType, [...ORDERING])));
      const pairs = orderingEdges.flatMap((edge): [string, string][] => {
        const source = Number(edge.sourceId) === absorbId ? survivorId : Number(edge.sourceId);
        const target = Number(edge.targetId) === absorbId ? survivorId : Number(edge.targetId);
        // Only edges touching the absorbed concept collapse during this merge.
        if (source === target && (Number(edge.sourceId) === absorbId || Number(edge.targetId) === absorbId)) return [];
        return [[String(source), String(target)]];
      });
      if (!isDag(pairs)) {
        throw new PlogEditError("Ordering edges must form a DAG (cycle detected).");
      }

      // Keep existing survivor edges (including their IDs/quotes), remove only
      // duplicates and collapsed edges, then rewire all remaining incident edges.
      await tx.execute(sql`
        DELETE FROM plog_edges AS edge
         WHERE edge.video_id = ${videoId}
           AND (edge.source_id = ${absorbId} OR edge.target_id = ${absorbId})
           AND (
             edge.source_id = ${survivorId} OR edge.target_id = ${survivorId}
             OR edge.source_id = edge.target_id
             OR EXISTS (
               SELECT 1 FROM plog_edges AS existing
                WHERE existing.video_id = edge.video_id
                  AND existing.edge_type = edge.edge_type
                  AND existing.source_id = CASE WHEN edge.source_id = ${absorbId} THEN ${survivorId} ELSE edge.source_id END
                  AND existing.target_id = CASE WHEN edge.target_id = ${absorbId} THEN ${survivorId} ELSE edge.target_id END
             )
           )
      `);
      await tx.execute(sql`
        UPDATE plog_edges
           SET source_id = CASE WHEN source_id = ${absorbId} THEN ${survivorId} ELSE source_id END,
               target_id = CASE WHEN target_id = ${absorbId} THEN ${survivorId} ELSE target_id END,
               validation_status = 'edited'
         WHERE video_id = ${videoId}
           AND (source_id = ${absorbId} OR target_id = ${absorbId})
      `);

      await tx.execute(sql`
        INSERT INTO plog_learning_objects
           (concept_id, opening_question, hint_ladder, misconceptions, canonical_order,
            worked_examples, waypoints, created_at)
         VALUES (${survivorId}, '', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb,
                 CURRENT_TIMESTAMP)
         ON CONFLICT (concept_id) DO NOTHING
      `);

      const learningObjects = await tx.execute(sql`
        SELECT concept_id, opening_question, hint_ladder::text, misconceptions::text,
               canonical_order::text, worked_examples::text, waypoints::text
          FROM plog_learning_objects WHERE concept_id IN (${survivorId}, ${absorbId})
      `);
      const materials = learningObjects.rows as Array<Record<string, string | null>>;
      const a = materials.find(row => Number(row.concept_id) === absorbId);

      if (a) {
        const s = materials.find(row => Number(row.concept_id) === survivorId)!;
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
          UPDATE plog_learning_objects SET
             opening_question = ${opening},
             hint_ladder = ${JSON.stringify(mergeList(s.hint_ladder, a.hint_ladder))}::jsonb,
             misconceptions = ${JSON.stringify(mergeList(s.misconceptions, a.misconceptions))}::jsonb,
             canonical_order = ${JSON.stringify(mergeList(s.canonical_order, a.canonical_order))}::jsonb,
             worked_examples = ${JSON.stringify(mergeList(s.worked_examples, a.worked_examples))}::jsonb,
             waypoints = ${JSON.stringify(mergeList(s.waypoints, a.waypoints))}::jsonb
           WHERE concept_id = ${survivorId}
        `);
      }

      await tx.execute(sql`
        UPDATE learner_concept_states AS survivor
           SET reached = survivor.reached OR absorbed.reached,
               hint_index = GREATEST(survivor.hint_index, absorbed.hint_index),
               active = survivor.active OR absorbed.active,
               last_grade = COALESCE(NULLIF(survivor.last_grade, ''), absorbed.last_grade, '')
          FROM learner_concept_states AS absorbed
         WHERE survivor.concept_id = ${survivorId}
           AND absorbed.concept_id = ${absorbId}
           AND survivor.user_id = absorbed.user_id
      `);
      // Move unmatched rows instead of reinserting them so their IDs survive.
      await tx.execute(sql`
        UPDATE learner_concept_states AS absorbed
           SET concept_id = ${survivorId}
         WHERE absorbed.concept_id = ${absorbId}
           AND NOT EXISTS (
             SELECT 1 FROM learner_concept_states AS survivor
              WHERE survivor.concept_id = ${survivorId}
                AND survivor.user_id = absorbed.user_id
           )
      `);

      // Material and progress have been merged; FKs remove the absorbed rows.
      await tx
        .delete(plogConcepts)
        .where(and(eq(plogConcepts.id, absorbId), eq(plogConcepts.videoId, videoId)));

      return fetchConceptNode(tx, survivorId, videoId);
    }),
  );
}

/** Deletes DB learner_concept_states for this owner/video; does not reset StudySession DO progress. */
export async function resetLearnerStates(
  env: Bindings,
  userId: string,
  videoId: number,
): Promise<{ notFound: true } | { deleted: number }> {
  return withDb(env, async (db) => {
    if (!(await videoOwnedBy(db, videoId, userId))) {
      return { notFound: true } as const;
    }
    const result = await db.execute(sql`
      DELETE FROM learner_concept_states
       WHERE user_id = ${userId}
         AND concept_id IN (SELECT id FROM plog_concepts WHERE video_id = ${videoId})
    `);
    return { deleted: result.rowCount ?? 0 };
  });
}

/**
 * Study モード用の ready グラフを読み込む。
 * 最新 build job が `ready` の動画だけ、concepts(+embedding)/edges/LO/summary を返す。
 */
export async function listReadyGraphs(
  env: Bindings,
  videoIds: readonly number[],
): Promise<PlogGraphSnapshot[]> {
  if (videoIds.length === 0) return [];

  return withDb(env, async (db) => {
    const latestJobs = await db
      .selectDistinctOn([plogBuildJobs.videoId], {
        video_id: plogBuildJobs.videoId,
        status: plogBuildJobs.status,
      })
      .from(plogBuildJobs)
      .where(inArray(plogBuildJobs.videoId, videoIds))
      .orderBy(asc(plogBuildJobs.videoId), desc(plogBuildJobs.createdAt), desc(plogBuildJobs.id));
    const graphs = new Map<number, PlogGraphSnapshot>();
    for (const job of latestJobs) {
      if (job.status !== "ready") continue;
      graphs.set(job.video_id, {
        video_id: job.video_id,
        concepts: [], edges: [], learning_objects: {}, summary_nodes: [],
      });
    }
    if (graphs.size === 0) return [];
    const readyIds = [...graphs.keys()];

    const conceptsRes = await db.execute(sql`
      SELECT c.id, c.video_id, c.label, c.intro_sec,
             c.embedding::text AS embedding,
             lo.id AS lo_id, lo.opening_question,
             lo.hint_ladder::text AS hint_ladder,
             lo.misconceptions::text AS misconceptions,
             lo.waypoints::text AS waypoints
        FROM plog_concepts c
        LEFT JOIN plog_learning_objects lo ON lo.concept_id = c.id
       WHERE c.video_id IN (${sql.join(readyIds.map(id => sql`${id}`), sql`, `)})
       ORDER BY c.intro_sec, c.id
    `);
    const edgesRes = await db
      .select({
        video_id: plogEdges.videoId,
        source_id: plogEdges.sourceId,
        target_id: plogEdges.targetId,
        edge_type: plogEdges.edgeType,
      })
      .from(plogEdges)
      .where(inArray(plogEdges.videoId, readyIds))
      .orderBy(asc(plogEdges.id));
    const sumRes = await db
      .select({
        video_id: plogSummaryNodes.videoId,
        level: plogSummaryNodes.level,
        text: plogSummaryNodes.text,
        start_sec: plogSummaryNodes.startSec,
        end_sec: plogSummaryNodes.endSec,
      })
      .from(plogSummaryNodes)
      .where(inArray(plogSummaryNodes.videoId, readyIds))
      .orderBy(asc(plogSummaryNodes.level), asc(plogSummaryNodes.startSec));

    for (const r of conceptsRes.rows as Array<Record<string, unknown>>) {
      const graph = graphs.get(Number(r.video_id))!;
      const embedding = parseStoredEmbedding(r.embedding);
      const conceptId = Number(r.id);
      graph.concepts.push({
        id: conceptId,
        label: r.label as string,
        intro_sec: Number(r.intro_sec),
        embedding,
      });
      if (r.lo_id != null) {
        graph.learning_objects[conceptId] = {
          opening_question: (r.opening_question as string) ?? "",
          hint_ladder: parseHintLadder(r.hint_ladder),
          misconceptions: parseArr(r.misconceptions).map(String),
          waypoints: parseArr(r.waypoints) as Record<string, unknown>[],
        };
      }
    }
    for (const r of edgesRes) {
      graphs.get(r.video_id)!.edges.push({
        source_id: Number(r.source_id),
        target_id: Number(r.target_id),
        edge_type: r.edge_type,
      });
    }
    for (const r of sumRes) {
      graphs.get(r.video_id)!.summary_nodes.push({
        level: Number(r.level),
        text: r.text ?? "",
        start_sec: Number(r.start_sec),
        end_sec: Number(r.end_sec),
      });
    }
    // Preserve the caller's course order, independently of SQL result ordering.
    return videoIds.flatMap(videoId => {
      const graph = graphs.get(videoId);
      return graph ? [graph] : [];
    });
  });
}

/** Study の citation / L0 用。title + transcript をまとめて取得。 */
export async function getVideoTitleAndTranscript(
  env: Bindings,
  videoId: number,
): Promise<{ title: string; transcript: string } | null> {
  return withDb(env, async (db) => {
    const rows = await db
      .select({ title: videos.title, transcript: videos.transcript })
      .from(videos)
      .where(eq(videos.id, videoId))
      .limit(1);
    if (rows.length === 0) return null;
    return {
      title: rows[0].title || `Video ${videoId}`,
      transcript: rows[0].transcript || "",
    };
  });
}
