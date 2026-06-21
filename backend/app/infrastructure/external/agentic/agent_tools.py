"""Tool allowlist + scope-injection dispatcher for the agentic chat gateway (§5, §9.1).

``AgentToolDispatcher`` is the single security boundary between the LLM's
tool-call requests and the application's use cases. It:

* Publishes exactly three tools (:attr:`AgentToolDispatcher.ALLOWED_TOOLS`) and
  generates their LangChain/OpenAI tool-calling JSON schemas from that one set
  (:meth:`tool_schemas`). ``user_id`` / ``group_id`` / ``video_ids`` are never
  part of any schema — scope is fixed-injected from :class:`AgentToolContext`.
* Validates every tool call against the allowlist and enforces ownership +
  group-boundary scope before delegating to an injected use case
  (:meth:`dispatch`).
* Enforces the §7.3 loop budget (get_video call cap, full-transcript cap,
  per-turn tool-result token budget) by downgrading oversized full-transcript
  reads to map-reduce summaries.
* Deduplicates identical tool calls within a turn (§7.3) via a per-turn cache
  that is reset with :meth:`reset_turn`.

The dispatcher receives **all** use cases by constructor injection and never
imports ``app.use_cases`` (infrastructure boundary rule). Injected use cases are
typed ``typing.Any``; only their ``execute`` / ``execute_page`` call shapes are
relied upon. Tool-level failures raise :class:`AgentToolError`; the gateway
converts these into ``ToolMessage`` content so the LLM can recover (they are not
surfaced as HTTP errors).
"""

import json
import logging
from typing import Any, Callable, Dict, List, Optional, Tuple

from app.infrastructure.external.agentic.agent_config import (
    AgentBudget,
    AgentToolError,
)
from app.infrastructure.external.agentic.citation_registry import CitationRegistry
from app.infrastructure.external.agentic.context_collector import ContextLedger
from app.infrastructure.external.agentic.dtos import AgentToolContext, ToolCallResult
from app.infrastructure.external.agentic.scene_ref import SceneRef
from app.infrastructure.external.agentic.token_counter import (
    count_tokens,
    truncate_to_tokens,
)
from app.infrastructure.external.agentic.transcript_summarizer import (
    chunk_transcript_srt,
    map_reduce_summarize,
    render_video_summary,
)
from app.infrastructure.external.agentic.transcript_scene_parser import (
    parse_transcript_to_scenes,
)

logger = logging.getLogger(__name__)


class AgentToolDispatcher:
    """Allowlist + scope-injection layer for agentic chat tools (§5.1, §9.1).

    The dispatcher is the only place that turns an LLM tool-call request into a
    use-case invocation. Scope (``user_id`` / ``video_ids``) is taken from the
    injected :class:`AgentToolContext`, never from the LLM, so the LLM cannot
    widen its own access. The publishable surface is fixed by
    :attr:`ALLOWED_TOOLS`.
    """

    #: Single source of truth for the publishable tool surface (§5.1).
    ALLOWED_TOOLS = frozenset({"search_scenes", "get_video", "list_catalog"})

    def __init__(
        self,
        *,
        search_scenes_use_case: Any,
        get_video_use_case: Any,
        list_videos_use_case: Any,
        list_groups_use_case: Any,
        list_tags_use_case: Any,
        budget: AgentBudget,
        registry_factory: Callable[[], CitationRegistry] = CitationRegistry,
    ) -> None:
        """Initialise the dispatcher.

        Args:
            search_scenes_use_case: ``SearchScenesUseCase``-shaped object whose
                ``execute(*, user_id, video_ids, query, k)`` returns an object
                with a ``results`` list of ``SceneSearchResultDTO``.
            get_video_use_case: ``GetVideoDetailUseCase``-shaped object whose
                ``execute(video_id, user_id)`` returns a video DTO (with
                ``.transcript`` and ``.title``) or ``None``.
            list_videos_use_case: ``ListVideosUseCase``-shaped object exposing
                ``execute_page(user_id, input, limit, offset)``.
            list_groups_use_case: ``ListVideoGroupsUseCase``-shaped object
                exposing ``execute_page(user_id, include_videos, limit, offset)``.
            list_tags_use_case: ``ListTagsUseCase``-shaped object exposing
                ``execute(user_id)``.
            budget: Per-turn :class:`AgentBudget` (§7.3 limits).
            registry_factory: Callable returning a fresh :class:`CitationRegistry`
                (injected for testing; not used internally by ``dispatch`` —
                ``dispatch`` receives the active registry as an argument).
        """
        self._search_scenes = search_scenes_use_case
        self._get_video = get_video_use_case
        self._list_videos = list_videos_use_case
        self._list_groups = list_groups_use_case
        self._list_tags = list_tags_use_case
        self._budget = budget
        self._registry_factory = registry_factory

        # --- Per-turn mutable state (reset via reset_turn). ---
        # Dedup cache keyed on (name, tuple(sorted(args.items()))) (§7.3).
        self._cache: Dict[Tuple[str, Tuple[Tuple[str, Any], ...]], ToolCallResult] = {}
        # Running totals enforcing the §7.3 budget.
        self._get_video_calls = 0
        self._full_transcripts = 0
        self._tool_result_tokens = 0

    # ------------------------------------------------------------------
    # Turn lifecycle
    # ------------------------------------------------------------------
    def reset_turn(self) -> None:
        """Reset per-turn dedup cache and budget counters (§7.3).

        Call once at the start of every agentic chat turn before dispatching
        any tool. The dispatcher instance is otherwise reusable across turns.
        """
        self._cache = {}
        self._get_video_calls = 0
        self._full_transcripts = 0
        self._tool_result_tokens = 0

    # ------------------------------------------------------------------
    # Tool schemas
    # ------------------------------------------------------------------
    def tool_schemas(self) -> List[dict]:
        """Return the tool-calling JSON schemas for the 3 allowed tools (§5.1).

        The schemas follow the OpenAI/LangChain ``{"type": "function",
        "function": {...}}`` shape. Scope parameters (``user_id`` / ``group_id``
        / ``video_ids``) are deliberately absent: they are fixed-injected from
        :class:`AgentToolContext`.

        Returns:
            A list with exactly one schema per tool in :attr:`ALLOWED_TOOLS`,
            in the order ``search_scenes``, ``get_video``, ``list_catalog``.
        """
        return [
            {
                "type": "function",
                "function": {
                    "name": "search_scenes",
                    "description": (
                        "Semantic search over the current group's videos for "
                        "pinpoint matching scenes. Returns time-stamped scene "
                        "fragments usable as citations."
                    ),
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "query": {
                                "type": "string",
                                "description": "Natural-language search query.",
                            },
                            "k": {
                                "type": "integer",
                                "minimum": 1,
                                "maximum": 20,
                                "default": 8,
                                "description": "Max number of scenes to return.",
                            },
                        },
                        "required": ["query"],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "get_video",
                    "description": (
                        "Retrieve a video's full transcript (or a map-reduce "
                        "summary when the transcript is large). Use for "
                        "summaries, overviews, opinions, and topic listings."
                    ),
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "video_id": {
                                "type": "integer",
                                "description": (
                                    "ID of a video in the current group."
                                ),
                            },
                        },
                        "required": ["video_id"],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "list_catalog",
                    "description": (
                        "List the current scope's videos, or the user's groups or "
                        "tags. Use first for a summary request that does not name "
                        "a video, and for meta/out-of-scope questions about what "
                        "is available."
                    ),
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "kind": {
                                "type": "string",
                                "enum": ["videos", "groups", "tags"],
                                "description": "Which catalog to list.",
                            },
                            "q": {
                                "type": "string",
                                "description": "Optional keyword filter.",
                            },
                            "limit": {
                                "type": "integer",
                                "minimum": 1,
                                "maximum": 50,
                                "default": 20,
                                "description": "Max number of items to return.",
                            },
                        },
                        "required": ["kind"],
                    },
                },
            },
        ]

    # ------------------------------------------------------------------
    # Dispatch
    # ------------------------------------------------------------------
    def dispatch(
        self,
        name: str,
        args: dict,
        ctx: AgentToolContext,
        registry: CitationRegistry,
        ledger: ContextLedger,
        *,
        llm: Any = None,
    ) -> ToolCallResult:
        """Validate, scope, and execute a single tool call (§5.1, §9.1).

        Args:
            name: Tool name requested by the LLM.
            args: LLM-supplied tool arguments (scope params are ignored/absent).
            ctx: Fixed scope context (``user_id`` / ``video_ids`` / ``locale``).
            registry: Active turn :class:`CitationRegistry` (refs registered here).
            ledger: Active turn :class:`ContextLedger` (retrieved contexts here).
            llm: Optional request-scoped model for oversized transcript summaries.

        Returns:
            A :class:`ToolCallResult` to be returned to the LLM as a
            ``ToolMessage``.

        Raises:
            AgentToolError: On a disallowed tool (403), out-of-scope access
                (403), missing resource (404), or invalid arguments (400). The
                gateway converts these into ``ToolMessage`` content.
        """
        if name not in self.ALLOWED_TOOLS:
            raise AgentToolError(f"Tool not allowed: {name}", status=403)

        args = args or {}

        # Per-turn dedup: identical (name, args) returns the cached result (§7.3).
        cache_key = (name, tuple(sorted(args.items())))
        cached = self._cache.get(cache_key)
        if cached is not None:
            return cached

        if name == "search_scenes":
            result = self._handle_search_scenes(args, ctx, registry, ledger)
        elif name == "get_video":
            result = self._handle_get_video(args, ctx, registry, ledger, llm=llm)
        elif name == "list_catalog":
            result = self._handle_list_catalog(args, ctx, ledger)
        else:  # pragma: no cover - guarded by ALLOWED_TOOLS above.
            raise AgentToolError(f"Tool not allowed: {name}", status=403)

        self._tool_result_tokens += count_tokens(result.content)
        self._cache[cache_key] = result
        return result

    # ------------------------------------------------------------------
    # search_scenes (§5.1.1)
    # ------------------------------------------------------------------
    def _handle_search_scenes(
        self,
        args: dict,
        ctx: AgentToolContext,
        registry: CitationRegistry,
        ledger: ContextLedger,
    ) -> ToolCallResult:
        """Handle ``search_scenes`` (§5.1.1): vector search for pinpoint scenes."""
        query = args.get("query")
        if not query or not str(query).strip():
            raise AgentToolError("search_scenes requires a 'query'.", status=400)

        try:
            k = min(int(args.get("k", 8)), 20)
        except (TypeError, ValueError):
            raise AgentToolError("search_scenes 'k' must be an integer.", status=400)
        if k < 1:
            k = 1

        search_result = self._search_scenes.execute(
            user_id=ctx.user_id,
            video_ids=ctx.video_ids,
            query=str(query),
            k=k,
        )

        items: List[dict] = []
        scenes: List[SceneRef] = []
        allowed_video_ids = set(ctx.video_ids)
        for hit in search_result.results:
            # Scope guard (§9.2): never register a scene outside the current
            # group. This must happen BEFORE registry.register so no out-of-scope
            # scene ever receives a ref_id — otherwise dropping it later would
            # shift the citation ordinals and break the body[n] == citations[n-1]
            # contract. get_video is already double-scoped; this closes the
            # search_scenes path (the use case is trusted but not re-verified).
            if hit.video_id not in allowed_video_ids:
                continue
            scene = SceneRef(
                video_id=hit.video_id,
                video_title=hit.video_title,
                start_time=hit.start_time,
                end_time=hit.end_time,
                start_sec=hit.start_sec,
                end_sec=hit.end_sec,
                scene_index=hit.scene_index,
                text=hit.text,
                source="vector",
            )
            ref_id = registry.register(scene)
            ledger.add_vector_scene(hit.video_id, hit.text)
            scenes.append(scene)
            items.append(
                {
                    "ref_id": ref_id,
                    "video_id": hit.video_id,
                    "title": hit.video_title,
                    "start_time": hit.start_time,
                    "end_time": hit.end_time,
                    "text": hit.text,
                }
            )

        return ToolCallResult(
            content=json.dumps(items, ensure_ascii=False),
            citations=[],
            retrieved_contexts=ledger.to_retrieved_contexts(),
            scenes=scenes,
        )

    # ------------------------------------------------------------------
    # get_video (§5.1.2, §7.2, §7.3)
    # ------------------------------------------------------------------
    def _handle_get_video(
        self,
        args: dict,
        ctx: AgentToolContext,
        registry: CitationRegistry,
        ledger: ContextLedger,
        *,
        llm: Any = None,
    ) -> ToolCallResult:
        """Handle ``get_video`` (§5.1.2): full transcript with double scope check.

        Double scope (§5.1.2): the video must be in the current group
        (``ctx.video_ids``) *and* owned by the user (verified by the use case).
        The size gate (§7.2) and loop budget (§7.3) decide whether the full
        transcript is inlined or a map-reduce summary is returned.
        """
        if "video_id" not in args:
            raise AgentToolError("get_video requires a 'video_id'.", status=400)
        try:
            video_id = int(args["video_id"])
        except (TypeError, ValueError):
            raise AgentToolError("get_video 'video_id' must be an integer.", status=400)

        # Group boundary first (cheap), then ownership via the use case.
        if video_id not in ctx.video_ids:
            raise AgentToolError("Video not in current group", status=403)

        budget = self._budget
        if self._get_video_calls >= budget.max_get_video_calls:
            raise AgentToolError(
                "get_video call limit reached for this turn; summarize the "
                "retrieved videos and disclose which listed videos were not inspected.",
                status=429,
            )

        video = self._get_video.execute(video_id, ctx.user_id)
        if video is None:
            raise AgentToolError("Video not found", status=404)

        transcript = video.transcript or ""
        title = video.title

        # Scene handles for citation are always derived from the full transcript
        # so the agent can cite even when only a summary is shown.
        scenes = parse_transcript_to_scenes(
            transcript, video_id=video_id, video_title=title
        )
        for scene in scenes:
            registry.register(scene)
        ledger.add_transcript_chunk(video_id, transcript)

        self._get_video_calls += 1

        token_count = count_tokens(transcript)

        # §7.3 budget gates: force a summary (instead of full inline) when any
        # full-transcript / token budget has been exhausted. The get_video call
        # cap itself is enforced before retrieval above.
        over_full_transcript_cap = self._full_transcripts >= budget.max_full_transcripts
        over_token_budget = (
            self._tool_result_tokens >= budget.tool_result_token_budget
        )
        force_summary = over_full_transcript_cap or over_token_budget

        # §7.2 size gate: inline only when small enough AND budget allows it.
        if token_count <= budget.transcript_inline_token_limit and not force_summary:
            self._full_transcripts += 1
            # Truncate to the inline ceiling using the shared encoder (§7.3).
            content = truncate_to_tokens(
                transcript, budget.transcript_inline_token_limit
            )
            return ToolCallResult(
                content=content,
                citations=[],
                retrieved_contexts=ledger.to_retrieved_contexts(),
                scenes=scenes,
            )

        # Otherwise use the request-scoped model for a map-reduce summary
        # (§7.2.1). Direct dispatcher callers without a model retain the
        # compatibility fallback in _summarize_transcript.
        summary_content = self._summarize_transcript(
            transcript,
            video_id=video_id,
            title=title,
            locale=ctx.locale,
            llm=llm,
        )
        return ToolCallResult(
            content=summary_content,
            citations=[],
            retrieved_contexts=ledger.to_retrieved_contexts(),
            scenes=scenes,
        )

    def _summarize_transcript(
        self,
        transcript: str,
        *,
        video_id: int,
        title: str,
        locale: Optional[str],
        llm: Any = None,
    ) -> str:
        """Build the map-reduce summary JSON for an oversized transcript (§7.2.1).

        The request-scoped LangChain chat model is preferred so the user's API
        key and provider configuration are preserved. The get_video use case's
        optional ``llm`` attribute remains as a compatibility fallback for direct
        dispatcher callers. If neither is available, the transcript is truncated
        so the tool never hard-fails.
        """
        summary_llm = llm or getattr(self._get_video, "llm", None)
        if summary_llm is None:
            logger.info(
                "No LLM available for get_video summarization (video %s); "
                "degrading to truncated transcript.",
                video_id,
            )
            return truncate_to_tokens(
                transcript, self._budget.transcript_inline_token_limit
            )

        chunks = chunk_transcript_srt(transcript)
        summary = map_reduce_summarize(
            chunks,
            summary_llm,
            video_id=video_id,
            title=title,
            locale=locale,
            max_chunks=self._budget.summarize_max_chunks,
        )
        return json.dumps(render_video_summary(summary), ensure_ascii=False)

    # ------------------------------------------------------------------
    # list_catalog (§5.1.3)
    # ------------------------------------------------------------------
    def _handle_list_catalog(
        self,
        args: dict,
        ctx: AgentToolContext,
        ledger: ContextLedger,
    ) -> ToolCallResult:
        """Handle ``list_catalog`` (§5.1.3): list videos / groups / tags.

        ``user_id`` is fixed-injected. For ``kind=videos`` the listing is scoped
        to the current group (``ctx.video_ids``) per §14 recommendation. The
        catalog is not a citation source, so ``citations`` /
        ``retrieved_contexts`` (from this call) stay empty; only a
        natural-language summary is recorded on the ledger.
        """
        kind = args.get("kind")
        if kind not in ("videos", "groups", "tags"):
            raise AgentToolError(
                "list_catalog 'kind' must be one of videos/groups/tags.",
                status=400,
            )
        try:
            limit = min(int(args.get("limit", 20)), 50)
        except (TypeError, ValueError):
            raise AgentToolError("list_catalog 'limit' must be an integer.", status=400)
        if limit < 1:
            limit = 1
        q = args.get("q")
        q = str(q) if q else ""

        if kind == "videos":
            items, count = self._list_catalog_videos(ctx, q, limit)
        elif kind == "groups":
            items, count = self._list_catalog_groups(ctx, limit)
        else:  # tags
            items, count = self._list_catalog_tags(ctx, q, limit)

        payload = {"kind": kind, "items": items, "count": count}
        ledger.add_catalog(self._catalog_summary(kind, items, count))
        return ToolCallResult(
            content=json.dumps(payload, ensure_ascii=False),
            citations=[],
            retrieved_contexts=[],
            scenes=[],
        )

    def _list_catalog_videos(
        self, ctx: AgentToolContext, q: str, limit: int
    ) -> Tuple[List[dict], int]:
        """List videos scoped to the current group (§14 recommendation)."""
        # Import locally is forbidden (would pull app.use_cases). The input DTO
        # is built positionally-compatibly: the use case's execute_page accepts
        # an `input` object carrying a `keyword`. We avoid importing the DTO by
        # delegating shape construction to the use case via a duck-typed object.
        group_ids = set(ctx.video_ids)
        if not group_ids:
            return [], 0

        items: List[dict] = []
        offset = 0
        page_size = 50
        while len(items) < limit:
            page = self._list_videos.execute_page(
                ctx.user_id,
                _ListVideosInputProxy(keyword=q),
                limit=page_size,
                offset=offset,
            )
            results = list(page.results)
            for video in results:
                if video.id not in group_ids:
                    continue
                items.append(
                    {"id": video.id, "title": video.title, "status": video.status}
                )
                if len(items) >= limit:
                    break

            offset += len(results)
            if not results or offset >= page.count:
                break
        return items, len(items)

    def _list_catalog_groups(
        self, ctx: AgentToolContext, limit: int
    ) -> Tuple[List[dict], int]:
        """List the user's video groups."""
        page = self._list_groups.execute_page(
            ctx.user_id,
            include_videos=False,
            limit=limit,
            offset=0,
        )
        items = [
            {
                "id": group.id,
                "name": group.name,
                "video_count": group.video_count,
            }
            for group in page.results
        ]
        return items, page.count

    def _list_catalog_tags(
        self, ctx: AgentToolContext, q: str, limit: int
    ) -> Tuple[List[dict], int]:
        """List the user's tags (optionally keyword-filtered)."""
        tags = self._list_tags.execute(user_id=ctx.user_id)
        items: List[dict] = []
        needle = q.lower()
        for tag in tags:
            if needle and needle not in tag.name.lower():
                continue
            items.append(
                {
                    "id": tag.id,
                    "name": tag.name,
                    "video_count": tag.video_count,
                }
            )
            if len(items) >= limit:
                break
        return items, len(items)

    @staticmethod
    def _catalog_summary(kind: str, items: List[dict], count: int) -> str:
        """Render a short natural-language summary of a catalog result (§10.1).

        Stored on the ledger so ``retrieved_contexts`` carries a human-readable
        catalog signal rather than raw JSON.
        """
        names: List[str] = []
        for item in items[:10]:
            label = item.get("title") or item.get("name")
            if label:
                names.append(str(label))
        listed = "; ".join(names)
        if listed:
            return f"Catalog ({kind}, {count} item(s)): {listed}"
        return f"Catalog ({kind}): {count} item(s)."


class _ListVideosInputProxy:
    """Duck-typed stand-in for ``ListVideosInput`` (§5.1.3).

    Infrastructure must not import ``app.use_cases`` (boundary rule), so this
    proxy carries the attributes ``ListVideosUseCase.execute_page`` reads
    (``keyword``, ``status_filter``, ``sort_key``, ``tag_ids``) without importing
    the use-case DTO. The use case constructs its own domain criteria from these
    attributes.
    """

    def __init__(
        self,
        *,
        keyword: str = "",
        status_filter: str = "",
        sort_key: str = "",
        tag_ids: Optional[List[int]] = None,
    ) -> None:
        self.keyword = keyword
        self.status_filter = status_filter
        self.sort_key = sort_key
        self.tag_ids = tag_ids
