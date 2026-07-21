"""Runtime graph helpers for prerequisite gating (Algorithm 1)."""

from __future__ import annotations

import re
import unicodedata
from collections import defaultdict, deque
from typing import Dict, Iterable, List, Optional, Sequence, Set, Tuple

from app.domain.plog.entities import (
    LearnerConceptStateEntity,
    PlogConceptEntity,
    PlogEdgeEntity,
    PlogGraphSnapshot,
    PlogLearningObjectEntity,
)
from app.domain.plog.gateways import ExtractedConcept
from app.infrastructure.external.plog.embeddings import best_match_index, cosine_similarity

ORDERING = frozenset({"prerequisite_of", "builds_on"})


def canonical_concept_label(label: str) -> str:
    """Normalize a label for exact duplicate detection (NFKC / case / spaces).

    Paper synonym merges happen in human adjudication; runtime only collapses
    exact duplicates after light normalization — no suffix heuristics.
    """
    text = unicodedata.normalize("NFKC", (label or "").strip().lower())
    return re.sub(r"\s+", "", text)


def labels_near_duplicate(a: str, b: str) -> bool:
    """True when labels are exact duplicates after light normalization."""
    ca = canonical_concept_label(a)
    cb = canonical_concept_label(b)
    return bool(ca) and ca == cb


def covered_concept_ids(
    reached: Iterable[int],
    concepts_by_id: Dict[int, PlogConceptEntity],
) -> Set[int]:
    """Reached IDs plus exact-normalized duplicate labels."""
    reached_set = {cid for cid in reached if cid in concepts_by_id}
    covered = set(reached_set)
    reached_labels = [concepts_by_id[cid].label for cid in reached_set]
    for cid, concept in concepts_by_id.items():
        if cid in covered:
            continue
        if any(labels_near_duplicate(concept.label, lab) for lab in reached_labels):
            covered.add(cid)
    return covered


_NODE_TYPE_RANK = {"object": 0, "limitation": 1, "property": 2}


def merge_near_duplicate_concepts(
    concepts: Sequence["ExtractedConcept"],
) -> List["ExtractedConcept"]:
    """Collapse exact-normalized duplicate inventory labels only.

    Broader synonym / granularity merges are a human adjudication step (paper §3.1).
    """
    from app.domain.plog.gateways import ExtractedConcept

    groups: Dict[str, List[tuple[int, ExtractedConcept]]] = defaultdict(list)
    passthrough: List[ExtractedConcept] = []
    for index, concept in enumerate(concepts):
        key = canonical_concept_label(concept.label)
        if not key:
            passthrough.append(concept)
            continue
        groups[key].append((index, concept))

    survivors: List[tuple[int, ExtractedConcept]] = [
        (i, c) for i, c in enumerate(passthrough)
    ]
    for _key, members in groups.items():
        members.sort(
            key=lambda item: (
                _NODE_TYPE_RANK.get((item[1].node_type or "object").lower(), 9),
                float(item[1].timestamp_sec or 0.0),
                item[0],
            )
        )
        idx, survivor = members[0]
        if len(members) > 1:
            quotes = [m.source_quote for _, m in members if m.source_quote]
            if quotes and not survivor.source_quote:
                survivor = ExtractedConcept(
                    label=survivor.label,
                    timestamp_sec=survivor.timestamp_sec,
                    node_type=survivor.node_type,
                    source_quote=quotes[0],
                )
        survivors.append((idx, survivor))

    survivors.sort(key=lambda item: (float(item[1].timestamp_sec or 0.0), item[0]))
    return [c for _, c in survivors]


def next_uncovered_in_order(
    order: Sequence[int],
    reached: Iterable[int],
    concepts_by_id: Dict[int, PlogConceptEntity],
    *,
    after_id: Optional[int] = None,
) -> Optional[int]:
    """Next concept on the topo path that is not covered by reached (+ synonyms)."""
    covered = covered_concept_ids(reached, concepts_by_id)
    start = 0
    if after_id is not None:
        try:
            start = list(order).index(after_id) + 1
        except ValueError:
            start = 0
    for cid in order[start:]:
        if cid not in covered and cid in concepts_by_id:
            return cid
    return None


def near_duplicate_ids(
    concept_id: int, concepts_by_id: Dict[int, PlogConceptEntity]
) -> Set[int]:
    """IDs of concepts that are the same teachable unit as ``concept_id`` (incl. self)."""
    concept = concepts_by_id.get(concept_id)
    if concept is None:
        return set()
    return {
        cid
        for cid, other in concepts_by_id.items()
        if labels_near_duplicate(concept.label, other.label)
    }


def ordering_edges(edges: List[PlogEdgeEntity]) -> List[PlogEdgeEntity]:
    """Return ordering edges (existence = in graph; no accept/reject gate)."""
    return [e for e in edges if e.edge_type in ORDERING]


def ancestors(concept_id: int, edges: List[PlogEdgeEntity]) -> Set[int]:
    """Nodes that must come before concept_id (sources pointing toward it transitively)."""
    # Edge source -> target means source precedes target
    parents: Dict[int, Set[int]] = defaultdict(set)
    for e in edges:
        if e.edge_type in ORDERING:
            parents[e.target_id].add(e.source_id)
    reached: Set[int] = set()
    q = deque(parents.get(concept_id, ()))
    while q:
        n = q.popleft()
        if n in reached:
            continue
        reached.add(n)
        q.extend(parents.get(n, ()))
    return reached


def descendants(concept_id: int, edges: List[PlogEdgeEntity]) -> Set[int]:
    children: Dict[int, Set[int]] = defaultdict(set)
    for e in edges:
        if e.edge_type in ORDERING:
            children[e.source_id].add(e.target_id)
    reached: Set[int] = set()
    q = deque(children.get(concept_id, ()))
    while q:
        n = q.popleft()
        if n in reached:
            continue
        reached.add(n)
        q.extend(children.get(n, ()))
    return reached


def prerequisites_of(concept_id: int, edges: List[PlogEdgeEntity]) -> Set[int]:
    return {
        e.source_id
        for e in edges
        if e.edge_type in ORDERING and e.target_id == concept_id
    }


def select_nearest_unmet(
    unmet: Set[int], concepts_by_id: Dict[int, PlogConceptEntity]
) -> Optional[int]:
    if not unmet:
        return None
    return min(unmet, key=lambda cid: concepts_by_id[cid].intro_sec)


def topological_concept_ids(
    concepts: List[PlogConceptEntity], edges: List[PlogEdgeEntity]
) -> List[int]:
    ids = [c.id for c in concepts]
    indeg = {cid: 0 for cid in ids}
    adj: Dict[int, Set[int]] = defaultdict(set)
    id_set = set(ids)
    for e in edges:
        if e.edge_type not in ORDERING:
            continue
        if e.source_id not in id_set or e.target_id not in id_set:
            continue
        if e.target_id not in adj[e.source_id]:
            adj[e.source_id].add(e.target_id)
            indeg[e.target_id] += 1
    q = deque(sorted([i for i in ids if indeg[i] == 0], key=lambda i: next(c.intro_sec for c in concepts if c.id == i)))
    order: List[int] = []
    while q:
        n = q.popleft()
        order.append(n)
        for m in sorted(adj[n]):
            indeg[m] -= 1
            if indeg[m] == 0:
                q.append(m)
    for cid in ids:
        if cid not in order:
            order.append(cid)
    return order


def study_path_concept_ids(
    concepts: List[PlogConceptEntity], edges: List[PlogEdgeEntity]
) -> List[int]:
    """Canonical learning path = topo order over the ordering DAG (paper §3).

    Only nodes incident to ordering edges are on the forced path. If Stage 2
    produced no ordering edges, the path is empty — paper §3.1 does not
    synthesize a timeline chain; human validation is expected to supply a DAG.
    """
    ordering = [e for e in edges if e.edge_type in ORDERING]
    if not ordering:
        return []
    incident: Set[int] = set()
    for e in ordering:
        incident.add(e.source_id)
        incident.add(e.target_id)
    concepts_by_id = {c.id: c for c in concepts}
    return [
        cid
        for cid in topological_concept_ids(concepts, edges)
        if cid in incident and cid in concepts_by_id
    ]


def route_to_concept(
    query_embedding: List[float],
    graphs: List[PlogGraphSnapshot],
    *,
    min_score: float = 0.25,
) -> Optional[Tuple[PlogGraphSnapshot, PlogConceptEntity]]:
    scored = route_to_concept_scored(query_embedding, graphs, min_score=min_score)
    if scored is None:
        return None
    _score, graph, concept = scored
    return graph, concept


def route_to_concept_scored(
    query_embedding: List[float],
    graphs: List[PlogGraphSnapshot],
    *,
    min_score: float = 0.25,
) -> Optional[Tuple[float, PlogGraphSnapshot, PlogConceptEntity]]:
    """Retrieval-only RouteToConcept with cosine score (Algorithm 1 line 1)."""
    best: Optional[Tuple[float, PlogGraphSnapshot, PlogConceptEntity]] = None
    for g in graphs:
        if not g.concepts:
            continue
        embeddings = [c.embedding for c in g.concepts]
        if not any(embeddings):
            continue
        idx = best_match_index(query_embedding, embeddings)
        if idx < 0:
            continue
        score = cosine_similarity(query_embedding, embeddings[idx])
        if best is None or score > best[0]:
            best = (score, g, g.concepts[idx])
    if best is None or best[0] < min_score:
        return None
    return best


def next_hint(
    lo: Optional[PlogLearningObjectEntity], hint_index: int
) -> Tuple[str, int]:
    if lo is None:
        return "", 0
    ladder = lo.hint_ladder or []
    if not ladder:
        return lo.opening_question or "", 0
    idx = max(0, min(hint_index, len(ladder) - 1))
    return ladder[idx], idx


def neighborhood_summaries(
    graph: PlogGraphSnapshot, concept: PlogConceptEntity, limit: int = 3
) -> List[str]:
    """Pick L1 nodes whose time span covers the concept intro."""
    scored = []
    for n in graph.summary_nodes:
        if n.start_sec <= concept.intro_sec <= n.end_sec or (
            abs((n.start_sec + n.end_sec) / 2 - concept.intro_sec) < 180
        ):
            scored.append((n.level, n.text))
    scored.sort(key=lambda x: x[0])  # prefer lower/local first, then higher
    texts = [t for _, t in scored[:limit]]
    if not texts and graph.summary_nodes:
        # Root-ish (highest level)
        root = max(graph.summary_nodes, key=lambda n: n.level)
        texts = [root.text]
    return texts


def neighborhood_l0_scenes(
    scenes: Sequence[dict],
    concept: PlogConceptEntity,
    *,
    window_sec: float = 90.0,
    limit: int = 4,
) -> List[str]:
    """Algorithm 1 Retrieve(L0, …): timestamped transcript segments near the concept."""
    if not scenes:
        return []
    intro = float(concept.intro_sec or 0.0)
    scored: List[Tuple[float, str]] = []
    for sc in scenes:
        text = str(sc.get("text") or "").strip()
        if not text:
            continue
        start = float(sc.get("start_sec") or 0.0)
        dist = abs(start - intro)
        if dist <= window_sec:
            scored.append((dist, text))
    scored.sort(key=lambda item: item[0])
    return [text for _, text in scored[:limit]]


def retrieve_context(
    graph: PlogGraphSnapshot,
    concept: PlogConceptEntity,
    scenes: Sequence[dict] | None = None,
) -> List[str]:
    """Algorithm 1 line 11: Retrieve(L0, L1, t)."""
    l0 = neighborhood_l0_scenes(scenes or [], concept)
    l1 = neighborhood_summaries(graph, concept)
    return l0 + l1


def ordering_path_ready(graph: PlogGraphSnapshot) -> bool:
    """True when existing ordering edges form a DAG with a non-empty study path."""
    from app.infrastructure.external.plog.metrics import is_dag

    ordering = ordering_edges(graph.edges)
    if not ordering:
        return False
    pairs = [(str(e.source_id), str(e.target_id)) for e in ordering]
    if not is_dag(pairs):
        return False
    return bool(study_path_concept_ids(graph.concepts, ordering))


# Backward-compatible alias (product no longer uses human accept/reject).
human_validated_ordering_ready = ordering_path_ready


def reached_concept_ids(states: List[LearnerConceptStateEntity]) -> Set[int]:
    return {s.concept_id for s in states if s.reached}
