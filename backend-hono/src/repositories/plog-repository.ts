import { withDb } from "../db/pool";
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
  return withDb(env, async (db, client) => {
    const owner = await client.query(
      `SELECT 1 FROM app_video WHERE id = $1 AND user_id = $2`,
      [videoId, userId],
    );
    if (owner.rowCount === 0) return { notFound: true } as const;

    const jobRes = await client.query(
      `SELECT status, input_tokens, output_tokens, error_message
         FROM app_plogbuildjob WHERE video_id = $1
        ORDER BY created_at DESC LIMIT 1`,
      [videoId],
    );
    if (jobRes.rowCount === 0) {
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
    const j = jobRes.rows[0];

    const conceptsRes = await client.query(
      `SELECT c.id, c.label, c.node_type, c.intro_sec, c.source_quote,
              lo.opening_question,
              lo.hint_ladder::text     AS hint_ladder,
              lo.misconceptions::text  AS misconceptions,
              lo.canonical_order::text AS canonical_order,
              lo.worked_examples::text AS worked_examples,
              lo.waypoints::text       AS waypoints
         FROM app_plogconcept c
         LEFT JOIN app_ploglearningobject lo ON lo.concept_id = c.id
        WHERE c.video_id = $1
        ORDER BY c.intro_sec, c.id`,
      [videoId],
    );
    const edgesRes = await client.query(
      `SELECT e.id, e.source_id, e.target_id, e.edge_type, e.quote,
              sc.label AS source_label, tc.label AS target_label
         FROM app_plogedge e
         JOIN app_plogconcept sc ON sc.id = e.source_id
         JOIN app_plogconcept tc ON tc.id = e.target_id
        WHERE e.video_id = $1
        ORDER BY e.id`,
      [videoId],
    );
    const sumRes = await client.query(
      `SELECT count(*)::int AS c FROM app_plogsummarynode WHERE video_id = $1`,
      [videoId],
    );

    const concepts: PlogConceptNode[] = conceptsRes.rows.map((r) => {
      const hint_ladder = parseArr(r.hint_ladder);
      const waypoints = parseArr(r.waypoints);
      return {
        id: Number(r.id),
        label: r.label,
        node_type: r.node_type,
        intro_sec: Number(r.intro_sec),
        source_quote: r.source_quote ?? "",
        opening_question: r.opening_question ?? "",
        hint_ladder,
        misconceptions: parseArr(r.misconceptions),
        canonical_order: parseArr(r.canonical_order),
        worked_examples: parseArr(r.worked_examples),
        waypoints,
        hint_count: hint_ladder.length,
        waypoint_count: waypoints.length,
      };
    });
    const edges: PlogEdgeItem[] = edgesRes.rows.map((r) => ({
      id: Number(r.id),
      source_id: Number(r.source_id),
      source_label: r.source_label,
      target_id: Number(r.target_id),
      target_label: r.target_label,
      edge_type: r.edge_type,
      quote: r.quote,
    }));

    return {
      video_id: videoId,
      build_status: j.status,
      input_tokens: j.input_tokens,
      output_tokens: j.output_tokens,
      error_message: j.error_message,
      summary_node_count: sumRes.rows[0].c,
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
  return withDb(env, async (db, client) => {
    const owner = await client.query(
      `SELECT 1 FROM app_video WHERE id = $1 AND user_id = $2`,
      [videoId, userId],
    );
    if (owner.rowCount === 0) return { notFound: true } as const;

    const { rows } = await client.query(
      `SELECT s.concept_id, c.label, s.reached, s.hint_index, s.last_grade, s.active
         FROM app_learnerconceptstate s
         JOIN app_plogconcept c ON c.id = s.concept_id
        WHERE s.user_id = $1 AND c.video_id = $2
        ORDER BY s.id`,
      [userId, videoId],
    );
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
  return withDb(env, async (db, client) => {
    const { rows } = await client.query(
      `SELECT id, status FROM app_plogbuildjob
        WHERE video_id = $1
        ORDER BY created_at DESC
        LIMIT 1`,
      [videoId],
    );
    if (rows.length === 0) return null;
    return { id: Number(rows[0].id), status: rows[0].status as string };
  });
}

/** build job を新規作成（status='pending'）。作成した {id, status} を返す。 */
export async function createBuildJob(
  env: Bindings,
  videoId: number,
): Promise<PlogBuildJob> {
  return withDb(env, async (db, client) => {
    const { rows } = await client.query(
      `INSERT INTO app_plogbuildjob
         (video_id, status, error_message, input_tokens, output_tokens, created_at, updated_at, finished_at)
       VALUES ($1, 'pending', '', 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL)
       RETURNING id, status`,
      [videoId],
    );
    return { id: Number(rows[0].id), status: rows[0].status as string };
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

const conceptSelect = `
  SELECT c.id, c.label, c.node_type, c.intro_sec, c.source_quote,
         lo.opening_question,
         lo.hint_ladder::text     AS hint_ladder,
         lo.misconceptions::text  AS misconceptions,
         lo.canonical_order::text AS canonical_order,
         lo.worked_examples::text AS worked_examples,
         lo.waypoints::text       AS waypoints
    FROM app_plogconcept c
    LEFT JOIN app_ploglearningobject lo ON lo.concept_id = c.id
   WHERE c.id = $1 AND c.video_id = $2`;

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

/** 所有者確認。無ければ notFound。 */
export async function requireOwnedVideo(
  env: Bindings,
  videoId: number,
  userId: number,
): Promise<{ notFound: true } | { ok: true }> {
  return withDb(env, async (db, client) => {
    const owner = await client.query(
      `SELECT 1 FROM app_video WHERE id = $1 AND user_id = $2`,
      [videoId, userId],
    );
    return owner.rowCount === 0
      ? ({ notFound: true } as const)
      : ({ ok: true } as const);
  });
}

/**
 * ensure_ready_build_job 相当。
 * ready ならそのまま / pending|running なら編集不可 / それ以外は ready ジョブを作成。
 */
export async function ensureReadyBuildJob(
  env: Bindings,
  videoId: number,
): Promise<void> {
  return withDb(env, async (db, client) => {
    const { rows } = await client.query(
      `SELECT status FROM app_plogbuildjob
        WHERE video_id = $1
        ORDER BY created_at DESC LIMIT 1`,
      [videoId],
    );
    if (rows.length > 0) {
      const status = rows[0].status as string;
      if (status === "ready") return;
      if (status === "pending" || status === "running") {
        throw new PlogEditError("Cannot edit graph while a rebuild is in progress.");
      }
    }
    await client.query(
      `INSERT INTO app_plogbuildjob
         (video_id, status, error_message, input_tokens, output_tokens, created_at, updated_at, finished_at)
       VALUES ($1, 'ready', '', 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL)`,
      [videoId],
    );
  });
}

export async function getConceptNode(
  env: Bindings,
  conceptId: number,
  videoId: number,
): Promise<PlogConceptNode | null> {
  return withDb(env, async (db, client) => {
    const { rows } = await client.query(conceptSelect, [conceptId, videoId]);
    return rows.length === 0 ? null : mapConcept(rows[0]);
  });
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
  return withDb(env, async (db, client) => {
    const { rows } = await client.query(
      `SELECT id, label, node_type, intro_sec, source_quote
         FROM app_plogconcept WHERE id = $1 AND video_id = $2`,
      [conceptId, videoId],
    );
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
  return withDb(env, async (db, client) => {
    await client.query("BEGIN");
    try {
      let rows;
      try {
        ({ rows } = await client.query(
          `INSERT INTO app_plogconcept
             (video_id, label, node_type, intro_sec, source_quote, embedding, created_at)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb, CURRENT_TIMESTAMP)
           RETURNING id`,
          [
            params.videoId,
            params.label.slice(0, 255),
            params.nodeType,
            params.introSec,
            params.sourceQuote,
            JSON.stringify([...params.embedding]),
          ],
        ));
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "";
        if (msg.includes("plog_concept_unique_label_per_video") || msg.includes("unique")) {
          throw new PlogConflictError("A concept with this label already exists.");
        }
        throw e;
      }
      const conceptId = Number(rows[0].id);
      await client.query(
        `INSERT INTO app_ploglearningobject
           (concept_id, opening_question, hint_ladder, misconceptions, canonical_order,
            worked_examples, waypoints, created_at)
         VALUES ($1, '', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb,
                 CURRENT_TIMESTAMP)
         ON CONFLICT (concept_id) DO NOTHING`,
        [conceptId],
      );
      const concept = await client.query(conceptSelect, [conceptId, params.videoId]);
      await client.query("COMMIT");
      return mapConcept(concept.rows[0]);
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  });
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
  return withDb(env, async (db, client) => {
    const sets: string[] = [];
    const args: unknown[] = [];
    const push = (sql: string, v: unknown) => {
      args.push(v);
      sets.push(`${sql} $${args.length}`);
    };
    if (params.label !== undefined) push("label =", params.label.slice(0, 255));
    if (params.nodeType !== undefined) push("node_type =", params.nodeType);
    if (params.introSec !== undefined) push("intro_sec =", params.introSec);
    if (params.sourceQuote !== undefined) push("source_quote =", params.sourceQuote);
    if (params.embedding !== undefined) {
      args.push(JSON.stringify([...params.embedding]));
      sets.push(`embedding = $${args.length}::jsonb`);
    }

    if (sets.length === 0) {
      const { rows } = await client.query(conceptSelect, [
        params.conceptId,
        params.videoId,
      ]);
      return rows.length === 0 ? null : mapConcept(rows[0]);
    }

    args.push(params.conceptId, params.videoId);
    try {
      const r = await client.query(
        `UPDATE app_plogconcept SET ${sets.join(", ")}
          WHERE id = $${args.length - 1} AND video_id = $${args.length}
        RETURNING id`,
        args,
      );
      if (r.rowCount === 0) return null;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "";
      if (msg.includes("plog_concept_unique_label_per_video") || msg.includes("unique")) {
        throw new PlogConflictError("A concept with this label already exists.");
      }
      throw e;
    }
    const { rows } = await client.query(conceptSelect, [
      params.conceptId,
      params.videoId,
    ]);
    return mapConcept(rows[0]);
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
  return withDb(env, async (db, client) => {
    await client.query("BEGIN");
    try {
      const exists = await client.query(
        `SELECT 1 FROM app_plogconcept WHERE id = $1 AND video_id = $2`,
        [conceptId, videoId],
      );
      if (exists.rowCount === 0) {
        await client.query("ROLLBACK");
        return false;
      }
      await client.query(`DELETE FROM app_learnerconceptstate WHERE concept_id = $1`, [
        conceptId,
      ]);
      await client.query(`DELETE FROM app_ploglearningobject WHERE concept_id = $1`, [
        conceptId,
      ]);
      await client.query(
        `DELETE FROM app_plogedge
          WHERE video_id = $1 AND (source_id = $2 OR target_id = $2)`,
        [videoId, conceptId],
      );
      await client.query(`DELETE FROM app_plogconcept WHERE id = $1 AND video_id = $2`, [
        conceptId,
        videoId,
      ]);
      await client.query("COMMIT");
      return true;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  });
}

export type OrderingEdgePair = { id: number; source_id: number; target_id: number; edge_type: string };

/** ordering 辺の一覧（DAG 検証用）。 */
export async function listOrderingEdges(
  env: Bindings,
  videoId: number,
): Promise<OrderingEdgePair[]> {
  return withDb(env, async (db, client) => {
    const { rows } = await client.query(
      `SELECT id, source_id, target_id, edge_type FROM app_plogedge
        WHERE video_id = $1
          AND edge_type IN ('prerequisite_of', 'builds_on')`,
      [videoId],
    );
    return rows.map((r) => ({
      id: Number(r.id),
      source_id: Number(r.source_id),
      target_id: Number(r.target_id),
      edge_type: r.edge_type as string,
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
  return withDb(env, async (db, client) => {
    const { rows } = await client.query(
      `SELECT id, source_id, target_id, edge_type, quote
         FROM app_plogedge WHERE id = $1 AND video_id = $2`,
      [edgeId, videoId],
    );
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

async function fetchEdgeItem(
  client: { query: (sql: string, args?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> },
  edgeId: number,
  videoId: number,
): Promise<PlogEdgeItem | null> {
  const { rows } = await client.query(
    `SELECT e.id, e.source_id, e.target_id, e.edge_type, e.quote,
            sc.label AS source_label, tc.label AS target_label
       FROM app_plogedge e
       JOIN app_plogconcept sc ON sc.id = e.source_id
       JOIN app_plogconcept tc ON tc.id = e.target_id
      WHERE e.id = $1 AND e.video_id = $2`,
    [edgeId, videoId],
  );
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
  return withDb(env, async (db, client) => {
    let rows;
    try {
      ({ rows } = await client.query(
        `INSERT INTO app_plogedge
           (video_id, source_id, target_id, edge_type, quote, validation_status, created_at)
         VALUES ($1, $2, $3, $4, $5, 'validated', CURRENT_TIMESTAMP)
         RETURNING id`,
        [
          params.videoId,
          params.sourceId,
          params.targetId,
          params.edgeType,
          params.quote,
        ],
      ));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "";
      if (msg.includes("plog_edge_unique_typed_pair") || msg.includes("unique")) {
        throw new PlogConflictError("This edge already exists.");
      }
      throw e;
    }
    const item = await fetchEdgeItem(client, Number(rows[0].id), params.videoId);
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
  return withDb(env, async (db, client) => {
    const sets: string[] = [];
    const args: unknown[] = [];
    const push = (sql: string, v: unknown) => {
      args.push(v);
      sets.push(`${sql} $${args.length}`);
    };
    if (params.sourceId !== undefined) push("source_id =", params.sourceId);
    if (params.targetId !== undefined) push("target_id =", params.targetId);
    if (params.edgeType !== undefined) push("edge_type =", params.edgeType);
    if (params.quote !== undefined) push("quote =", params.quote);
    if (sets.length === 0) return fetchEdgeItem(client, params.edgeId, params.videoId);

    args.push(params.edgeId, params.videoId);
    try {
      const r = await client.query(
        `UPDATE app_plogedge SET ${sets.join(", ")}
          WHERE id = $${args.length - 1} AND video_id = $${args.length}
        RETURNING id`,
        args,
      );
      if (r.rowCount === 0) return null;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "";
      if (msg.includes("plog_edge_unique_typed_pair") || msg.includes("unique")) {
        throw new PlogConflictError("This edge already exists.");
      }
      throw e;
    }
    return fetchEdgeItem(client, params.edgeId, params.videoId);
  });
}

export async function deleteEdge(
  env: Bindings,
  edgeId: number,
  videoId: number,
): Promise<boolean> {
  return withDb(env, async (db, client) => {
    const r = await client.query(
      `DELETE FROM app_plogedge WHERE id = $1 AND video_id = $2`,
      [edgeId, videoId],
    );
    return (r.rowCount ?? 0) > 0;
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
  return withDb(env, async (db, client) => {
    const exists = await client.query(
      `SELECT 1 FROM app_plogconcept WHERE id = $1 AND video_id = $2`,
      [params.conceptId, params.videoId],
    );
    if (exists.rowCount === 0) return null;

    await client.query(
      `INSERT INTO app_ploglearningobject
         (concept_id, opening_question, hint_ladder, misconceptions, canonical_order,
          worked_examples, waypoints, created_at)
       VALUES ($1, '', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb,
               CURRENT_TIMESTAMP)
       ON CONFLICT (concept_id) DO NOTHING`,
      [params.conceptId],
    );

    const sets: string[] = [];
    const args: unknown[] = [];
    const pushJson = (col: string, v: unknown) => {
      args.push(JSON.stringify(v));
      sets.push(`${col} = $${args.length}::jsonb`);
    };
    if (params.openingQuestion !== undefined) {
      args.push(params.openingQuestion);
      sets.push(`opening_question = $${args.length}`);
    }
    if (params.hintLadder !== undefined)
      pushJson("hint_ladder", params.hintLadder.map(String));
    if (params.misconceptions !== undefined)
      pushJson("misconceptions", params.misconceptions.map(String));
    if (params.canonicalOrder !== undefined)
      pushJson("canonical_order", params.canonicalOrder.map(String));
    if (params.workedExamples !== undefined)
      pushJson("worked_examples", params.workedExamples.map(String));
    if (params.waypoints !== undefined) pushJson("waypoints", params.waypoints);

    if (sets.length > 0) {
      args.push(params.conceptId);
      await client.query(
        `UPDATE app_ploglearningobject SET ${sets.join(", ")}
          WHERE concept_id = $${args.length}`,
        args,
      );
    }
    const { rows } = await client.query(conceptSelect, [
      params.conceptId,
      params.videoId,
    ]);
    return mapConcept(rows[0]);
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
  return withDb(env, async (db, client) => {
    await client.query("BEGIN");
    try {
      const concepts = await client.query(
        `SELECT id FROM app_plogconcept
          WHERE video_id = $1 AND id = ANY($2::bigint[])`,
        [videoId, [survivorId, absorbId]],
      );
      if (concepts.rowCount !== 2) {
        await client.query("ROLLBACK");
        return null;
      }

      // Rewire edges from absorb as source
      const fromAbsorb = await client.query(
        `SELECT id, target_id, edge_type FROM app_plogedge
          WHERE video_id = $1 AND source_id = $2`,
        [videoId, absorbId],
      );
      for (const e of fromAbsorb.rows) {
        if (Number(e.target_id) === survivorId) {
          await client.query(`DELETE FROM app_plogedge WHERE id = $1`, [e.id]);
          continue;
        }
        const dup = await client.query(
          `SELECT 1 FROM app_plogedge
            WHERE video_id = $1 AND source_id = $2 AND target_id = $3 AND edge_type = $4`,
          [videoId, survivorId, e.target_id, e.edge_type],
        );
        if ((dup.rowCount ?? 0) > 0) {
          await client.query(`DELETE FROM app_plogedge WHERE id = $1`, [e.id]);
        } else {
          await client.query(`UPDATE app_plogedge SET source_id = $1 WHERE id = $2`, [
            survivorId,
            e.id,
          ]);
        }
      }

      // Rewire edges to absorb as target
      const toAbsorb = await client.query(
        `SELECT id, source_id, edge_type FROM app_plogedge
          WHERE video_id = $1 AND target_id = $2`,
        [videoId, absorbId],
      );
      for (const e of toAbsorb.rows) {
        if (Number(e.source_id) === survivorId) {
          await client.query(`DELETE FROM app_plogedge WHERE id = $1`, [e.id]);
          continue;
        }
        const dup = await client.query(
          `SELECT 1 FROM app_plogedge
            WHERE video_id = $1 AND source_id = $2 AND target_id = $3 AND edge_type = $4`,
          [videoId, e.source_id, survivorId, e.edge_type],
        );
        if ((dup.rowCount ?? 0) > 0) {
          await client.query(`DELETE FROM app_plogedge WHERE id = $1`, [e.id]);
        } else {
          await client.query(`UPDATE app_plogedge SET target_id = $1 WHERE id = $2`, [
            survivorId,
            e.id,
          ]);
        }
      }

      // Merge learning objects
      await client.query(
        `INSERT INTO app_ploglearningobject
           (concept_id, opening_question, hint_ladder, misconceptions, canonical_order,
            worked_examples, waypoints, created_at)
         VALUES ($1, '', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb,
                 CURRENT_TIMESTAMP)
         ON CONFLICT (concept_id) DO NOTHING`,
        [survivorId],
      );
      const survivorLo = await client.query(
        `SELECT opening_question, hint_ladder::text, misconceptions::text,
                canonical_order::text, worked_examples::text, waypoints::text
           FROM app_ploglearningobject WHERE concept_id = $1`,
        [survivorId],
      );
      const absorbLo = await client.query(
        `SELECT opening_question, hint_ladder::text, misconceptions::text,
                canonical_order::text, worked_examples::text, waypoints::text
           FROM app_ploglearningobject WHERE concept_id = $1`,
        [absorbId],
      );
      if (absorbLo.rowCount && absorbLo.rowCount > 0) {
        const s = survivorLo.rows[0];
        const a = absorbLo.rows[0];
        let opening = (s.opening_question as string) ?? "";
        if (!opening.trim() && a.opening_question) opening = a.opening_question as string;

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

        await client.query(
          `UPDATE app_ploglearningobject SET
             opening_question = $1,
             hint_ladder = $2::jsonb,
             misconceptions = $3::jsonb,
             canonical_order = $4::jsonb,
             worked_examples = $5::jsonb,
             waypoints = $6::jsonb
           WHERE concept_id = $7`,
          [
            opening,
            JSON.stringify(mergeList(s.hint_ladder, a.hint_ladder)),
            JSON.stringify(mergeList(s.misconceptions, a.misconceptions)),
            JSON.stringify(mergeList(s.canonical_order, a.canonical_order)),
            JSON.stringify(mergeList(s.worked_examples, a.worked_examples)),
            JSON.stringify(mergeList(s.waypoints, a.waypoints)),
            survivorId,
          ],
        );
      }

      // Merge learner states
      const absorbStates = await client.query(
        `SELECT id, user_id, reached, hint_index, last_grade, active
           FROM app_learnerconceptstate WHERE concept_id = $1`,
        [absorbId],
      );
      for (const state of absorbStates.rows) {
        const existing = await client.query(
          `SELECT id, reached, hint_index, last_grade, active
             FROM app_learnerconceptstate
            WHERE user_id = $1 AND concept_id = $2`,
          [state.user_id, survivorId],
        );
        if (existing.rowCount === 0) {
          await client.query(
            `UPDATE app_learnerconceptstate SET concept_id = $1 WHERE id = $2`,
            [survivorId, state.id],
          );
        } else {
          const ex = existing.rows[0];
          // Django: reached |= , hint_index = max, active は absorb が true で既存 false のときだけ true、
          // last_grade は既存が空のときだけ absorb を採用。
          await client.query(
            `UPDATE app_learnerconceptstate SET
               reached = $1, hint_index = $2, active = $3, last_grade = $4
             WHERE id = $5`,
            [
              Boolean(ex.reached) || Boolean(state.reached),
              Math.max(Number(ex.hint_index), Number(state.hint_index)),
              Boolean(ex.active) || Boolean(state.active),
              (ex.last_grade as string) || (state.last_grade as string) || "",
              ex.id,
            ],
          );
          await client.query(`DELETE FROM app_learnerconceptstate WHERE id = $1`, [
            state.id,
          ]);
        }
      }

      // Delete absorb (children first — no DB CASCADE)
      await client.query(`DELETE FROM app_learnerconceptstate WHERE concept_id = $1`, [
        absorbId,
      ]);
      await client.query(`DELETE FROM app_ploglearningobject WHERE concept_id = $1`, [
        absorbId,
      ]);
      await client.query(
        `DELETE FROM app_plogedge
          WHERE video_id = $1 AND (source_id = $2 OR target_id = $2)`,
        [videoId, absorbId],
      );
      await client.query(`DELETE FROM app_plogconcept WHERE id = $1 AND video_id = $2`, [
        absorbId,
        videoId,
      ]);

      const { rows } = await client.query(conceptSelect, [survivorId, videoId]);
      await client.query("COMMIT");
      return mapConcept(rows[0]);
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  });
}

/** ResetLearnerStateUseCase: 当該 user×video の learner state を全削除。件数を返す。 */
export async function resetLearnerStates(
  env: Bindings,
  userId: number,
  videoId: number,
): Promise<{ notFound: true } | { deleted: number }> {
  return withDb(env, async (db, client) => {
    const owner = await client.query(
      `SELECT 1 FROM app_video WHERE id = $1 AND user_id = $2`,
      [videoId, userId],
    );
    if (owner.rowCount === 0) return { notFound: true } as const;
    const r = await client.query(
      `DELETE FROM app_learnerconceptstate
        WHERE user_id = $1
          AND concept_id IN (SELECT id FROM app_plogconcept WHERE video_id = $2)`,
      [userId, videoId],
    );
    return { deleted: r.rowCount ?? 0 };
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

  return withDb(env, async (db, client) => {
    const ready: PlogGraphSnapshot[] = [];
    for (const videoId of videoIds) {
      const jobRes = await client.query(
        `SELECT status FROM app_plogbuildjob
          WHERE video_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [videoId],
      );
      if (jobRes.rowCount === 0 || jobRes.rows[0].status !== "ready") continue;

      const conceptsRes = await client.query(
        `SELECT c.id, c.video_id, c.label, c.node_type, c.intro_sec, c.source_quote,
                c.embedding::text AS embedding,
                lo.id AS lo_id, lo.opening_question,
                lo.hint_ladder::text AS hint_ladder,
                lo.misconceptions::text AS misconceptions,
                lo.canonical_order::text AS canonical_order,
                lo.worked_examples::text AS worked_examples,
                lo.waypoints::text AS waypoints
           FROM app_plogconcept c
           LEFT JOIN app_ploglearningobject lo ON lo.concept_id = c.id
          WHERE c.video_id = $1
          ORDER BY c.intro_sec, c.id`,
        [videoId],
      );
      const edgesRes = await client.query(
        `SELECT id, video_id, source_id, target_id, edge_type, quote
           FROM app_plogedge WHERE video_id = $1 ORDER BY id`,
        [videoId],
      );
      const sumRes = await client.query(
        `SELECT id, video_id, parent_id, level, text, start_sec, end_sec
           FROM app_plogsummarynode
          WHERE video_id = $1
          ORDER BY level, start_sec`,
        [videoId],
      );

      const concepts: PlogConcept[] = [];
      const learning_objects: Record<number, PlogLearningObject> = {};
      for (const r of conceptsRes.rows) {
        let embedding: number[] = [];
        try {
          const raw = r.embedding ? JSON.parse(r.embedding) : [];
          embedding = Array.isArray(raw) ? raw.map(Number) : [];
        } catch {
          embedding = [];
        }
        const conceptId = Number(r.id);
        concepts.push({
          id: conceptId,
          video_id: Number(r.video_id),
          label: r.label,
          node_type: r.node_type,
          intro_sec: Number(r.intro_sec),
          source_quote: r.source_quote ?? "",
          embedding,
        });
        if (r.lo_id != null) {
          learning_objects[conceptId] = {
            id: Number(r.lo_id),
            concept_id: conceptId,
            opening_question: r.opening_question ?? "",
            hint_ladder: parseArr(r.hint_ladder).map(String),
            misconceptions: parseArr(r.misconceptions).map(String),
            canonical_order: parseArr(r.canonical_order).map(String),
            worked_examples: parseArr(r.worked_examples).map(String),
            waypoints: parseArr(r.waypoints) as Record<string, unknown>[],
          };
        }
      }
      const edges: PlogEdge[] = edgesRes.rows.map((r) => ({
        id: Number(r.id),
        video_id: Number(r.video_id),
        source_id: Number(r.source_id),
        target_id: Number(r.target_id),
        edge_type: r.edge_type,
        quote: r.quote ?? "",
      }));
      const summary_nodes: PlogSummaryNode[] = sumRes.rows.map((r) => ({
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
  return withDb(env, async (db, client) => {
    const { rows } = await client.query(
      `SELECT title, transcript FROM app_video WHERE id = $1`,
      [videoId],
    );
    if (rows.length === 0) return null;
    return {
      title: (rows[0].title as string) || `Video ${videoId}`,
      transcript: (rows[0].transcript as string) || "",
    };
  });
}
