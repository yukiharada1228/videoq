"""PLOG-guided study-mode chat gateway (Algorithm 1)."""

from __future__ import annotations

import json
import logging
from typing import Iterator, List, Optional, Sequence, Tuple

from langchain_core.prompts import ChatPromptTemplate
from openai import AuthenticationError as OpenAIAuthenticationError

from app.domain.chat.dtos import ChatMessageDTO, CitationDTO
from app.domain.chat.gateways import (
    LLMConfigurationError,
    LLMProviderError,
    RagGateway,
    RagResult,
    RagStreamChunk,
    RagUserNotFoundError,
)
from app.domain.plog.entities import PlogConceptEntity, PlogGraphSnapshot
from app.domain.plog.repositories import PlogRepository
from app.domain.shared.exceptions import ProviderConfigError
from app.infrastructure.external.llm import (
    get_langchain_grading_llm,
    get_langchain_study_llm,
)
from app.infrastructure.external.plog.embeddings import (
    LangchainPlogEmbeddingGateway,
    cosine_similarity,
)
from app.infrastructure.external.plog.learner_state_store import (
    LearnerStateStore,
    build_learner_state_store,
)
from app.infrastructure.external.plog.runtime import (
    covered_concept_ids,
    descendants,
    ordering_path_ready,
    near_duplicate_ids,
    next_hint,
    next_uncovered_in_order,
    ordering_edges,
    prerequisites_of,
    reached_concept_ids,
    retrieve_context,
    route_to_concept_scored,
    select_nearest_unmet,
    study_path_concept_ids,
)
from app.infrastructure.external.plog.metrics import reveal_proxy
from app.infrastructure.external.prompts import get_plog_study_config, resolve_opening_question
from app.infrastructure.models import Video
from app.infrastructure.scene_otsu.parsers import SubtitleParser
from django.contrib.auth import get_user_model

logger = logging.getLogger(__name__)

# Paper §3.3: static prefix is cached; only the learner's short latest turn is fresh.
# No multi-turn history in the generative call (history is encoded via GradeReply / hint).
_STUDY_PROMPT = ChatPromptTemplate.from_messages(
    [
        ("system", "{system_prompt}"),
        ("human", "{input}"),
    ]
)

_GRADE_PROMPT = ChatPromptTemplate.from_messages(
    [
        ("system", "{grade_system}"),
        (
            "human",
            "Concept: {concept}\n"
            "Tutor's previous question: {tutor_question}\n"
            "Learner reply: {reply}",
        ),
    ]
)


class PlogNotReadyError(Exception):
    """Raised when study mode is requested but no ready PLOG graph exists."""


class PlogGuidedChatGateway(RagGateway):
    """Implements guided learning over PLOG retrieval data."""

    def __init__(self, plog_repo: PlogRepository):
        self.plog_repo = plog_repo
        self.embedder = LangchainPlogEmbeddingGateway()

    def generate_reply(
        self,
        messages: Sequence[ChatMessageDTO],
        user_id: int,
        video_ids: Optional[Sequence[int]] = None,
        locale: Optional[str] = None,
        api_key: Optional[str] = None,
        group_context: Optional[str] = None,
        persist_learner_state: bool = True,
        learner_session_key: Optional[str] = None,
    ) -> RagResult:
        del group_context
        User = get_user_model()
        try:
            User.objects.get(pk=user_id)
        except User.DoesNotExist as exc:
            raise RagUserNotFoundError(f"User not found: {user_id}") from exc

        query = _latest_user_query(messages)
        result = self._run_turn(
            user_id,
            query,
            messages,
            video_ids,
            api_key,
            locale=locale,
            persist_learner_state=persist_learner_state,
            learner_session_key=learner_session_key,
        )
        return result

    def stream_reply(
        self,
        messages: Sequence[ChatMessageDTO],
        user_id: int,
        video_ids: Optional[Sequence[int]] = None,
        locale: Optional[str] = None,
        api_key: Optional[str] = None,
        group_context: Optional[str] = None,
        persist_learner_state: bool = True,
        learner_session_key: Optional[str] = None,
    ) -> Iterator[RagStreamChunk]:
        result = self.generate_reply(
            messages=messages,
            user_id=user_id,
            video_ids=video_ids,
            locale=locale,
            api_key=api_key,
            group_context=group_context,
            persist_learner_state=persist_learner_state,
            learner_session_key=learner_session_key,
        )
        if result.content:
            yield RagStreamChunk(text=result.content)
        yield RagStreamChunk(
            is_final=True,
            citations=result.citations,
            query_text=result.query_text,
            retrieved_contexts=result.retrieved_contexts,
        )

    def _run_turn(
        self,
        user_id: int,
        query: str,
        messages: Sequence[ChatMessageDTO],
        video_ids: Optional[Sequence[int]],
        api_key: Optional[str],
        locale: Optional[str] = None,
        persist_learner_state: bool = True,
        learner_session_key: Optional[str] = None,
    ) -> RagResult:
        if not video_ids:
            raise PlogNotReadyError("Study mode requires a video group with members.")

        graphs = self.plog_repo.list_ready_graphs(list(video_ids))
        if not graphs:
            raise PlogNotReadyError(
                "PLOG is not ready for this group's videos. Wait for build or rebuild."
            )

        study_cfg = get_plog_study_config(locale)
        if not _graphs_have_ordering_path(graphs):
            raise PlogNotReadyError(
                str(
                    study_cfg.get("needs_ordering_path")
                    or study_cfg.get("needs_human_validation")
                    or "Study mode needs ordering edges that form a DAG path. "
                    "Open the learning graph panel to edit or delete edges."
                )
            )

        store = build_learner_state_store(
            plog_repo=self.plog_repo,
            user_id=user_id,
            persist=persist_learner_state,
            session_key=learner_session_key,
            graphs=graphs,
        )
        prior_assistant = _previous_assistant_content(messages)
        grade_outcome = self._maybe_grade_previous(
            store, query, graphs, api_key, prior_assistant, study_cfg
        )

        if grade_outcome == "path_complete":
            return RagResult(
                content=str(study_cfg.get("path_complete") or ""),
                query_text=query,
                citations=None,
                retrieved_contexts=[],
            )

        resolved = self._resolve_target(
            store=store,
            query=query,
            graphs=graphs,
            api_key=api_key,
            # After mastery, stay on the concept GradeReply just activated
            # (Algorithm 1 line 15) — do not re-route the graded reply.
            lock_active=grade_outcome == "advanced",
        )
        if resolved is None:
            return RagResult(
                content=str(study_cfg.get("path_complete") or ""),
                query_text=query,
                citations=None,
                retrieved_contexts=[],
            )
        graph, target, redirected = resolved

        edges = ordering_edges(graph.edges)
        states = store.list_for_video(graph.video_id)
        concepts_by_id = {c.id: c for c in graph.concepts}
        ahead = descendants(target.id, edges)
        lo = graph.learning_objects.get(target.id)
        state = store.get(target.id)
        hint_index = state.hint_index if state else 0
        # Opening once per concept until the learner has been graded on it.
        opening = resolve_opening_question(
            target.label, lo.opening_question if lo else "", locale
        )
        is_opening = bool(
            opening and (state is None or (state.hint_index == 0 and not state.last_grade))
        )

        citations: List[CitationDTO] = []
        video_title = _video_title(graph.video_id)
        if lo and lo.waypoints:
            wp = lo.waypoints[0]
            start = wp.get("start_time") or wp.get("start_sec") or ""
            end = wp.get("end_time") or wp.get("end_sec") or ""
            citations.append(
                CitationDTO(
                    video_id=graph.video_id,
                    title=video_title,
                    start_time=str(start),
                    end_time=str(end),
                )
            )

        if is_opening:
            if redirected:
                content = str(
                    study_cfg.get("redirect_prereq") or "{opening}"
                ).format(label=target.label, opening=opening)
            elif grade_outcome == "advanced" or (
                state and not state.last_grade and any(s.reached for s in states)
            ):
                content = str(study_cfg.get("advance_next") or "{opening}").format(
                    label=target.label, opening=opening
                )
            else:
                content = opening
            if citations:
                content = content.rstrip() + " [1]"
            scenes = _l0_scenes_for_video(graph.video_id)
            self._activate_concept(store, target.id, states, hint_index=0)
            return RagResult(
                content=content,
                query_text=query,
                citations=citations or None,
                retrieved_contexts=retrieve_context(graph, target, scenes),
            )

        scenes = _l0_scenes_for_video(graph.video_id)
        ctx = retrieve_context(graph, target, scenes)

        # Paper invariant: never reveal the answer — serve the next hint rung.
        if _is_ask_for_answer(query):
            hint_text, hint_index = next_hint(lo, hint_index)
            content = str(study_cfg.get("refuse_reveal") or "{hint}").format(
                label=target.label, hint=hint_text or opening
            )
            if citations and "[1]" not in content:
                content = content.rstrip() + " [1]"
            self._activate_concept(store, target.id, states, hint_index=hint_index)
            return RagResult(
                content=content,
                query_text=query,
                citations=citations or None,
                retrieved_contexts=ctx,
            )

        policy = str(study_cfg.get("policy") or "")
        hint_text, hint_index = next_hint(lo, hint_index)
        withhold_labels = [
            concepts_by_id[cid].label for cid in ahead if cid in concepts_by_id
        ]
        misconceptions = (lo.misconceptions if lo else []) or []

        # §3.3(2): static prefix = policy ∥ LO scaffold ∥ L0/L1 ctx ∥ withhold (cacheable).
        # Fresh suffix = hint rung + last grade + learner utterance only.
        static_prefix = (
            f"{policy}\n\n"
            f"# Target concept\n{target.label}\n"
            f"# Opening question\n{opening}\n"
            f"# Misconceptions to watch\n{json.dumps(misconceptions, ensure_ascii=False)}\n"
            f"# Lecture context (L0+L1)\n" + "\n".join(ctx) + "\n"
            f"# WITHHOLD (do not reveal)\n{json.dumps(withhold_labels, ensure_ascii=False)}\n"
        )
        if redirected:
            static_prefix += (
                f"# Note\nLearner asked about something downstream; "
                f"redirect gently to prerequisite '{target.label}'.\n"
            )

        fresh_parts = [f"# Current hint rung\n{hint_text}"]
        if state and state.last_grade:
            fresh_parts.append(
                f"# Last grade\n{state.last_grade}\n"
                "Adapt the next nudge to that grade using the current hint rung "
                "(encourage on partial, simplify on miss). Do not invent a new topic."
            )
        fresh_parts.append(f"# Learner reply\n{query}")
        fresh_input = "\n\n".join(fresh_parts)

        try:
            llm = get_langchain_study_llm(
                api_key=api_key,
                prompt_cache_key=f"plog-v{graph.video_id}-c{target.id}",
            )
        except ProviderConfigError as e:
            raise LLMConfigurationError(str(e)) from e

        chain = _STUDY_PROMPT | llm

        try:
            response = chain.invoke(
                {
                    "system_prompt": static_prefix,
                    "input": fresh_input,
                }
            )
            content = (
                response.content if isinstance(response.content, str) else str(response.content)
            ).strip()
        except OpenAIAuthenticationError as exc:
            raise LLMConfigurationError(
                "Invalid OpenAI API key. Please check your API key in Settings."
            ) from exc
        except Exception as exc:
            logger.exception("PLOG generate_reply failed: %s", exc)
            raise LLMProviderError(str(exc)) from exc

        # Structural guard (paper premature-reveal proxy).
        if reveal_proxy(content):
            content = str(study_cfg.get("refuse_reveal") or "{hint}").format(
                label=target.label, hint=hint_text or opening
            )

        if citations and "[1]" not in content:
            content = content.rstrip() + " [1]"

        self._activate_concept(store, target.id, states, hint_index=hint_index)

        return RagResult(
            content=content,
            query_text=query,
            citations=citations or None,
            retrieved_contexts=ctx,
        )

    def _resolve_target(
        self,
        *,
        store: LearnerStateStore,
        query: str,
        graphs: List[PlogGraphSnapshot],
        api_key: Optional[str],
        lock_active: bool = False,
    ) -> Optional[Tuple[PlogGraphSnapshot, PlogConceptEntity, bool]]:
        """Algorithm 1 lines 1–8: route, then unmet redirect.

        While a concept is actively being taught, keep it unless the learner
        clearly asks about a different concept (knowledge tracing). Short
        answers / confusion must not hop via weak embedding matches.
        """
        try:
            q_emb = self.embedder.embed_texts([query], api_key=api_key)[0]
        except Exception as exc:
            raise LLMProviderError(str(exc)) from exc

        routed_scored = route_to_concept_scored(q_emb, graphs)
        active = self._find_active(store, graphs)
        if active is not None:
            graph, concept = active
            states = store.list_for_video(graph.video_id)
            reached = reached_concept_ids(states)
            concepts_by_id = {c.id: c for c in graph.concepts}
            covered = covered_concept_ids(reached, concepts_by_id)
            if concept.id in covered:
                store.upsert(concept.id, reached=True, active=False)
                active = None

        if active is not None and (
            lock_active
            or _should_stay_on_active(query, q_emb, active[1], routed_scored)
        ):
            graph, concept = active
        elif routed_scored is not None:
            _score, graph, concept = routed_scored
        elif active is not None:
            graph, concept = active
        else:
            next_unreached = self._first_unreached(store, graphs)
            if next_unreached is not None:
                graph, concept = next_unreached
            elif graphs and graphs[0].concepts:
                graph = graphs[0]
                concept = graphs[0].concepts[0]
            else:
                return None

        edges = ordering_edges(graph.edges)
        states = store.list_for_video(graph.video_id)
        reached = reached_concept_ids(states)
        concepts_by_id = {c.id: c for c in graph.concepts}
        covered = covered_concept_ids(reached, concepts_by_id)
        order = study_path_concept_ids(graph.concepts, edges)
        if order and all(cid in covered for cid in order):
            return None

        # Lines 3–8: unmet prerequisite redirect.
        prereqs = prerequisites_of(concept.id, edges)
        unmet = prereqs - covered
        if unmet:
            target_id = select_nearest_unmet(unmet, concepts_by_id) or concept.id
            return graph, concepts_by_id[target_id], True
        return graph, concept, False

    def _first_unreached(
        self, store: LearnerStateStore, graphs: List[PlogGraphSnapshot]
    ) -> Optional[Tuple[PlogGraphSnapshot, PlogConceptEntity]]:
        for g in graphs:
            edges = ordering_edges(g.edges)
            states = store.list_for_video(g.video_id)
            reached = reached_concept_ids(states)
            concepts_by_id = {c.id: c for c in g.concepts}
            order = study_path_concept_ids(g.concepts, edges)
            nxt = next_uncovered_in_order(order, reached, concepts_by_id)
            if nxt is not None:
                return g, concepts_by_id[nxt]
        return None

    def _find_active(
        self, store: LearnerStateStore, graphs: List[PlogGraphSnapshot]
    ) -> Optional[Tuple[PlogGraphSnapshot, PlogConceptEntity]]:
        for g in graphs:
            for s in store.list_for_video(g.video_id):
                if not s.active:
                    continue
                concept = next((c for c in g.concepts if c.id == s.concept_id), None)
                if concept is not None:
                    return g, concept
        return None

    def _activate_concept(
        self, store: LearnerStateStore, concept_id: int, states, *, hint_index: int
    ) -> None:
        store.upsert(concept_id, hint_index=hint_index, active=True)
        for s in states:
            if s.concept_id != concept_id and s.active:
                store.upsert(s.concept_id, active=False)

    def _maybe_grade_previous(
        self,
        store: LearnerStateStore,
        query: str,
        graphs,
        api_key: Optional[str],
        prior_assistant: str,
        study_cfg: dict,
    ) -> Optional[str]:
        """Grade previous reply (Algorithm 1 line 15).

        Returns:
            "advanced" when mastery moved to the next concept,
            "path_complete" when the topological path is finished,
            None otherwise.
        """
        active = None
        active_graph = None
        for g in graphs:
            states = store.list_for_video(g.video_id)
            for s in states:
                if s.active:
                    active = s
                    active_graph = g
                    break
            if active:
                break
        if active is None or active_graph is None:
            return None

        lo = active_graph.learning_objects.get(active.concept_id)
        concept = next((c for c in active_graph.concepts if c.id == active.concept_id), None)
        if concept is None:
            return None

        grade = self._grade_reply(
            query, concept.label, lo, prior_assistant, api_key, study_cfg
        )
        if grade == "mastery":
            concepts_by_id = {c.id: c for c in active_graph.concepts}
            # Synonym / granularity twins count as the same teachable unit.
            for twin_id in near_duplicate_ids(active.concept_id, concepts_by_id):
                store.upsert(
                    twin_id,
                    reached=True,
                    active=False,
                    last_grade=grade if twin_id == active.concept_id else "mastery",
                    hint_index=0,
                )
            edges = ordering_edges(active_graph.edges)
            order = study_path_concept_ids(active_graph.concepts, edges)
            states = store.list_for_video(active_graph.video_id)
            reached = reached_concept_ids(states)
            nxt = next_uncovered_in_order(
                order, reached, concepts_by_id, after_id=active.concept_id
            )
            if nxt is None:
                # Also allow any earlier uncovered node (disconnected components).
                nxt = next_uncovered_in_order(order, reached, concepts_by_id)
            if nxt is not None:
                store.upsert(nxt, active=True, hint_index=0, last_grade="")
                return "advanced"
            return "path_complete"

        # Algorithm 1: else descend the hint ladder (both partial and miss).
        new_hint = active.hint_index + 1
        ladder_len = len(lo.hint_ladder) if lo and lo.hint_ladder else 1
        new_hint = min(new_hint, max(ladder_len - 1, 0))
        store.upsert(
            active.concept_id,
            last_grade=grade,
            hint_index=new_hint,
            active=True,
        )
        return None

    def _grade_reply(
        self,
        reply: str,
        concept_label: str,
        lo,
        prior_assistant: str,
        api_key: Optional[str],
        study_cfg: dict,
    ) -> str:
        # Deterministic pre-grade (paper: mastery requires shown understanding).
        pre = _pregrade_reply(reply)
        if pre is not None:
            return pre
        try:
            llm = get_langchain_grading_llm(api_key=api_key)
            opening = lo.opening_question if lo else ""
            chain = _GRADE_PROMPT | llm
            response = chain.invoke(
                {
                    "grade_system": str(
                        study_cfg.get("grade_system")
                        or "Return ONLY JSON: "
                        '{"grade":"mastery"|"partial"|"miss","reason":"..."}.'
                    ),
                    "concept": concept_label,
                    "tutor_question": prior_assistant or opening,
                    "reply": reply,
                }
            )
            content = (
                response.content if isinstance(response.content, str) else str(response.content)
            )
            start = content.find("{")
            end = content.rfind("}")
            if start >= 0 and end > start:
                data = json.loads(content[start : end + 1])
                grade = str(data.get("grade") or "partial").lower()
                if grade in {"mastery", "partial", "miss"}:
                    return grade
        except Exception:
            logger.exception("GradeReply failed; defaulting to partial")
        if len(reply.strip()) < 8:
            return "miss"
        return "partial"


def _latest_user_query(messages: Sequence[ChatMessageDTO]) -> str:
    for message in reversed(messages):
        if message.role == "user" and message.content:
            return message.content
    return ""


def _graphs_have_ordering_path(graphs: Sequence[PlogGraphSnapshot]) -> bool:
    """True when some graph has ordering edges that form a DAG path."""
    return any(ordering_path_ready(g) for g in graphs)


def _l0_scenes_for_video(video_id: int) -> List[dict]:
    """Load L0 timestamped transcript segments for Retrieve(L0, L1, t)."""
    try:
        video = Video.objects.only("transcript").get(pk=video_id)
    except Video.DoesNotExist:
        return []
    transcript = video.transcript or ""
    if not transcript.strip():
        return []
    try:
        return list(SubtitleParser.parse_srt_scenes(transcript) or [])
    except Exception:
        logger.exception("Failed to parse L0 scenes for video %s", video_id)
        return []


def _is_ask_for_answer(text: str) -> bool:
    t = (text or "").strip().lower()
    if not t:
        return False
    cues = (
        "教えて",
        "答えを",
        "答え教えて",
        "解答",
        "tell me the answer",
        "give me the answer",
        "what is the answer",
        "just tell me",
    )
    return any(c in t for c in cues)


def _is_meta_or_confused(text: str) -> bool:
    """Learner is confused / questioning the tutor — not a topic switch."""
    t = (text or "").strip()
    if not t:
        return True
    if len(t) <= 2 and t in {"?", "？", "…", "...", "。", "!"}:
        return True
    cues = (
        "何を言",
        "なにを言",
        "関係なく",
        "意味がわ",
        "わからない",
        "分からない",
        "変じゃ",
        "おかしい",
        "なんで",
        "なぜ今",
        "話が違う",
        "急に",
        "what are you",
        "doesn't make sense",
        "confused",
        "unrelated",
    )
    return any(c in t for c in cues)


def _should_stay_on_active(
    query: str,
    query_embedding: Sequence[float],
    active_concept: PlogConceptEntity,
    routed_scored: Optional[Tuple[float, PlogGraphSnapshot, PlogConceptEntity]],
) -> bool:
    """Keep the active teachable unit unless the learner clearly switches topics."""
    if _is_meta_or_confused(query) or _is_ask_for_answer(query):
        return True
    if routed_scored is None:
        return True
    score, _g, routed_concept = routed_scored
    if routed_concept.id == active_concept.id:
        return True
    # Very short replies to the current hint are answers, not new questions.
    if len((query or "").strip()) < 12:
        return True
    active_score = (
        cosine_similarity(query_embedding, active_concept.embedding)
        if active_concept.embedding
        else 0.0
    )
    # Require a clearly stronger match to abandon the active concept.
    return not (score >= 0.55 and score >= active_score + 0.12)


def _pregrade_reply(reply: str) -> Optional[str]:
    """Force a grade only for cases that cannot show mastery.

    Paper leaves GradeReply to a small model; we only short-circuit empty
    replies, ask-for-answer, and meta/confusion (no shown understanding).
    """
    t = (reply or "").strip()
    if not t:
        return "miss"
    if _is_ask_for_answer(t):
        return "miss"
    if _is_meta_or_confused(t):
        return "miss"
    return None


def _looks_like_full_answer(text: str) -> bool:
    """Unused legacy helper kept for import compatibility in tests."""
    del text
    return False


def _previous_assistant_content(messages: Sequence[ChatMessageDTO]) -> str:
    seen_user = False
    for message in reversed(messages):
        if message.role == "user" and message.content and not seen_user:
            seen_user = True
            continue
        if seen_user and message.role == "assistant" and message.content:
            return message.content
    # Fallback: last assistant before end
    for message in reversed(messages):
        if message.role == "assistant" and message.content:
            return message.content
    return ""


def _video_title(video_id: int) -> str:
    try:
        return Video.objects.only("title").get(pk=video_id).title
    except Video.DoesNotExist:
        return f"Video {video_id}"
