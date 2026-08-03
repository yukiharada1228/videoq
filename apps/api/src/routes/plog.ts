import { Hono } from "hono";
import type { Context } from "hono";
import {
  requireAuth,
  requireScope,
  apiKeyMethod,
  jwtMethod,
} from "../middleware/auth";
import { csrfProtect } from "../middleware/csrf";
import {
  getPlogGraph,
  getPlogLearnerState,
  getLatestBuildJob,
  createBuildJob,
  requireOwnedVideo,
  resetLearnerStates,
} from "../repositories/plog-repository";
import { getVideoTranscriptState } from "../repositories/video-repository";
import { enqueueBuildPlog } from "../lib/jobs";
import {
  editCreateConcept,
  editCreateEdge,
  editDeleteConcept,
  editDeleteEdge,
  editMergeConcepts,
  editUpdateConcept,
  editUpdateEdge,
  editUpdateLearningObject,
  type EditResult,
} from "../lib/plog-edit";
import { apiError } from "../utils/responses";
import type { AppEnv } from "../types/bindings";

/**
 * 移行済みの Plog（学習グラフ）ルート。
 *   GET    /api/videos/<id>/plog/                              ── グラフ
 *   GET    /api/videos/<id>/plog/learner-state/                ── 学習者状態
 *   DELETE /api/videos/<id>/plog/learner-state/                ── 学習者状態リセット
 *   POST   /api/videos/<id>/plog/rebuild/                      ── 再ビルド投入
 *   POST   /api/videos/<id>/plog/concepts/                     ── concept 作成
 *   PATCH  /api/videos/<id>/plog/concepts/<cid>/               ── concept 更新
 *   DELETE /api/videos/<id>/plog/concepts/<cid>/               ── concept 削除
 *   POST   /api/videos/<id>/plog/concepts/<cid>/merge/         ── concept マージ
 *   PATCH  /api/videos/<id>/plog/concepts/<cid>/learning-object/ ── LO 更新
 *   POST   /api/videos/<id>/plog/edges/                        ── edge 作成
 *   PATCH  /api/videos/<id>/plog/edges/<eid>/                  ── edge 更新
 *   DELETE /api/videos/<id>/plog/edges/<eid>/                  ── edge 削除
 *
 * 認証は [APIKey, CookieJWT]。未所有/不在は 404 "Video not found."（ピリオド有）。
 * mode=study チャット本体は `src/lib/plog-study.ts`（chat ルート）で Worker 内実行。
 */
export const plogRoutes = new Hono<AppEnv>();

const plogAuth = requireAuth(apiKeyMethod, jwtMethod);
const plogWriteGuards = [
  requireAuth(apiKeyMethod, jwtMethod),
  csrfProtect,
  requireScope("write"),
] as const;
/** LearnerStateView.required_scope = "read"（DELETE も read_only キー可）。 */
const learnerResetGuards = [
  requireAuth(apiKeyMethod, jwtMethod),
  csrfProtect,
  requireScope("read"),
] as const;

const videoNotFound = (c: Context<AppEnv>) =>
  c.json(
    { error: { code: "VALIDATION_ERROR", message: "Video not found." } },
    404,
  );

const respondEdit = <T>(c: Context<AppEnv>, result: EditResult<T>, created = false) => {
  if (!result.ok) return apiError(c, result.status, result.message);
  return c.json(result.value, created ? 201 : 200);
};

const graph = async (c: Context<AppEnv>) => {
  const res = await getPlogGraph(
    c.env,
    Number(c.req.param("videoId")),
    c.get("userId")!,
  );
  if ("notFound" in res) return videoNotFound(c);
  return c.json(res);
};

const learnerState = async (c: Context<AppEnv>) => {
  const res = await getPlogLearnerState(
    c.env,
    Number(c.req.param("videoId")),
    c.get("userId")!,
  );
  if ("notFound" in res) return videoNotFound(c);
  return c.json(res);
};

const resetLearner = async (c: Context<AppEnv>) => {
  const res = await resetLearnerStates(
    c.env,
    c.get("userId")!,
    Number(c.req.param("videoId")),
  );
  if ("notFound" in res) return videoNotFound(c);
  return c.json({ deleted: res.deleted });
};

// 具体パスを先に登録
plogRoutes.get("/api/videos/:videoId{[0-9]+}/plog/learner-state", plogAuth, learnerState);
plogRoutes.get("/api/videos/:videoId{[0-9]+}/plog/learner-state/", plogAuth, learnerState);
plogRoutes.delete(
  "/api/videos/:videoId{[0-9]+}/plog/learner-state",
  ...learnerResetGuards,
  resetLearner,
);
plogRoutes.delete(
  "/api/videos/:videoId{[0-9]+}/plog/learner-state/",
  ...learnerResetGuards,
  resetLearner,
);
plogRoutes.get("/api/videos/:videoId{[0-9]+}/plog", plogAuth, graph);
plogRoutes.get("/api/videos/:videoId{[0-9]+}/plog/", plogAuth, graph);

const rebuild = async (c: Context<AppEnv>) => {
  const userId = c.get("userId")!;
  const videoId = Number(c.req.param("videoId"));

  const state = await getVideoTranscriptState(c.env, videoId, userId);
  if (!state.found) return apiError(c, 404, "Video not found.");
  if (!state.hasTranscript) return apiError(c, 404, "Transcript not found.");

  const latest = await getLatestBuildJob(c.env, videoId);
  if (latest && (latest.status === "pending" || latest.status === "running")) {
    await enqueueBuildPlog(c.env, videoId);
    return c.json({ video_id: videoId, status: latest.status, job_id: latest.id }, 202);
  }

  const job = await createBuildJob(c.env, videoId);
  await enqueueBuildPlog(c.env, videoId);
  return c.json({ video_id: videoId, status: job.status, job_id: job.id }, 202);
};

plogRoutes.post("/api/videos/:videoId{[0-9]+}/plog/rebuild", ...plogWriteGuards, rebuild);
plogRoutes.post("/api/videos/:videoId{[0-9]+}/plog/rebuild/", ...plogWriteGuards, rebuild);

/** 編集系の共通前処理: 所有権確認。 */
async function ownedVideo(c: Context<AppEnv>): Promise<number | Response> {
  const videoId = Number(c.req.param("videoId"));
  const owner = await requireOwnedVideo(c.env, videoId, c.get("userId")!);
  if ("notFound" in owner) return videoNotFound(c);
  return videoId;
}

/** Python `float(x or 0.0)` 相当。失敗時は Python 風メッセージ。 */
function floatOrZero(raw: unknown): number | { error: string } {
  const v = raw || 0.0;
  if (typeof v === "boolean") return v ? 1.0 : 0.0;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return { error: `could not convert string to float: '${String(raw)}'` };
}

/** Python `int(x)` 相当（欠落/None は TypeError メッセージ）。 */
function pyInt(raw: unknown): number | { error: string } {
  if (raw === null || raw === undefined) {
    return {
      error:
        "int() argument must be a string, a bytes-like object or a real number, not 'NoneType'",
    };
  }
  if (typeof raw === "boolean") return raw ? 1 : 0;
  if (typeof raw === "number" && Number.isInteger(raw)) return raw;
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.trunc(raw);
  if (typeof raw === "string" && /^-?\d+$/.test(raw.trim())) return parseInt(raw.trim(), 10);
  return { error: `invalid literal for int() with base 10: '${String(raw)}'` };
}

const createConceptHandler = async (c: Context<AppEnv>) => {
  const videoId = await ownedVideo(c);
  if (typeof videoId !== "number") return videoId;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const intro = floatOrZero(body.intro_sec);
  if (typeof intro === "object") return apiError(c, 400, intro.error);
  const result = await editCreateConcept(c.env, videoId, {
    label: String(body.label ?? ""),
    nodeType: String(body.node_type || "object"),
    introSec: intro,
    sourceQuote: String(body.source_quote ?? ""),
  });
  return respondEdit(c, result, true);
};

const updateConceptHandler = async (c: Context<AppEnv>) => {
  const videoId = await ownedVideo(c);
  if (typeof videoId !== "number") return videoId;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: {
    label?: string;
    nodeType?: string;
    introSec?: number;
    sourceQuote?: string;
  } = {};
  for (const key of ["label", "node_type", "source_quote"] as const) {
    if (key in body) {
      if (key === "label") patch.label = body.label as string;
      if (key === "node_type") patch.nodeType = body.node_type as string;
      if (key === "source_quote") patch.sourceQuote = body.source_quote as string;
    }
  }
  if ("intro_sec" in body) {
    const n = Number(body.intro_sec);
    if (!Number.isFinite(n)) return apiError(c, 400, "intro_sec must be a number");
    patch.introSec = n;
  }
  return respondEdit(
    c,
    await editUpdateConcept(c.env, videoId, Number(c.req.param("conceptId")), patch),
  );
};

const deleteConceptHandler = async (c: Context<AppEnv>) => {
  const videoId = await ownedVideo(c);
  if (typeof videoId !== "number") return videoId;
  return respondEdit(
    c,
    await editDeleteConcept(c.env, videoId, Number(c.req.param("conceptId"))),
  );
};

const mergeConceptHandler = async (c: Context<AppEnv>) => {
  const videoId = await ownedVideo(c);
  if (typeof videoId !== "number") return videoId;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const absorbId = pyInt(body.absorb_id);
  if (typeof absorbId === "object") return apiError(c, 400, absorbId.error);
  return respondEdit(
    c,
    await editMergeConcepts(c.env, videoId, Number(c.req.param("conceptId")), absorbId),
  );
};

const updateLoHandler = async (c: Context<AppEnv>) => {
  const videoId = await ownedVideo(c);
  if (typeof videoId !== "number") return videoId;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: Parameters<typeof editUpdateLearningObject>[3] = {};
  if ("opening_question" in body) patch.openingQuestion = body.opening_question as string;
  if ("hint_ladder" in body) patch.hintLadder = body.hint_ladder as unknown[];
  if ("misconceptions" in body) patch.misconceptions = body.misconceptions as unknown[];
  if ("canonical_order" in body) patch.canonicalOrder = body.canonical_order as unknown[];
  if ("worked_examples" in body) patch.workedExamples = body.worked_examples as unknown[];
  if ("waypoints" in body) patch.waypoints = body.waypoints as unknown[];
  return respondEdit(
    c,
    await editUpdateLearningObject(c.env, videoId, Number(c.req.param("conceptId")), patch),
  );
};

const createEdgeHandler = async (c: Context<AppEnv>) => {
  const videoId = await ownedVideo(c);
  if (typeof videoId !== "number") return videoId;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const sourceId = pyInt(body.source_id);
  if (typeof sourceId === "object") return apiError(c, 400, sourceId.error);
  const targetId = pyInt(body.target_id);
  if (typeof targetId === "object") return apiError(c, 400, targetId.error);
  return respondEdit(
    c,
    await editCreateEdge(c.env, videoId, {
      sourceId,
      targetId,
      edgeType: String(body.edge_type || ""),
      quote: String(body.quote ?? ""),
    }),
    true,
  );
};

const updateEdgeHandler = async (c: Context<AppEnv>) => {
  const videoId = await ownedVideo(c);
  if (typeof videoId !== "number") return videoId;
  const data = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: {
    sourceId?: number;
    targetId?: number;
    edgeType?: string;
    quote?: string;
  } = {};
  if ("edge_type" in data) patch.edgeType = data.edge_type as string;
  if ("quote" in data) patch.quote = data.quote as string;
  for (const key of ["source_id", "target_id"] as const) {
    if (key in data) {
      const n = Number(data[key]);
      if (!Number.isInteger(n))
        return apiError(c, 400, `${key} must be an integer`);
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
    return apiError(
      c,
      400,
      "Provide at least one of: source_id, target_id, edge_type, quote",
    );
  }
  return respondEdit(
    c,
    await editUpdateEdge(c.env, videoId, Number(c.req.param("edgeId")), patch),
  );
};

const deleteEdgeHandler = async (c: Context<AppEnv>) => {
  const videoId = await ownedVideo(c);
  if (typeof videoId !== "number") return videoId;
  return respondEdit(
    c,
    await editDeleteEdge(c.env, videoId, Number(c.req.param("edgeId"))),
  );
};

// concepts / edges — より具体的なパスを先に
plogRoutes.post(
  "/api/videos/:videoId{[0-9]+}/plog/concepts/:conceptId{[0-9]+}/merge",
  ...plogWriteGuards,
  mergeConceptHandler,
);
plogRoutes.post(
  "/api/videos/:videoId{[0-9]+}/plog/concepts/:conceptId{[0-9]+}/merge/",
  ...plogWriteGuards,
  mergeConceptHandler,
);
plogRoutes.patch(
  "/api/videos/:videoId{[0-9]+}/plog/concepts/:conceptId{[0-9]+}/learning-object",
  ...plogWriteGuards,
  updateLoHandler,
);
plogRoutes.patch(
  "/api/videos/:videoId{[0-9]+}/plog/concepts/:conceptId{[0-9]+}/learning-object/",
  ...plogWriteGuards,
  updateLoHandler,
);
plogRoutes.patch(
  "/api/videos/:videoId{[0-9]+}/plog/concepts/:conceptId{[0-9]+}",
  ...plogWriteGuards,
  updateConceptHandler,
);
plogRoutes.patch(
  "/api/videos/:videoId{[0-9]+}/plog/concepts/:conceptId{[0-9]+}/",
  ...plogWriteGuards,
  updateConceptHandler,
);
plogRoutes.delete(
  "/api/videos/:videoId{[0-9]+}/plog/concepts/:conceptId{[0-9]+}",
  ...plogWriteGuards,
  deleteConceptHandler,
);
plogRoutes.delete(
  "/api/videos/:videoId{[0-9]+}/plog/concepts/:conceptId{[0-9]+}/",
  ...plogWriteGuards,
  deleteConceptHandler,
);
plogRoutes.post(
  "/api/videos/:videoId{[0-9]+}/plog/concepts",
  ...plogWriteGuards,
  createConceptHandler,
);
plogRoutes.post(
  "/api/videos/:videoId{[0-9]+}/plog/concepts/",
  ...plogWriteGuards,
  createConceptHandler,
);

plogRoutes.patch(
  "/api/videos/:videoId{[0-9]+}/plog/edges/:edgeId{[0-9]+}",
  ...plogWriteGuards,
  updateEdgeHandler,
);
plogRoutes.patch(
  "/api/videos/:videoId{[0-9]+}/plog/edges/:edgeId{[0-9]+}/",
  ...plogWriteGuards,
  updateEdgeHandler,
);
plogRoutes.delete(
  "/api/videos/:videoId{[0-9]+}/plog/edges/:edgeId{[0-9]+}",
  ...plogWriteGuards,
  deleteEdgeHandler,
);
plogRoutes.delete(
  "/api/videos/:videoId{[0-9]+}/plog/edges/:edgeId{[0-9]+}/",
  ...plogWriteGuards,
  deleteEdgeHandler,
);
plogRoutes.post(
  "/api/videos/:videoId{[0-9]+}/plog/edges",
  ...plogWriteGuards,
  createEdgeHandler,
);
plogRoutes.post(
  "/api/videos/:videoId{[0-9]+}/plog/edges/",
  ...plogWriteGuards,
  createEdgeHandler,
);
