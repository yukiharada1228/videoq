/**
 * Runtime graph helpers for prerequisite gating (Algorithm 1).
 * Django `app/infrastructure/external/plog/runtime.py` (+ embeddings/metrics の必要分) の移植。
 */

import { isDag, ORDERING } from "./plog-ordering";

export type PlogConcept = {
  id: number;
  video_id: number;
  label: string;
  node_type: string;
  intro_sec: number;
  source_quote?: string;
  embedding: number[];
};

export type PlogEdge = {
  id: number;
  video_id: number;
  source_id: number;
  target_id: number;
  edge_type: string;
  quote?: string;
};

export type PlogLearningObject = {
  id: number;
  concept_id: number;
  opening_question: string;
  hint_ladder: string[];
  misconceptions: string[];
  canonical_order: string[];
  worked_examples: string[];
  waypoints: Record<string, unknown>[];
};

export type PlogSummaryNode = {
  id: number;
  video_id: number;
  parent_id: number | null;
  level: number;
  text: string;
  start_sec: number;
  end_sec: number;
};

export type LearnerConceptState = {
  concept_id: number;
  reached: boolean;
  hint_index: number;
  last_grade: string;
  active: boolean;
};

export type PlogGraphSnapshot = {
  video_id: number;
  concepts: PlogConcept[];
  edges: PlogEdge[];
  learning_objects: Record<number, PlogLearningObject>;
  summary_nodes: PlogSummaryNode[];
  build_status: string;
};

export type L0Scene = {
  text?: string;
  start_sec?: number;
  [key: string]: unknown;
};

/** Normalize a label for exact duplicate detection (NFKC / case / spaces). */
export function canonicalConceptLabel(label: string): string {
  const text = (label || "").trim().toLowerCase().normalize("NFKC");
  return text.replace(/\s+/g, "");
}

export function labelsNearDuplicate(a: string, b: string): boolean {
  const ca = canonicalConceptLabel(a);
  const cb = canonicalConceptLabel(b);
  return Boolean(ca) && ca === cb;
}

export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  if (!a.length || !b.length || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  if (na <= 0 || nb <= 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export function bestMatchIndex(
  query: readonly number[],
  candidates: readonly (readonly number[])[],
): number {
  let bestI = -1;
  let bestS = -1;
  for (let i = 0; i < candidates.length; i++) {
    const s = cosineSimilarity(query, candidates[i]!);
    if (s > bestS) {
      bestS = s;
      bestI = i;
    }
  }
  return bestI;
}

/** Lexical premature-reveal proxy (paper §5.5). */
export function revealProxy(text: string, answerCues?: readonly string[]): boolean {
  const cues = [
    ...(answerCues ?? []),
    "the answer is",
    "正解は",
    "答えは",
    "in other words, it is defined as",
    "定義すると",
  ];
  const lower = text.toLowerCase();
  return cues.some((c) => lower.includes(c.toLowerCase()));
}

export function coveredConceptIds(
  reached: Iterable<number>,
  conceptsById: Map<number, PlogConcept> | Record<number, PlogConcept>,
): Set<number> {
  const byId =
    conceptsById instanceof Map
      ? conceptsById
      : new Map(Object.entries(conceptsById).map(([k, v]) => [Number(k), v]));
  const reachedSet = new Set<number>();
  for (const cid of reached) {
    if (byId.has(cid)) reachedSet.add(cid);
  }
  const covered = new Set(reachedSet);
  const reachedLabels = [...reachedSet].map((cid) => byId.get(cid)!.label);
  for (const [cid, concept] of byId) {
    if (covered.has(cid)) continue;
    if (reachedLabels.some((lab) => labelsNearDuplicate(concept.label, lab))) {
      covered.add(cid);
    }
  }
  return covered;
}

export function nextUncoveredInOrder(
  order: readonly number[],
  reached: Iterable<number>,
  conceptsById: Map<number, PlogConcept> | Record<number, PlogConcept>,
  afterId?: number | null,
): number | null {
  const byId =
    conceptsById instanceof Map
      ? conceptsById
      : new Map(Object.entries(conceptsById).map(([k, v]) => [Number(k), v]));
  const covered = coveredConceptIds(reached, byId);
  let start = 0;
  if (afterId != null) {
    const idx = order.indexOf(afterId);
    start = idx >= 0 ? idx + 1 : 0;
  }
  for (let i = start; i < order.length; i++) {
    const cid = order[i]!;
    if (!covered.has(cid) && byId.has(cid)) return cid;
  }
  return null;
}

export function nearDuplicateIds(
  conceptId: number,
  conceptsById: Map<number, PlogConcept> | Record<number, PlogConcept>,
): Set<number> {
  const byId =
    conceptsById instanceof Map
      ? conceptsById
      : new Map(Object.entries(conceptsById).map(([k, v]) => [Number(k), v]));
  const concept = byId.get(conceptId);
  if (!concept) return new Set();
  const out = new Set<number>();
  for (const [cid, other] of byId) {
    if (labelsNearDuplicate(concept.label, other.label)) out.add(cid);
  }
  return out;
}

export function orderingEdges(edges: readonly PlogEdge[]): PlogEdge[] {
  return edges.filter((e) => ORDERING.has(e.edge_type));
}

export function ancestors(conceptId: number, edges: readonly PlogEdge[]): Set<number> {
  const parents = new Map<number, Set<number>>();
  for (const e of edges) {
    if (!ORDERING.has(e.edge_type)) continue;
    let set = parents.get(e.target_id);
    if (!set) {
      set = new Set();
      parents.set(e.target_id, set);
    }
    set.add(e.source_id);
  }
  const reached = new Set<number>();
  const q = [...(parents.get(conceptId) ?? [])];
  while (q.length > 0) {
    const n = q.shift()!;
    if (reached.has(n)) continue;
    reached.add(n);
    for (const p of parents.get(n) ?? []) q.push(p);
  }
  return reached;
}

export function descendants(conceptId: number, edges: readonly PlogEdge[]): Set<number> {
  const children = new Map<number, Set<number>>();
  for (const e of edges) {
    if (!ORDERING.has(e.edge_type)) continue;
    let set = children.get(e.source_id);
    if (!set) {
      set = new Set();
      children.set(e.source_id, set);
    }
    set.add(e.target_id);
  }
  const reached = new Set<number>();
  const q = [...(children.get(conceptId) ?? [])];
  while (q.length > 0) {
    const n = q.shift()!;
    if (reached.has(n)) continue;
    reached.add(n);
    for (const c of children.get(n) ?? []) q.push(c);
  }
  return reached;
}

export function prerequisitesOf(conceptId: number, edges: readonly PlogEdge[]): Set<number> {
  const out = new Set<number>();
  for (const e of edges) {
    if (ORDERING.has(e.edge_type) && e.target_id === conceptId) out.add(e.source_id);
  }
  return out;
}

export function selectNearestUnmet(
  unmet: Set<number>,
  conceptsById: Map<number, PlogConcept> | Record<number, PlogConcept>,
): number | null {
  if (unmet.size === 0) return null;
  const byId =
    conceptsById instanceof Map
      ? conceptsById
      : new Map(Object.entries(conceptsById).map(([k, v]) => [Number(k), v]));
  let best: number | null = null;
  let bestIntro = Infinity;
  for (const cid of unmet) {
    const intro = byId.get(cid)?.intro_sec ?? Infinity;
    if (intro < bestIntro) {
      bestIntro = intro;
      best = cid;
    }
  }
  return best;
}

export function topologicalConceptIds(
  concepts: readonly PlogConcept[],
  edges: readonly PlogEdge[],
): number[] {
  const ids = concepts.map((c) => c.id);
  const introById = new Map(concepts.map((c) => [c.id, c.intro_sec]));
  const indeg = new Map(ids.map((id) => [id, 0]));
  const adj = new Map<number, Set<number>>();
  const idSet = new Set(ids);

  for (const e of edges) {
    if (!ORDERING.has(e.edge_type)) continue;
    if (!idSet.has(e.source_id) || !idSet.has(e.target_id)) continue;
    let outs = adj.get(e.source_id);
    if (!outs) {
      outs = new Set();
      adj.set(e.source_id, outs);
    }
    if (!outs.has(e.target_id)) {
      outs.add(e.target_id);
      indeg.set(e.target_id, (indeg.get(e.target_id) ?? 0) + 1);
    }
  }

  const zeros = ids
    .filter((i) => (indeg.get(i) ?? 0) === 0)
    .sort((a, b) => (introById.get(a) ?? 0) - (introById.get(b) ?? 0));
  const q = [...zeros];
  const order: number[] = [];
  while (q.length > 0) {
    const n = q.shift()!;
    order.push(n);
    const outs = [...(adj.get(n) ?? [])].sort((a, b) => a - b);
    for (const m of outs) {
      const next = (indeg.get(m) ?? 0) - 1;
      indeg.set(m, next);
      if (next === 0) q.push(m);
    }
  }
  for (const cid of ids) {
    if (!order.includes(cid)) order.push(cid);
  }
  return order;
}

/** Canonical learning path = topo order over the ordering DAG (paper §3). */
export function studyPathConceptIds(
  concepts: readonly PlogConcept[],
  edges: readonly PlogEdge[],
): number[] {
  const ordering = edges.filter((e) => ORDERING.has(e.edge_type));
  if (ordering.length === 0) return [];
  const incident = new Set<number>();
  for (const e of ordering) {
    incident.add(e.source_id);
    incident.add(e.target_id);
  }
  const conceptsById = new Set(concepts.map((c) => c.id));
  return topologicalConceptIds(concepts, edges).filter(
    (cid) => incident.has(cid) && conceptsById.has(cid),
  );
}

export function routeToConceptScored(
  queryEmbedding: readonly number[],
  graphs: readonly PlogGraphSnapshot[],
  minScore = 0.25,
): { score: number; graph: PlogGraphSnapshot; concept: PlogConcept } | null {
  let best: { score: number; graph: PlogGraphSnapshot; concept: PlogConcept } | null = null;
  for (const g of graphs) {
    if (g.concepts.length === 0) continue;
    const embeddings = g.concepts.map((c) => c.embedding);
    if (!embeddings.some((e) => e.length > 0)) continue;
    const idx = bestMatchIndex(queryEmbedding, embeddings);
    if (idx < 0) continue;
    const score = cosineSimilarity(queryEmbedding, embeddings[idx]!);
    if (best === null || score > best.score) {
      best = { score, graph: g, concept: g.concepts[idx]! };
    }
  }
  if (best === null || best.score < minScore) return null;
  return best;
}

export function nextHint(
  lo: PlogLearningObject | null | undefined,
  hintIndex: number,
): { text: string; index: number } {
  if (!lo) return { text: "", index: 0 };
  const ladder = lo.hint_ladder ?? [];
  if (ladder.length === 0) return { text: lo.opening_question || "", index: 0 };
  const idx = Math.max(0, Math.min(hintIndex, ladder.length - 1));
  return { text: ladder[idx]!, index: idx };
}

export function neighborhoodSummaries(
  graph: PlogGraphSnapshot,
  concept: PlogConcept,
  limit = 3,
): string[] {
  const scored: { level: number; text: string }[] = [];
  for (const n of graph.summary_nodes) {
    if (
      (n.start_sec <= concept.intro_sec && concept.intro_sec <= n.end_sec) ||
      Math.abs((n.start_sec + n.end_sec) / 2 - concept.intro_sec) < 180
    ) {
      scored.push({ level: n.level, text: n.text });
    }
  }
  scored.sort((a, b) => a.level - b.level);
  const texts = scored.slice(0, limit).map((s) => s.text);
  if (texts.length === 0 && graph.summary_nodes.length > 0) {
    const root = graph.summary_nodes.reduce((a, b) => (a.level >= b.level ? a : b));
    return [root.text];
  }
  return texts;
}

export function neighborhoodL0Scenes(
  scenes: readonly L0Scene[],
  concept: PlogConcept,
  opts?: { windowSec?: number; limit?: number },
): string[] {
  if (!scenes.length) return [];
  const windowSec = opts?.windowSec ?? 90;
  const limit = opts?.limit ?? 4;
  const intro = Number(concept.intro_sec || 0);
  const scored: { dist: number; text: string }[] = [];
  for (const sc of scenes) {
    const text = String(sc.text || "").trim();
    if (!text) continue;
    const start = Number(sc.start_sec || 0);
    const dist = Math.abs(start - intro);
    if (dist <= windowSec) scored.push({ dist, text });
  }
  scored.sort((a, b) => a.dist - b.dist);
  return scored.slice(0, limit).map((s) => s.text);
}

/** Algorithm 1 line 11: Retrieve(L0, L1, t). */
export function retrieveContext(
  graph: PlogGraphSnapshot,
  concept: PlogConcept,
  scenes?: readonly L0Scene[] | null,
): string[] {
  const l0 = neighborhoodL0Scenes(scenes ?? [], concept);
  const l1 = neighborhoodSummaries(graph, concept);
  return [...l0, ...l1];
}

export function orderingPathReady(graph: PlogGraphSnapshot): boolean {
  const ordering = orderingEdges(graph.edges);
  if (ordering.length === 0) return false;
  const pairs = ordering.map((e) => [String(e.source_id), String(e.target_id)] as const);
  if (!isDag(pairs)) return false;
  return studyPathConceptIds(graph.concepts, ordering).length > 0;
}

export const humanValidatedOrderingReady = orderingPathReady;

export function reachedConceptIds(states: readonly LearnerConceptState[]): Set<number> {
  return new Set(states.filter((s) => s.reached).map((s) => s.concept_id));
}

export function graphsHaveOrderingPath(graphs: readonly PlogGraphSnapshot[]): boolean {
  return graphs.some((g) => orderingPathReady(g));
}
