"""RAPTOR-style hierarchical summary builder for PLOG L1."""

from __future__ import annotations

import logging
import math
from typing import List, Optional, Sequence

from langchain_core.messages import HumanMessage, SystemMessage

from app.domain.plog.gateways import HierarchyBuildResult, PlogHierarchyBuilder, TokenUsage
from app.infrastructure.external.llm import get_langchain_llm

logger = logging.getLogger(__name__)

_LEAF_CLUSTER_SIZE = 4
_SUMMARY_PROMPT = (
    "Summarize the following contiguous lecture segments into 2-4 sentences. "
    "Preserve pedagogical before/after context and key terms. "
    "Respond in the same language as the input."
)


def _estimate_tokens(text: str) -> int:
    return max(1, math.ceil(len(text) / 4))


class RaptorHierarchyBuilder(PlogHierarchyBuilder):
    def build(self, scenes: Sequence[dict], api_key: Optional[str] = None) -> HierarchyBuildResult:
        if not scenes:
            return HierarchyBuildResult(nodes=[], usage=TokenUsage())

        usage = TokenUsage()
        llm = get_langchain_llm(api_key=api_key)

        # Level 0: leaf summaries over adjacent scene clusters
        leaves: List[dict] = []
        for i in range(0, len(scenes), _LEAF_CLUSTER_SIZE):
            cluster = list(scenes[i : i + _LEAF_CLUSTER_SIZE])
            joined = "\n".join(
                f"[{sc.get('start_time', '')}-{sc.get('end_time', '')}] {sc.get('text', '')}"
                for sc in cluster
            )
            summary, u = self._summarize(llm, joined)
            usage = usage.add(u)
            leaves.append(
                {
                    "temp_id": f"L0-{i}",
                    "parent_temp_id": None,
                    "level": 0,
                    "text": summary,
                    "start_sec": float(cluster[0].get("start_sec", 0.0)),
                    "end_sec": float(cluster[-1].get("end_sec", 0.0)),
                    "scene_indices": [
                        int(sc.get("index", sc.get("scene_index", i + j)))
                        for j, sc in enumerate(cluster)
                    ],
                }
            )

        all_nodes: List[dict] = list(leaves)
        current = leaves
        level = 1
        while len(current) > 1:
            parents: List[dict] = []
            for i in range(0, len(current), _LEAF_CLUSTER_SIZE):
                cluster = current[i : i + _LEAF_CLUSTER_SIZE]
                joined = "\n".join(n["text"] for n in cluster)
                summary, u = self._summarize(llm, joined)
                usage = usage.add(u)
                parent_temp = f"L{level}-{i}"
                for child in cluster:
                    child["parent_temp_id"] = parent_temp
                parents.append(
                    {
                        "temp_id": parent_temp,
                        "parent_temp_id": None,
                        "level": level,
                        "text": summary,
                        "start_sec": float(cluster[0]["start_sec"]),
                        "end_sec": float(cluster[-1]["end_sec"]),
                        "scene_indices": sorted(
                            {idx for n in cluster for idx in n.get("scene_indices", [])}
                        ),
                    }
                )
            all_nodes.extend(parents)
            current = parents
            level += 1

        return HierarchyBuildResult(nodes=all_nodes, usage=usage)

    def _summarize(self, llm, text: str) -> tuple[str, TokenUsage]:
        messages = [
            SystemMessage(content=_SUMMARY_PROMPT),
            HumanMessage(content=text[:12000]),
        ]
        try:
            response = llm.invoke(messages)
            content = response.content if isinstance(response.content, str) else str(response.content)
            meta = getattr(response, "usage_metadata", None) or {}
            usage = TokenUsage(
                input_tokens=int(meta.get("input_tokens") or _estimate_tokens(text)),
                output_tokens=int(meta.get("output_tokens") or _estimate_tokens(content)),
            )
            return content.strip() or text[:500], usage
        except Exception:
            logger.exception("L1 summary failed; falling back to truncation")
            fallback = text[:500]
            return fallback, TokenUsage(
                input_tokens=_estimate_tokens(text),
                output_tokens=_estimate_tokens(fallback),
            )
