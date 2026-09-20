/**
 * PLOG-guided study-mode chat gateway (Algorithm 1).
 * PLOG Study モードのガイド生成と一時学習状態を扱う。
 */

import { embedQuery } from "./embeddings";
import { checkEmbeddingStorage } from "./embedding-schema";
import { generateGradingReply, generateReply } from "./llm";
import { LlmConfigurationError, LlmProviderError } from "./openai";
import {
  formatTemplate,
  getPlogStudyConfig,
  resolveOpeningQuestion,
} from "./prompts";
import {
  cosineSimilarity,
  coveredConceptIds,
  descendants,
  graphsHaveOrderingPath,
  nearDuplicateIds,
  nextHint,
  nextUncoveredInOrder,
  orderingEdges,
  prerequisitesOf,
  reachedConceptIds,
  retrieveContext,
  revealProxy,
  routeToConceptScored,
  selectNearestUnmet,
  studyPathConceptIds,
  type LearnerConceptState,
  type PlogConcept,
  type PlogGraphSnapshot,
  type PlogLearningObject,
} from "./plog-runtime";
import { parseSrtScenes } from "./srt";
import {
  getVideoTitleAndTranscript,
  listReadyGraphs,
} from "../repositories/plog-repository";
import type { Bindings } from "../types/bindings";
import type { ChatMessageInput, RagCitation } from "./rag";
import type {
  StudySessionSnapshot,
  StudySessionStateRecord,
} from "../durable-objects/study-session";

export class PlogNotReadyError extends Error {
  readonly name = "PlogNotReadyError";
}

export class StudySessionConflictError extends Error {
  readonly name = "StudySessionConflictError";
}

const STUDY_LOCK_POLL_MS = 250;

export type StudyResult = {
  content: string;
  queryText: string;
  citations: RagCitation[] | null;
  retrievedContexts: string[];
};

type StateRecord = StudySessionStateRecord;

type UpsertPatch = {
  reached?: boolean;
  hint_index?: number;
  last_grade?: string;
  active?: boolean;
};

/** 1ターン中の変更をメモリ上にまとめ、最後に1回だけコミットする。 */
export class EphemeralLearnerStateStore {
  private readonly conceptVideoIds: Map<number, number>;
  private states: Map<number, StateRecord>;

  constructor(
    initialStates: Record<string, StateRecord>,
    conceptVideoIds: Map<number, number>,
  ) {
    this.conceptVideoIds = conceptVideoIds;
    const states = new Map<number, StateRecord>();
    for (const [key, value] of Object.entries(initialStates)) {
      const conceptId = Number(key);
      if (!Number.isFinite(conceptId)) continue;
      states.set(conceptId, {
        concept_id: conceptId,
        reached: Boolean(value.reached),
        hint_index: Number(value.hint_index || 0),
        last_grade: String(value.last_grade || ""),
        active: Boolean(value.active),
      });
    }
    this.states = states;
  }

  snapshot(): Record<string, StateRecord> {
    const payload: Record<string, StateRecord> = {};
    for (const [conceptId, record] of this.states) {
      payload[String(conceptId)] = { ...record };
    }
    return payload;
  }

  async get(conceptId: number): Promise<LearnerConceptState | null> {
    return this.states.get(conceptId) ?? null;
  }

  async listForVideo(videoId: number): Promise<LearnerConceptState[]> {
    const out: LearnerConceptState[] = [];
    for (const [conceptId, record] of this.states) {
      if (this.conceptVideoIds.get(conceptId) === videoId) out.push({ ...record });
    }
    return out;
  }

  async upsert(conceptId: number, patch: UpsertPatch): Promise<LearnerConceptState> {
    const record = this.states.get(conceptId) ?? {
      concept_id: conceptId,
      reached: false,
      hint_index: 0,
      last_grade: "",
      active: false,
    };
    if (patch.reached !== undefined) record.reached = patch.reached;
    if (patch.hint_index !== undefined) record.hint_index = patch.hint_index;
    if (patch.last_grade !== undefined) record.last_grade = patch.last_grade;
    if (patch.active !== undefined) record.active = patch.active;
    this.states.set(conceptId, record);
    return { ...record };
  }
}

function buildLearnerStateStore(
  initialStates: Record<string, StateRecord>,
  graphs: readonly PlogGraphSnapshot[],
): EphemeralLearnerStateStore {
  const conceptVideoIds = new Map<number, number>();
  for (const graph of graphs) {
    for (const concept of graph.concepts) {
      conceptVideoIds.set(concept.id, graph.video_id);
    }
  }
  return new EphemeralLearnerStateStore(initialStates, conceptVideoIds);
}

function latestUserQuery(messages: readonly ChatMessageInput[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    if (m.role === "user" && m.content) return m.content;
  }
  return "";
}

function previousAssistantContent(messages: readonly ChatMessageInput[]): string {
  let seenUser = false;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    if (m.role === "user" && m.content && !seenUser) {
      seenUser = true;
      continue;
    }
    if (seenUser && m.role === "assistant" && m.content) return m.content;
  }
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    if (m.role === "assistant" && m.content) return m.content;
  }
  return "";
}

export function isAskForAnswer(text: string): boolean {
  const t = text.trim().toLowerCase();
  return (
    /(?:答え|解答|正解)(?:を|が)?(?:そのまま|直接|全部|すぐに|だけ)?(?:教えて|見せて|ください|知りたい)/u.test(t) ||
    /^(?:答え|解答|正解)(?:は)?[?？]$/u.test(t) ||
    /\b(?:tell|give|show) me (?:the |a )?(?:full |correct )?answer\b|\bwhat(?: is|'s) the answer\b|\banswer please\b/u.test(t)
  );
}

export function isMetaOrConfused(text: string): boolean {
  const t = (text || "").trim().toLowerCase();
  if (!t) return true;
  if (t.length <= 2 && ["?", "？", "…", "...", "。", "!"].includes(t)) return true;
  const cues = [
    "何を言",
    "なにを言",
    "関係なく",
    "意味がわ",
    "わからない",
    "分からない",
    "変じゃ",
    "おかしい",
    "なぜ今",
    "話が違う",
    "急に",
    "what are you",
    "doesn't make sense",
    "confused",
    "unrelated",
  ];
  return cues.some((c) => t.includes(c));
}

export type StudyMessageIntent = "answer" | "hint" | "explanation" | "reveal";

/** Conservative help routing, not a judgment of understanding. */
export function classifyStudyMessage(reply: string): StudyMessageIntent {
  const t = reply.trim().toLowerCase();
  if (isAskForAnswer(t)) return "reveal";
  if (/^(?:ヒント|hint)[。.!！]?$/u.test(t) ||
      /ヒント(?:を|が)?(?:教えて|ください|ほしい|欲しい|お願い|ちょうだい)/u.test(t) ||
      /\b(?:give|show|need|want|have)\b.*\bhint\b|\bhint please\b/u.test(t)) return "hint";
  if (
    isMetaOrConfused(t) || /[?？]/u.test(t) ||
    /教えて|説明して|説明してください|どういう意味|^(?:なぜ|なんで|どうして)/u.test(t) ||
    /\b(?:explain|help me)\b|^(?:why|how|what is|what does|can you|could you)\b/u.test(t)
  ) return "explanation";
  return "answer";
}

export function shouldStayOnActive(
  query: string,
  queryEmbedding: readonly number[],
  activeConcept: PlogConcept,
  routedScored: { score: number; concept: PlogConcept } | null,
): boolean {
  if (isMetaOrConfused(query) || isAskForAnswer(query)) return true;
  if (routedScored === null) return true;
  if (routedScored.concept.id === activeConcept.id) return true;
  if ((query || "").trim().length < 12) return true;
  const activeScore = activeConcept.embedding.length
    ? cosineSimilarity(queryEmbedding, activeConcept.embedding)
    : 0;
  const score = routedScored.score;
  return !(score >= 0.55 && score >= activeScore + 0.12);
}

function requireStudySessions(
  env: Bindings,
): NonNullable<Bindings["STUDY_SESSION"]> {
  if (!env.STUDY_SESSION) {
    throw new LlmConfigurationError(
      "STUDY_SESSION Durable Object binding is required for study mode.",
    );
  }
  return env.STUDY_SESSION;
}

async function loadL0Scenes(
  env: Bindings,
  videoId: number,
): Promise<ReturnType<typeof parseSrtScenes>> {
  try {
    const video = await getVideoTitleAndTranscript(env, videoId);
    const transcript = video?.transcript || "";
    if (!transcript.trim()) return [];
    return parseSrtScenes(transcript);
  } catch {
    return [];
  }
}

async function videoTitle(env: Bindings, videoId: number): Promise<string> {
  const video = await getVideoTitleAndTranscript(env, videoId);
  return video?.title || `Video ${videoId}`;
}

async function activateConcept(
  store: EphemeralLearnerStateStore,
  conceptId: number,
  states: readonly LearnerConceptState[],
  hintIndex: number,
): Promise<void> {
  await store.upsert(conceptId, { hint_index: hintIndex, active: true });
  for (const s of states) {
    if (s.concept_id !== conceptId && s.active) {
      await store.upsert(s.concept_id, { active: false });
    }
  }
}

async function findActive(
  store: EphemeralLearnerStateStore,
  graphs: readonly PlogGraphSnapshot[],
): Promise<{ graph: PlogGraphSnapshot; concept: PlogConcept } | null> {
  for (const g of graphs) {
    for (const s of await store.listForVideo(g.video_id)) {
      if (!s.active) continue;
      const concept = g.concepts.find((c) => c.id === s.concept_id);
      if (concept) return { graph: g, concept };
    }
  }
  return null;
}

async function firstUnreached(
  store: EphemeralLearnerStateStore,
  graphs: readonly PlogGraphSnapshot[],
): Promise<{ graph: PlogGraphSnapshot; concept: PlogConcept } | null> {
  for (const g of graphs) {
    const edges = orderingEdges(g.edges);
    const states = await store.listForVideo(g.video_id);
    const reached = reachedConceptIds(states);
    const conceptsById = new Map(g.concepts.map((c) => [c.id, c]));
    const order = studyPathConceptIds(g.concepts, edges);
    const nxt = nextUncoveredInOrder(order, reached, conceptsById);
    if (nxt != null) return { graph: g, concept: conceptsById.get(nxt)! };
  }
  return null;
}

type Grade = "mastery" | "partial" | "miss";
type GradingResult = { grade: Grade; reason: string } | null;
type GradeOutcome =
  | { kind: "opening" }
  | {
      kind: "help";
      intent: Exclude<StudyMessageIntent, "answer">;
      graph: PlogGraphSnapshot;
      concept: PlogConcept;
    }
  | { kind: "ungraded" }
  | { kind: "graded"; grade: Grade; reason: string; progression: "advanced" | "path_complete" | null };

async function gradeReply(
  env: Bindings,
  reply: string,
  conceptLabel: string,
  lo: PlogLearningObject | undefined,
  priorAssistant: string,
  studyCfg: Record<string, unknown>,
): Promise<GradingResult> {
  try {
    const opening = lo?.opening_question ?? "";
    const gradeSystem = String(
      studyCfg.grade_system ||
        'Return ONLY JSON: {"grade":"mastery"|"partial"|"miss","reason":"..."}.',
    );
    const userPrompt =
      `Concept: ${conceptLabel}\n` +
      `Saved opening question: ${opening}\n` +
      `Tutor's previous message (may be a hint or explanation): ${priorAssistant}\n` +
      `Learner reply: ${reply}`;
    const content = await generateGradingReply(env, gradeSystem, userPrompt);
    const data: unknown = JSON.parse(content.trim());
    if (data && typeof data === "object" && "grade" in data && "reason" in data) {
      const { grade, reason } = data;
      if ((grade === "mastery" || grade === "partial" || grade === "miss") &&
          typeof reason === "string" && reason.trim()) {
        return { grade, reason: reason.trim().replace(/\s+/gu, " ").slice(0, 240) };
      }
    }
  } catch {
    // A provider/format failure says nothing about the learner's understanding.
  }
  return null;
}

async function maybeGradePrevious(
  env: Bindings,
  store: EphemeralLearnerStateStore,
  query: string,
  graphs: readonly PlogGraphSnapshot[],
  priorAssistant: string,
  studyCfg: Record<string, unknown>,
): Promise<GradeOutcome> {
  let active: LearnerConceptState | null = null;
  let activeGraph: PlogGraphSnapshot | null = null;
  for (const g of graphs) {
    const states = await store.listForVideo(g.video_id);
    for (const s of states) {
      if (s.active) {
        active = s;
        activeGraph = g;
        break;
      }
    }
    if (active) break;
  }
  if (!active || !activeGraph) return { kind: "opening" };

  const lo = activeGraph.learning_objects[active.concept_id];
  const concept = activeGraph.concepts.find((c) => c.id === active!.concept_id);
  if (!concept) return { kind: "opening" };

  const intent = classifyStudyMessage(query);
  if (intent !== "answer") return { kind: "help", intent, graph: activeGraph, concept };

  const result = await gradeReply(
    env,
    query,
    concept.label,
    lo,
    priorAssistant,
    studyCfg,
  );
  if (!result) return { kind: "ungraded" };
  const { grade, reason } = result;
  if (grade === "mastery") {
    const conceptsById = new Map(activeGraph.concepts.map((c) => [c.id, c]));
    for (const twinId of nearDuplicateIds(active.concept_id, conceptsById)) {
      await store.upsert(twinId, {
        reached: true,
        active: false,
        last_grade: twinId === active.concept_id ? grade : "mastery",
        hint_index: 0,
      });
    }
    const edges = orderingEdges(activeGraph.edges);
    const order = studyPathConceptIds(activeGraph.concepts, edges);
    const states = await store.listForVideo(activeGraph.video_id);
    const reached = reachedConceptIds(states);
    let nxt = nextUncoveredInOrder(order, reached, conceptsById, active.concept_id);
    if (nxt == null) nxt = nextUncoveredInOrder(order, reached, conceptsById);
    if (nxt != null) {
      await store.upsert(nxt, { active: true, hint_index: 0, last_grade: "" });
      return { kind: "graded", grade, reason, progression: "advanced" };
    }
    return { kind: "graded", grade, reason, progression: "path_complete" };
  }

  let newHint = active.hint_index + 1;
  const ladderLen = lo?.hint_ladder?.length ? lo.hint_ladder.length : 1;
  newHint = Math.min(newHint, Math.max(ladderLen - 1, 0));
  await store.upsert(active.concept_id, {
    last_grade: grade,
    hint_index: newHint,
    active: true,
  });
  return { kind: "graded", grade, reason, progression: null };
}

async function resolveTarget(
  env: Bindings,
  store: EphemeralLearnerStateStore,
  query: string,
  graphs: readonly PlogGraphSnapshot[],
  lockActive: boolean,
): Promise<{ graph: PlogGraphSnapshot; concept: PlogConcept; redirected: boolean } | null> {
  let qEmb: number[];
  try {
    qEmb = await embedQuery(env, query);
  } catch (e) {
    if (e instanceof LlmConfigurationError) throw e;
    throw new LlmProviderError(e instanceof Error ? e.message : String(e));
  }

  const routedScored = routeToConceptScored(qEmb, graphs);
  let active = await findActive(store, graphs);
  if (active) {
    const { graph, concept } = active;
    const states = await store.listForVideo(graph.video_id);
    const reached = reachedConceptIds(states);
    const conceptsById = new Map(graph.concepts.map((c) => [c.id, c]));
    const covered = coveredConceptIds(reached, conceptsById);
    if (covered.has(concept.id)) {
      await store.upsert(concept.id, { reached: true, active: false });
      active = null;
    }
  }

  let graph: PlogGraphSnapshot;
  let concept: PlogConcept;
  if (
    active &&
    (lockActive ||
      shouldStayOnActive(
        query,
        qEmb,
        active.concept,
        routedScored
          ? { score: routedScored.score, concept: routedScored.concept }
          : null,
      ))
  ) {
    ({ graph, concept } = active);
  } else if (routedScored) {
    graph = routedScored.graph;
    concept = routedScored.concept;
  } else if (active) {
    ({ graph, concept } = active);
  } else {
    const nextUnreached = await firstUnreached(store, graphs);
    if (nextUnreached) {
      ({ graph, concept } = nextUnreached);
    } else if (graphs[0]?.concepts[0]) {
      graph = graphs[0];
      concept = graphs[0].concepts[0];
    } else {
      return null;
    }
  }

  const edges = orderingEdges(graph.edges);
  const states = await store.listForVideo(graph.video_id);
  const reached = reachedConceptIds(states);
  const conceptsById = new Map(graph.concepts.map((c) => [c.id, c]));
  const covered = coveredConceptIds(reached, conceptsById);
  const order = studyPathConceptIds(graph.concepts, edges);
  if (order.length > 0 && order.every((cid) => covered.has(cid))) return null;

  const prereqs = prerequisitesOf(concept.id, edges);
  const unmet = new Set([...prereqs].filter((id) => !covered.has(id)));
  if (unmet.size > 0) {
    const targetId = selectNearestUnmet(unmet, conceptsById) ?? concept.id;
    return { graph, concept: conceptsById.get(targetId)!, redirected: true };
  }
  return { graph, concept, redirected: false };
}

async function runTurn(
  env: Bindings,
  params: {
    query: string;
    messages: readonly ChatMessageInput[];
    videoIds: readonly number[];
    locale: string | null;
    initialStates: StudySessionSnapshot["states"];
  },
): Promise<{ result: StudyResult; states: StudySessionSnapshot["states"] }> {
  if (!params.videoIds.length) {
    throw new PlogNotReadyError("Study mode requires a video course with members.");
  }

  const graphs = await listReadyGraphs(env, params.videoIds);
  if (graphs.length === 0) {
    throw new PlogNotReadyError(
      "PLOG is not ready for this course's videos. Wait for build or rebuild.",
    );
  }

  // Check before grading or changing the learner state, including completed paths.
  await checkEmbeddingStorage(env);

  const studyCfg = getPlogStudyConfig(params.locale);
  if (!graphsHaveOrderingPath(graphs)) {
    throw new PlogNotReadyError(
      String(
        studyCfg.needs_ordering_path ||
          studyCfg.needs_human_validation ||
          "Study mode needs ordering edges that form a DAG path. " +
            "Open the learning graph panel to edit or delete edges.",
      ),
    );
  }

  const store = buildLearnerStateStore(params.initialStates, graphs);
  let notice = "";
  const done = (result: StudyResult) => ({
    result: { ...result, content: notice ? `${notice}\n\n${result.content}` : result.content },
    states: store.snapshot(),
  });
  // Retry notices are not tutor questions. Preserve the question being retried,
  // including when the UI language changes between attempts.
  const retryNotices = new Set(
    ["en", "ja"].map((locale) => getPlogStudyConfig(locale).grading_unavailable),
  );
  const priorAssistant = previousAssistantContent(
    params.messages.filter((message) => message.role !== "assistant" || !retryNotices.has(message.content)),
  );
  const gradeOutcome = await maybeGradePrevious(
    env,
    store,
    params.query,
    graphs,
    priorAssistant,
    studyCfg,
  );

  if (gradeOutcome.kind === "ungraded") {
    return done({
      content: String(studyCfg.grading_unavailable),
      queryText: params.query,
      citations: null,
      retrievedContexts: [],
    });
  }
  if (gradeOutcome.kind === "graded") {
    notice = formatTemplate(String(studyCfg[`grade_${gradeOutcome.grade}`]), {
      reason: gradeOutcome.reason,
    });
  } else if (gradeOutcome.kind === "help") {
    notice = String(studyCfg.help_not_graded);
  }
  const progression = gradeOutcome.kind === "graded" ? gradeOutcome.progression : null;
  if (progression === "path_complete") {
    return done({
      content: String(studyCfg.path_complete || ""),
      queryText: params.query,
      citations: null,
      retrievedContexts: [],
    });
  }

  const resolved = gradeOutcome.kind === "help"
    ? { graph: gradeOutcome.graph, concept: gradeOutcome.concept, redirected: false }
    : await resolveTarget(env, store, params.query, graphs, progression === "advanced");
  if (!resolved) {
    return done({
      content: String(studyCfg.path_complete || ""),
      queryText: params.query,
      citations: null,
      retrievedContexts: [],
    });
  }
  const { graph, concept: target, redirected } = resolved;

  const edges = orderingEdges(graph.edges);
  const states = await store.listForVideo(graph.video_id);
  const conceptsById = new Map(graph.concepts.map((c) => [c.id, c]));
  const ahead = descendants(target.id, edges);
  const lo = graph.learning_objects[target.id];
  const state = await store.get(target.id);
  let hintIndex = state?.hint_index ?? 0;
  const opening = resolveOpeningQuestion(
    target.label,
    lo?.opening_question ?? "",
    params.locale,
  );
  const isOpening = Boolean(
    gradeOutcome.kind !== "help" && opening && (!state || (state.hint_index === 0 && !state.last_grade)),
  );

  const citations: RagCitation[] = [];
  const title = await videoTitle(env, graph.video_id);
  if (lo?.waypoints?.length) {
    const wp = lo.waypoints[0]!;
    const start = String(wp.start_time ?? wp.start_sec ?? "");
    const end = String(wp.end_time ?? wp.end_sec ?? "");
    citations.push({
      video_id: graph.video_id,
      title,
      start_time: start || null,
      end_time: end || null,
    });
  }

  if (isOpening) {
    let content: string;
    if (redirected) {
      content = formatTemplate(String(studyCfg.redirect_prereq || "{opening}"), {
        label: target.label,
        opening,
      });
    } else if (
      progression === "advanced" ||
      (state && !state.last_grade && states.some((s) => s.reached))
    ) {
      content = formatTemplate(String(studyCfg.advance_next || "{opening}"), {
        label: target.label,
        opening,
      });
    } else {
      content = opening;
    }
    if (citations.length) content = content.replace(/\s*$/, "") + " [1]";
    const scenes = await loadL0Scenes(env, graph.video_id);
    await activateConcept(store, target.id, states, 0);
    return done({
      content,
      queryText: params.query,
      citations: citations.length ? citations : null,
      retrievedContexts: retrieveContext(graph, target, scenes),
    });
  }

  const scenes = await loadL0Scenes(env, graph.video_id);
  const ctx = retrieveContext(graph, target, scenes);

  if (gradeOutcome.kind === "help" && (gradeOutcome.intent === "reveal" || gradeOutcome.intent === "hint")) {
    const hint = nextHint(lo, hintIndex);
    const template = gradeOutcome.intent === "reveal" ? studyCfg.refuse_reveal : studyCfg.requested_hint;
    let content = formatTemplate(String(template || "{hint}"), {
      label: target.label,
      hint: hint.text || opening,
    });
    if (citations.length && !content.includes("[1]")) {
      content = content.replace(/\s*$/, "") + " [1]";
    }
    return done({
      content,
      queryText: params.query,
      citations: citations.length ? citations : null,
      retrievedContexts: ctx,
    });
  }

  const policy = String(studyCfg.policy || "");
  const hint = nextHint(lo, hintIndex);
  hintIndex = hint.index;
  const withholdLabels = [...ahead]
    .filter((cid) => conceptsById.has(cid))
    .map((cid) => conceptsById.get(cid)!.label);
  const misconceptions = lo?.misconceptions ?? [];

  let staticPrefix =
    `${policy}\n\n` +
    `# Target concept\n${target.label}\n` +
    `# Opening question\n${opening}\n` +
    `# Misconceptions to watch\n${JSON.stringify(misconceptions)}\n` +
    `# Lecture context (L0+L1)\n${ctx.join("\n")}\n` +
    `# WITHHOLD (do not reveal)\n${JSON.stringify(withholdLabels)}\n`;
  if (redirected) {
    staticPrefix +=
      `# Note\nLearner asked about something downstream; ` +
      `redirect gently to prerequisite '${target.label}'.\n`;
  }

  const freshParts = [`# Current hint rung\n${hint.text}`];
  if (gradeOutcome.kind === "graded") {
    freshParts.push(
      `# Current answer grade\n${gradeOutcome.grade}\nReason: ${gradeOutcome.reason}\n` +
        "Adapt the next nudge to that grade using the current hint rung " +
        "(encourage on partial, simplify on miss). Do not invent a new topic.",
    );
  } else if (gradeOutcome.kind === "help") {
    freshParts.push(
      "# Help request (not graded)\nExplain the requested point briefly, then use the current hint. " +
      "Do not judge the learner's understanding or claim they answered incorrectly. Progress is unchanged.",
    );
  }
  freshParts.push(`# Learner reply\n${params.query}`);
  const freshInput = freshParts.join("\n\n");

  let content: string;
  try {
    content = (await generateReply(env, staticPrefix, freshInput)).trim();
  } catch (e) {
    if (e instanceof LlmConfigurationError) throw e;
    throw new LlmProviderError(e instanceof Error ? e.message : String(e));
  }

  if (revealProxy(content)) {
    content = formatTemplate(String(studyCfg.refuse_reveal || "{hint}"), {
      label: target.label,
      hint: hint.text || opening,
    });
  }
  if (citations.length && !content.includes("[1]")) {
    content = content.replace(/\s*$/, "") + " [1]";
  }

  if (gradeOutcome.kind !== "help") await activateConcept(store, target.id, states, hintIndex);
  return done({
    content,
    queryText: params.query,
    citations: citations.length ? citations : null,
    retrievedContexts: ctx,
  });
}

/** PLOG Study の応答本文を生成する。 */
export async function runStudy(
  env: Bindings,
  params: {
    messages: readonly ChatMessageInput[];
    videoIds: readonly number[] | null;
    locale: string | null;
    studySessionId: string | null;
  },
): Promise<StudyResult> {
  const query = latestUserQuery(params.messages);
  const run = (initialStates: StudySessionSnapshot["states"]) =>
    runTurn(env, {
      query,
      messages: params.messages,
      videoIds: params.videoIds ?? [],
      locale: params.locale,
      initialStates,
    });
  if (!params.studySessionId) return (await run({})).result;

  const stub = requireStudySessions(env).getByName(params.studySessionId);
  const lockToken = crypto.randomUUID();
  for (;;) {
    const lock = await stub.tryAcquire(lockToken);
    if (lock.acquired) break;
    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(STUDY_LOCK_POLL_MS, lock.retryAfterMs)),
    );
  }

  try {
    const snapshot = await stub.getSnapshot();
    const turn = await run(snapshot.states);
    if (await stub.commit(snapshot.revision, turn.states, lockToken)) {
      return turn.result;
    }
    throw new StudySessionConflictError(
      "Study session lease expired before the turn could be committed.",
    );
  } finally {
    await stub.release(lockToken);
  }
}

/**
 * 応答を生成してから全文 1 chunk + final を返す（トークンストリームではない）。
 */
export async function* streamStudy(
  env: Bindings,
  params: Parameters<typeof runStudy>[1],
): AsyncGenerator<{ text: string } | { final: StudyResult }> {
  const result = await runStudy(env, params);
  if (result.content) yield { text: result.content };
  yield { final: result };
}
