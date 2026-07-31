"""Evaluation metrics for PLOG (paper §4–5)."""

from __future__ import annotations

from collections import defaultdict, deque
from collections.abc import Iterable, Sequence

ORDERING = frozenset({"prerequisite_of", "builds_on"})


def concept_coverage(extracted: set[str], gold: set[str]) -> float:
    if not gold:
        return 0.0
    return len(extracted & gold) / len(gold)


def edge_prf(
    extracted: set[tuple[str, str]], gold: set[tuple[str, str]]
) -> tuple[float, float, float]:
    if not extracted and not gold:
        return 1.0, 1.0, 1.0
    tp = len(extracted & gold)
    p = tp / len(extracted) if extracted else 0.0
    r = tp / len(gold) if gold else 0.0
    f1 = 2 * p * r / (p + r) if (p + r) else 0.0
    return p, r, f1


def _transitive_closure(pairs: Iterable[tuple[str, str]]) -> set[tuple[str, str]]:
    adj: dict[str, set[str]] = defaultdict(set)
    nodes: set[str] = set()
    for a, b in pairs:
        adj[a].add(b)
        nodes.add(a)
        nodes.add(b)
    closure: set[tuple[str, str]] = set()
    for n in nodes:
        seen: set[str] = set()
        q = deque(adj.get(n, ()))
        while q:
            m = q.popleft()
            if m in seen:
                continue
            seen.add(m)
            closure.add((n, m))
            q.extend(adj.get(m, ()))
    return closure


def reachability_f1(
    extracted: set[tuple[str, str]], gold: set[tuple[str, str]]
) -> float:
    _, _, f1 = edge_prf(_transitive_closure(extracted), _transitive_closure(gold))
    return f1


def direction_agreement_and_inversion(
    extracted: set[tuple[str, str]], gold: set[tuple[str, str]]
) -> tuple[float, float]:
    """Among gold-ordered pairs present in both graphs (either direction)."""
    both_directions = 0
    agree = 0
    invert = 0
    extracted_set = extracted
    for a, b in gold:
        if (a, b) in extracted_set:
            both_directions += 1
            agree += 1
        elif (b, a) in extracted_set:
            both_directions += 1
            invert += 1
    if both_directions == 0:
        return 0.0, 0.0
    return agree / both_directions, invert / both_directions


def is_dag(pairs: Iterable[tuple[str, str]]) -> bool:
    adj: dict[str, set[str]] = defaultdict(set)
    indeg: dict[str, int] = defaultdict(int)
    nodes: set[str] = set()
    for a, b in pairs:
        nodes.add(a)
        nodes.add(b)
        if b not in adj[a]:
            adj[a].add(b)
            indeg[b] += 1
            indeg.setdefault(a, indeg.get(a, 0))
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


def prerequisite_violation_rate(
    responses: Sequence[dict],
) -> float:
    """
    Each response dict: {
      "mentioned": set[str],
      "introduced": set[str],  # Sr ∪ {cr}
    }
    PVR = fraction with V(r) non-empty.
    """
    if not responses:
        return 0.0
    violations = 0
    for r in responses:
        mentioned = set(r.get("mentioned") or [])
        introduced = set(r.get("introduced") or [])
        if mentioned - introduced:
            violations += 1
    return violations / len(responses)


def reveal_proxy(text: str, answer_cues: Sequence[str] | None = None) -> bool:
    """Lexical premature-reveal proxy (paper §5.5)."""
    cues = list(answer_cues or [])
    cues.extend(
        [
            "the answer is",
            "正解は",
            "答えは",
            "in other words, it is defined as",
            "定義すると",
        ]
    )
    lower = text.lower()
    return any(c.lower() in lower for c in cues)


def estimate_turn_cost_usd(
    *,
    fresh_input_tokens: int,
    cached_input_tokens: int,
    output_tokens: int,
    pin: float = 3.0,
    pout: float = 15.0,
    cache_read_factor: float = 0.1,
) -> float:
    """Analytical cost model from paper §4 (USD per 1M tokens prices)."""
    return (
        fresh_input_tokens * pin
        + cached_input_tokens * pin * cache_read_factor
        + output_tokens * pout
    ) / 1_000_000


def scaffold_features(text: str, has_waypoint_citation: bool) -> dict:
    """Binary scaffold features for rubric-style scoring."""
    return {
        "asks_question": "?" in text or "？" in text,
        "short": len(text) < 400,
        "no_long_definition": len(text) < 600,
        "has_waypoint": has_waypoint_citation,
        "not_empty": bool(text.strip()),
    }
