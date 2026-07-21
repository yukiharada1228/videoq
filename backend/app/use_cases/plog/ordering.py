"""Ordering helpers for PLOG use cases (no infrastructure imports)."""

from __future__ import annotations

from collections import defaultdict, deque
from typing import Sequence, Tuple

ORDERING = frozenset({"prerequisite_of", "builds_on"})
NODE_TYPES = frozenset({"object", "property", "limitation"})
EDGE_TYPES = frozenset(
    {
        "prerequisite_of",
        "builds_on",
        "analogy_for",
        "example_of",
        "contrasts_with",
    }
)


def is_dag(pairs: Sequence[Tuple[str, str]]) -> bool:
    """Return True when directed pairs form a DAG."""
    adj: dict[str, set[str]] = defaultdict(set)
    indeg: dict[str, int] = defaultdict(int)
    nodes: set[str] = set()
    for src, tgt in pairs:
        nodes.add(src)
        nodes.add(tgt)
        if tgt not in adj[src]:
            adj[src].add(tgt)
            indeg[tgt] += 1
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
