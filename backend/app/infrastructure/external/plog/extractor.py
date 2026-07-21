"""Two-stage LLM extractor for PLOG L2 concepts, edges, and learning objects."""

from __future__ import annotations

import json
import logging
import math
import re
from typing import Any, List, Optional, Sequence

from langchain_core.messages import HumanMessage, SystemMessage

from app.domain.plog.gateways import (
    ExtractedConcept,
    ExtractedEdge,
    ExtractedLearningObject,
    PlogConceptExtractor,
    Stage1Result,
    Stage2Result,
    TokenUsage,
)
from app.infrastructure.external.llm import get_langchain_extraction_llm
from app.infrastructure.external.prompts import (
    build_fallback_learning_object,
    detect_transcript_locale,
    normalize_learning_object_for_locale,
)

logger = logging.getLogger(__name__)

_STAGE1_SYSTEM = """You extract a concept inventory from a lecture transcript.
Return ONLY valid JSON:
{"concepts":[{"label":"...","timestamp_sec":0.0,"node_type":"object|property|limitation","source_quote":"..."}]}
Rules:
- Extract pedagogically meaningful concepts taught in the lecture.
- Do NOT invent relations or edges.
- timestamp_sec is when the concept is introduced (definitional cue preferred).
- source_quote must be a short verbatim span from the transcript when possible.
- node_type: object (thing/method), property (attribute), limitation (failure mode).
- Granularity (critical): do NOT invent separate inventory nodes for the same teachable unit
  (e.g. "NOT gate" and "NOT gate output", or a term and its trivial attribute). Merge those
  into one object node; put attributes into that node's later learning object instead.
- Prefer a compact inventory of distinct teaching targets; use property/limitation only when
  the lecture treats them as a distinct concept (not a restatement of an object).
"""

_STAGE2_SYSTEM = """You extract typed pedagogical edges and learning objects for a FIXED concept inventory.
Return ONLY valid JSON:
{
  "edges":[{"source":"...","target":"...","edge_type":"prerequisite_of|builds_on|analogy_for|example_of|contrasts_with","quote":"..."}],
  "learning_objects":[{
    "concept":"...",
    "opening_question":"...",
    "hint_ladder":["hint1","hint2","hint3"],
    "misconceptions":["..."],
    "canonical_order":["step1","step2"],
    "worked_examples":["..."],
    "waypoints":[{"start_sec":0.0,"end_sec":0.0,"label":"..."}]
  }]
}
Rules:
- Use ONLY concept labels from the provided inventory (exact match).
- Every edge MUST include a verbatim quote copied from the transcript (do not paraphrase).
- Prefer short contiguous spans that appear exactly in the transcript text.
- Extract as many supported ordering edges (prerequisite_of, builds_on) as the lecture justifies; do not leave the graph disconnected when the lecture clearly sequences concepts.
- Ordering edges (prerequisite_of, builds_on) must form a DAG.
- Learning objects are Socratic scaffolds: do not reveal the full answer in opening_question.
- Prefer Japanese or English matching the lecture language.
"""


def _estimate_tokens(text: str) -> int:
    return max(1, math.ceil(len(text) / 4))


def _extract_json_array_after_key(text: str, key: str) -> Optional[list]:
    """Best-effort recovery of a JSON array value when the full object is truncated."""
    marker = f'"{key}"'
    idx = text.find(marker)
    if idx < 0:
        return None
    colon = text.find(":", idx + len(marker))
    if colon < 0:
        return None
    i = colon + 1
    while i < len(text) and text[i].isspace():
        i += 1
    if i >= len(text) or text[i] != "[":
        return None
    depth = 0
    in_str = False
    escape = False
    for j in range(i, len(text)):
        ch = text[j]
        if in_str:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
        elif ch == "[":
            depth += 1
        elif ch == "]":
            depth -= 1
            if depth == 0:
                try:
                    data = json.loads(text[i : j + 1])
                    return data if isinstance(data, list) else None
                except json.JSONDecodeError:
                    return None
    return None


def _parse_json_content(content: str) -> dict:
    text = content.strip()
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if fence:
        text = fence.group(1).strip()
    try:
        data = json.loads(text)
        return data if isinstance(data, dict) else {}
    except json.JSONDecodeError:
        pass

    # Try to find outermost object
    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        try:
            data = json.loads(text[start : end + 1])
            if isinstance(data, dict):
                return data
        except json.JSONDecodeError:
            pass

    # Truncated Stage2 payloads often complete ``edges`` before cutting LOs.
    salvaged: dict = {}
    edges = _extract_json_array_after_key(text, "edges")
    if edges is not None:
        salvaged["edges"] = edges
    concepts = _extract_json_array_after_key(text, "concepts")
    if concepts is not None:
        salvaged["concepts"] = concepts
    los = _extract_json_array_after_key(text, "learning_objects")
    if los is not None:
        salvaged["learning_objects"] = los
    if salvaged:
        logger.warning(
            "PLOG JSON truncated; salvaged keys=%s", sorted(salvaged.keys())
        )
    return salvaged


def _usage_from_response(response: Any, prompt: str, content: str) -> TokenUsage:
    meta = getattr(response, "usage_metadata", None) or {}
    return TokenUsage(
        input_tokens=int(meta.get("input_tokens") or _estimate_tokens(prompt)),
        output_tokens=int(meta.get("output_tokens") or _estimate_tokens(content)),
    )


class LlmPlogConceptExtractor(PlogConceptExtractor):
    def extract_inventory(
        self, transcript_text: str, scenes: Sequence[dict], api_key: Optional[str] = None
    ) -> Stage1Result:
        llm = get_langchain_extraction_llm(api_key=api_key)
        scene_index = "\n".join(
            f"- {sc.get('start_sec', 0):.1f}s: {str(sc.get('text', ''))[:120]}"
            for sc in scenes[:80]
        )
        prompt = (
            f"Transcript (truncated):\n{transcript_text[:20000]}\n\n"
            f"Scene timeline:\n{scene_index}\n"
        )
        messages = [
            SystemMessage(content=_STAGE1_SYSTEM),
            HumanMessage(content=prompt),
        ]
        try:
            response = llm.invoke(messages)
            content = (
                response.content if isinstance(response.content, str) else str(response.content)
            )
            data = _parse_json_content(content)
            concepts: List[ExtractedConcept] = []
            seen = set()
            for raw in data.get("concepts") or []:
                if not isinstance(raw, dict):
                    continue
                label = str(raw.get("label") or "").strip()
                if not label or label.lower() in seen:
                    continue
                seen.add(label.lower())
                node_type = str(raw.get("node_type") or "object").strip().lower()
                if node_type not in {"object", "property", "limitation"}:
                    node_type = "object"
                concepts.append(
                    ExtractedConcept(
                        label=label[:255],
                        timestamp_sec=float(raw.get("timestamp_sec") or 0.0),
                        node_type=node_type,
                        source_quote=str(raw.get("source_quote") or ""),
                    )
                )
            return Stage1Result(
                concepts=concepts,
                usage=_usage_from_response(response, prompt, content),
            )
        except Exception:
            logger.exception("Stage1 concept extraction failed")
            return Stage1Result(concepts=[], usage=TokenUsage())

    def extract_edges_and_objects(
        self,
        transcript_text: str,
        concepts: Sequence[ExtractedConcept],
        scenes: Sequence[dict],
        api_key: Optional[str] = None,
    ) -> Stage2Result:
        if not concepts:
            return Stage2Result(edges=[], learning_objects=[], usage=TokenUsage())

        llm = get_langchain_extraction_llm(api_key=api_key)
        inventory = [{"label": c.label, "intro_sec": c.timestamp_sec, "node_type": c.node_type} for c in concepts]
        labels = {c.label for c in concepts}
        prompt = (
            f"Fixed inventory:\n{json.dumps(inventory, ensure_ascii=False)}\n\n"
            f"Transcript (truncated):\n{transcript_text[:18000]}\n"
        )
        messages = [
            SystemMessage(content=_STAGE2_SYSTEM),
            HumanMessage(content=prompt),
        ]
        try:
            response = llm.invoke(messages)
            content = (
                response.content if isinstance(response.content, str) else str(response.content)
            )
            data = _parse_json_content(content)
            edges: List[ExtractedEdge] = []
            for raw in data.get("edges") or []:
                if not isinstance(raw, dict):
                    continue
                source = str(raw.get("source") or "").strip()
                target = str(raw.get("target") or "").strip()
                edge_type = str(raw.get("edge_type") or "").strip()
                quote = str(raw.get("quote") or "").strip()
                if source not in labels or target not in labels or source == target:
                    continue
                if edge_type not in {
                    "prerequisite_of",
                    "builds_on",
                    "analogy_for",
                    "example_of",
                    "contrasts_with",
                }:
                    continue
                edges.append(
                    ExtractedEdge(
                        source_label=source,
                        target_label=target,
                        edge_type=edge_type,
                        quote=quote,
                    )
                )

            learning_objects: List[ExtractedLearningObject] = []
            for raw in data.get("learning_objects") or []:
                if not isinstance(raw, dict):
                    continue
                concept = str(raw.get("concept") or "").strip()
                if concept not in labels:
                    continue
                waypoints = []
                for wp in raw.get("waypoints") or []:
                    if isinstance(wp, dict):
                        waypoints.append(
                            {
                                "start_sec": float(wp.get("start_sec") or 0.0),
                                "end_sec": float(wp.get("end_sec") or 0.0),
                                "label": str(wp.get("label") or ""),
                            }
                        )
                learning_objects.append(
                    ExtractedLearningObject(
                        concept_label=concept,
                        opening_question=str(raw.get("opening_question") or ""),
                        hint_ladder=[str(h) for h in (raw.get("hint_ladder") or []) if h],
                        misconceptions=[
                            str(m) for m in (raw.get("misconceptions") or []) if m
                        ],
                        canonical_order=[
                            str(s) for s in (raw.get("canonical_order") or []) if s
                        ],
                        worked_examples=[
                            str(e) for e in (raw.get("worked_examples") or []) if e
                        ],
                        waypoints=waypoints,
                    )
                )

            # Ensure every concept has a locale-matched LO shell
            locale = detect_transcript_locale(transcript_text)
            have = {lo.concept_label for lo in learning_objects}
            for c in concepts:
                if c.label not in have:
                    fb = build_fallback_learning_object(c.label, locale)
                    learning_objects.append(
                        ExtractedLearningObject(
                            concept_label=c.label,
                            opening_question=fb["opening_question"],
                            hint_ladder=fb["hint_ladder"],
                        )
                    )
                else:
                    for i, lo in enumerate(learning_objects):
                        if lo.concept_label != c.label:
                            continue
                        normalized = normalize_learning_object_for_locale(
                            c.label,
                            opening_question=lo.opening_question,
                            hint_ladder=lo.hint_ladder,
                            locale=locale,
                        )
                        learning_objects[i] = ExtractedLearningObject(
                            concept_label=lo.concept_label,
                            opening_question=normalized["opening_question"],
                            hint_ladder=normalized["hint_ladder"],
                            misconceptions=lo.misconceptions,
                            canonical_order=lo.canonical_order,
                            worked_examples=lo.worked_examples,
                            waypoints=lo.waypoints,
                        )
                        break

            return Stage2Result(
                edges=edges,
                learning_objects=learning_objects,
                usage=_usage_from_response(response, prompt, content),
            )
        except Exception:
            logger.exception("Stage2 edge/LO extraction failed")
            locale = detect_transcript_locale(transcript_text)
            return Stage2Result(
                edges=[],
                learning_objects=[
                    ExtractedLearningObject(
                        concept_label=c.label,
                        **build_fallback_learning_object(c.label, locale, short=True),
                    )
                    for c in concepts
                ],
                usage=TokenUsage(),
            )
