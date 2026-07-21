"""Deterministic post-processing for PLOG edges (paper §3.1)."""

from __future__ import annotations

import logging
import re
import unicodedata
from collections import defaultdict, deque
from typing import Dict, Iterable, List, Optional, Sequence, Set, Tuple

from app.domain.plog.gateways import ExtractedConcept, ExtractedEdge

logger = logging.getLogger(__name__)

ORDERING = frozenset({"prerequisite_of", "builds_on"})

# Strip punctuation / symbols that ASR and LLM quotes often disagree on.
_PUNCT_RE = re.compile(
    "["
    r"\s\u3000"
    r"、。．，,\.\uFF0C\uFF0E"
    r"・：:;；"
    r"「」『』【】\[\]\(\)（）\"'‘’“”"
    r"!！?？"
    r"‐‑‒–—―_"
    r"\-"
    r"]+"
)


def normalize_transcript_for_quote_match(text: str) -> str:
    """Normalize for ASR-tolerant quote grounding (JA/EN)."""
    if not text:
        return ""
    folded = unicodedata.normalize("NFKC", text).lower()
    return _PUNCT_RE.sub("", folded)


def quote_occurs_in_transcript(quote: str, transcript: str) -> bool:
    """Paper §3.1(a): quote must occur in the transcript after normalization."""
    if not quote or not quote.strip():
        return False
    q = normalize_transcript_for_quote_match(quote)
    t = normalize_transcript_for_quote_match(transcript)
    if not q:
        return False
    return q in t


def ground_edges(
    edges: Sequence[ExtractedEdge],
    transcript: str,
    scenes: Sequence[dict],
) -> List[ExtractedEdge]:
    """Paper §3.1(a): drop any edge whose quote does not occur in the transcript.

    No paraphrase recovery — unsupported citations are discarded.
    """
    del scenes  # reserved for intro inference elsewhere
    grounded: List[ExtractedEdge] = []
    dropped = 0
    for e in edges:
        if quote_occurs_in_transcript(e.quote or "", transcript):
            grounded.append(e)
        else:
            dropped += 1
    if dropped:
        logger.info(
            "PLOG edge grounding: kept=%s dropped=%s (unsupported quotes)",
            len(grounded),
            dropped,
        )
    return grounded


def ensure_ordering_path(
    concepts: Sequence[ExtractedConcept],
    edges: Sequence[ExtractedEdge],
    intro: Dict[str, float],
    transcript: str,
    scenes: Sequence[dict],
) -> List[ExtractedEdge]:
    """Deprecated recovery helper — not part of paper §3.1 deterministic checks.

    Kept for tests/experiments. Production ``apply_deterministic_checks`` does not
    synthesize ordering edges; the paper assumes Stage 2 + human validation yield
    a learning DAG.
    """
    del concepts, intro, transcript, scenes
    return list(edges)


def infer_intro_seconds(
    concepts: Sequence[ExtractedConcept], scenes: Sequence[dict]
) -> Dict[str, float]:
    """Prefer extractor timestamp; fall back to first sustained mention in scenes."""
    intro: Dict[str, float] = {}
    for c in concepts:
        intro[c.label] = float(c.timestamp_sec or 0.0)

    for c in concepts:
        label_l = normalize_transcript_for_quote_match(c.label)
        sustained = None
        for sc in scenes:
            text = normalize_transcript_for_quote_match(str(sc.get("text") or ""))
            if label_l and label_l in text:
                sustained = float(sc.get("start_sec") or 0.0)
                break
        if sustained is not None:
            # Prefer sustained mention if extractor timestamp is 0 or clearly early-announce
            if intro[c.label] <= 0.0 or abs(intro[c.label] - sustained) > 120:
                # Keep definitional cue if present and later than announce
                if intro[c.label] > 0 and intro[c.label] < sustained:
                    continue
                intro[c.label] = sustained
    return intro


def same_section(a_sec: float, b_sec: float, section_len: float = 300.0) -> bool:
    return abs(a_sec - b_sec) <= section_len


def retype_ordering_edges(
    edges: Sequence[ExtractedEdge], intro: Dict[str, float]
) -> List[ExtractedEdge]:
    """Derive ordering subtype from intro timeline (paper §3.1).

    - backfill (source introduced after target) → prerequisite_of
    - earlier × same section → builds_on
    - different section → prerequisite_of

    Automatic checks retype; human adjudication may separately reorient edges.
    """
    result: List[ExtractedEdge] = []
    for e in edges:
        if e.edge_type not in ORDERING:
            result.append(e)
            continue
        src_t = intro.get(e.source_label, 0.0)
        tgt_t = intro.get(e.target_label, 0.0)
        if src_t > tgt_t + 1e-6:
            edge_type = "prerequisite_of"
        elif same_section(src_t, tgt_t):
            edge_type = "builds_on"
        else:
            edge_type = "prerequisite_of"
        result.append(
            ExtractedEdge(
                source_label=e.source_label,
                target_label=e.target_label,
                edge_type=edge_type,
                quote=e.quote,
            )
        )
    return result


def drop_unsupported_quotes(
    edges: Sequence[ExtractedEdge], transcript: str
) -> List[ExtractedEdge]:
    return [e for e in edges if quote_occurs_in_transcript(e.quote, transcript)]


def ordering_forms_dag(edges: Sequence[ExtractedEdge]) -> bool:
    """True when ordering edges among present labels form a DAG."""
    ordering = [e for e in edges if e.edge_type in ORDERING]
    if not ordering:
        return True
    adj: Dict[str, Set[str]] = defaultdict(set)
    indeg: Dict[str, int] = defaultdict(int)
    nodes: Set[str] = set()
    for e in ordering:
        nodes.add(e.source_label)
        nodes.add(e.target_label)
        if e.target_label not in adj[e.source_label]:
            adj[e.source_label].add(e.target_label)
            indeg[e.target_label] += 1
        nodes.add(e.source_label)
    for n in nodes:
        indeg.setdefault(n, 0)
    q = deque([n for n in nodes if indeg[n] == 0])
    seen = 0
    while q:
        n = q.popleft()
        seen += 1
        for m in adj[n]:
            indeg[m] -= 1
            if indeg[m] == 0:
                q.append(m)
    return seen == len(nodes)


def break_cycles(edges: Sequence[ExtractedEdge]) -> List[ExtractedEdge]:
    """Legacy helper: greedily keep a DAG subset. Not used in production build.

    Paper §4: cycles are resolved in the human adjudication pass (reject /
    reorient), not by silently dropping edges during automatic checks.
    """
    ordering = [e for e in edges if e.edge_type in ORDERING]
    non_ordering = [e for e in edges if e.edge_type not in ORDERING]
    if not ordering:
        return list(edges)

    kept: List[ExtractedEdge] = []
    for e in ordering:
        trial = kept + [e]
        if ordering_forms_dag(trial):
            kept.append(e)
    return non_ordering + kept


def apply_deterministic_checks(
    concepts: Sequence[ExtractedConcept],
    edges: Sequence[ExtractedEdge],
    transcript: str,
    scenes: Sequence[dict],
) -> Tuple[Dict[str, float], List[ExtractedEdge]]:
    """Paper §3.1 automatic checks only: (a) quote drop, (b) intro retype.

    Cycle resolution and synonym merges are left to the human pass.
    """
    intro = infer_intro_seconds(concepts, scenes)
    grounded = ground_edges(edges, transcript, scenes)
    with_path = ensure_ordering_path(concepts, grounded, intro, transcript, scenes)
    retyped = retype_ordering_edges(with_path, intro)
    if not ordering_forms_dag(retyped):
        logger.info(
            "PLOG ordering graph has a cycle after automatic checks; "
            "human adjudication must reject or reorient edges before study mode."
        )
    return intro, retyped


def topological_order(labels: Iterable[str], edges: Sequence[ExtractedEdge]) -> List[str]:
    nodes = list(dict.fromkeys(labels))
    adj: Dict[str, Set[str]] = defaultdict(set)
    indeg: Dict[str, int] = {n: 0 for n in nodes}
    for e in edges:
        if e.edge_type not in ORDERING:
            continue
        if e.source_label not in indeg or e.target_label not in indeg:
            continue
        if e.target_label not in adj[e.source_label]:
            adj[e.source_label].add(e.target_label)
            indeg[e.target_label] += 1
    q = deque(sorted([n for n in nodes if indeg[n] == 0]))
    order: List[str] = []
    while q:
        n = q.popleft()
        order.append(n)
        for m in sorted(adj[n]):
            indeg[m] -= 1
            if indeg[m] == 0:
                q.append(m)
    # Append any leftover (shouldn't happen if DAG)
    for n in nodes:
        if n not in order:
            order.append(n)
    return order
