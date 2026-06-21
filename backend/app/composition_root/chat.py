"""Chat context DI wiring.

Lifecycle policy:
- Repositories are created per use-case resolution (lightweight wrappers).
- External/stateless services are process-scoped via cache for reuse.
"""

import os
from functools import lru_cache

from app.domain.chat.gateways import RagGateway
from app.infrastructure.chat.keyword_extractor import JanomeNltkKeywordExtractor
from app.infrastructure.external.rag_gateway import RagChatGateway
from app.infrastructure.repositories.django_chat_repository import (
    DjangoChatRepository,
    DjangoVideoGroupQueryRepository,
)
from app.infrastructure.tasks.task_gateway import CeleryEvaluationTaskGateway
from app.use_cases.chat.export_history import ExportChatHistoryUseCase
from app.use_cases.chat.get_analytics import GetChatAnalyticsUseCase
from app.use_cases.chat.get_history import GetChatHistoryUseCase
from app.use_cases.chat.get_keywords import GetChatKeywordsUseCase
from app.use_cases.chat.reset_history import ResetChatHistoryUseCase
from app.use_cases.chat.send_message import SendMessageUseCase
from app.use_cases.chat.submit_feedback import SubmitFeedbackUseCase
from app.composition_root import limits as _limits_cr
from app.composition_root import video as _video_cr


def _new_chat_repository() -> DjangoChatRepository:
    # Request/resolve scoped: lightweight ORM wrapper.
    return DjangoChatRepository()


def _new_video_group_query_repository() -> DjangoVideoGroupQueryRepository:
    # Request/resolve scoped: lightweight ORM wrapper.
    return DjangoVideoGroupQueryRepository()


def _env_int(name: str, default: int) -> int:
    """Read an integer env var, falling back to ``default`` on absence/parse error."""
    raw = os.environ.get(name)
    if raw is None or raw == "":
        return default
    try:
        return int(raw)
    except (TypeError, ValueError):
        return default


def _new_agent_budget_from_env():
    """Build an :class:`AgentBudget` from env (§7.3), defaulting to agent_config.

    Reads the §7.3 limit env vars and falls back to the module-level defaults
    declared in ``agent_config`` when an env var is absent or unparseable. The
    env-reading lives here (composition_root) so the infrastructure layer stays
    env-agnostic, mirroring the ``USE_S3_STORAGE`` pattern in ``_video_shared``.
    """
    from app.infrastructure.external.agentic.agent_config import (
        AgentBudget,
        MAX_FULL_TRANSCRIPTS,
        MAX_GET_VIDEO_CALLS,
        MAX_LLM_CALLS,
        MAX_TOOL_ITERATIONS,
        SUMMARIZE_MAX_CHUNKS,
        TOOL_RESULT_TOKEN_BUDGET,
        TRANSCRIPT_CHAR_BUDGET,
        TRANSCRIPT_INLINE_TOKEN_LIMIT,
    )

    # Max tool iterations: CHAT_MAX_TOOL_ITERATIONS, then AGENT_MAX_ITERATIONS.
    max_tool_iterations = _env_int(
        "CHAT_MAX_TOOL_ITERATIONS",
        _env_int("AGENT_MAX_ITERATIONS", MAX_TOOL_ITERATIONS),
    )
    return AgentBudget(
        max_tool_iterations=max_tool_iterations,
        tool_result_token_budget=_env_int(
            "CHAT_TOOL_RESULT_TOKEN_BUDGET", TOOL_RESULT_TOKEN_BUDGET
        ),
        max_full_transcripts=_env_int(
            "CHAT_MAX_FULL_TRANSCRIPTS", MAX_FULL_TRANSCRIPTS
        ),
        max_get_video_calls=_env_int("MAX_GET_VIDEO_CALLS", MAX_GET_VIDEO_CALLS),
        max_llm_calls=_env_int("CHAT_MAX_LLM_CALLS", MAX_LLM_CALLS),
        transcript_char_budget=_env_int("TRANSCRIPT_MAX_TOKENS", TRANSCRIPT_CHAR_BUDGET),
        transcript_inline_token_limit=_env_int(
            "TRANSCRIPT_INLINE_TOKEN_LIMIT", TRANSCRIPT_INLINE_TOKEN_LIMIT
        ),
        summarize_max_chunks=_env_int("SUMMARIZE_MAX_CHUNKS", SUMMARIZE_MAX_CHUNKS),
    )


def _new_agent_tool_dispatcher():
    """Build the :class:`AgentToolDispatcher` with real use cases injected (§5).

    Reuses the existing video-context use-case factories (which carry the proper
    Django repository wiring) and pairs the search vertical's
    ``SearchScenesUseCase`` with the pgvector scene-search gateway.
    """
    from app.infrastructure.external.agentic.agent_tools import AgentToolDispatcher
    from app.infrastructure.external.agentic.scene_search_gateway import (
        PgVectorSceneSearchGateway,
    )
    from app.use_cases.chat.search_scenes import SearchScenesUseCase

    return AgentToolDispatcher(
        search_scenes_use_case=SearchScenesUseCase(
            scene_search_gateway=PgVectorSceneSearchGateway()
        ),
        get_video_use_case=_video_cr.get_video_detail_use_case(),
        list_videos_use_case=_video_cr.get_list_videos_use_case(),
        list_groups_use_case=_video_cr.get_list_groups_use_case(),
        list_tags_use_case=_video_cr.get_list_tags_use_case(),
        budget=_new_agent_budget_from_env(),
    )


def get_legacy_rag_gateway() -> RagGateway:
    """Build the legacy single-shot :class:`RagChatGateway` (offline eval, §13)."""
    return RagChatGateway()


def get_agent_rag_gateway() -> RagGateway:
    """Build the tool-using :class:`AgenticChatGateway` (offline eval, §13).

    Mirrors the env-driven wiring in :func:`_get_rag_gateway` but is constructed
    on demand (not ``lru_cache``-d) so the eval command can hold both gateways
    side by side regardless of ``USE_AGENT_CHAT``.
    """
    from app.infrastructure.external.agentic.agentic_gateway import (
        AgenticChatGateway,
    )

    budget = _new_agent_budget_from_env()
    return AgenticChatGateway(
        dispatcher=_new_agent_tool_dispatcher(),
        max_iterations=budget.max_tool_iterations,
        budget=budget,
    )


def get_chat_repository() -> DjangoChatRepository:
    """Expose the chat repository for offline tooling (eval command, §13)."""
    return _new_chat_repository()


def get_video_group_query_repository() -> DjangoVideoGroupQueryRepository:
    """Expose the group query repository for offline tooling (eval command, §13)."""
    return _new_video_group_query_repository()


@lru_cache(maxsize=1)
def _get_rag_gateway() -> RagGateway:
    if os.environ.get("USE_AGENT_CHAT", "").lower() in ("true", "1", "yes"):
        from app.infrastructure.external.agentic.agentic_gateway import (
            AgenticChatGateway,
        )

        return AgenticChatGateway(
            dispatcher=_new_agent_tool_dispatcher(),
            max_iterations=int(os.environ.get("AGENT_MAX_ITERATIONS", "6")),
            budget=_new_agent_budget_from_env(),
        )
    return RagChatGateway()


@lru_cache(maxsize=1)
def _get_keyword_extractor() -> JanomeNltkKeywordExtractor:
    return JanomeNltkKeywordExtractor()


@lru_cache(maxsize=1)
def _get_evaluation_task_gateway() -> CeleryEvaluationTaskGateway:
    return CeleryEvaluationTaskGateway()


def get_send_message_use_case() -> SendMessageUseCase:
    return SendMessageUseCase(
        _new_chat_repository(),
        _new_video_group_query_repository(),
        _get_rag_gateway(),
        ai_answer_limit_check_use_case=_limits_cr.get_check_ai_answers_limit_use_case(),
        ai_answer_record_use_case=_limits_cr.get_record_ai_answer_usage_use_case(),
        evaluation_task_gateway=_get_evaluation_task_gateway(),
    )

def get_chat_history_use_case() -> GetChatHistoryUseCase:
    return GetChatHistoryUseCase(
        _new_chat_repository(),
        _new_video_group_query_repository(),
    )


def get_chat_analytics_use_case() -> GetChatAnalyticsUseCase:
    return GetChatAnalyticsUseCase(
        _new_chat_repository(),
        _new_video_group_query_repository(),
    )


def get_chat_keywords_use_case() -> GetChatKeywordsUseCase:
    return GetChatKeywordsUseCase(
        _new_chat_repository(),
        _new_video_group_query_repository(),
        _get_keyword_extractor(),
    )


def get_submit_feedback_use_case() -> SubmitFeedbackUseCase:
    return SubmitFeedbackUseCase(_new_chat_repository())


def get_export_history_use_case() -> ExportChatHistoryUseCase:
    return ExportChatHistoryUseCase(
        _new_chat_repository(),
        _new_video_group_query_repository(),
    )


def get_reset_history_use_case() -> ResetChatHistoryUseCase:
    return ResetChatHistoryUseCase(
        _new_chat_repository(),
        _new_video_group_query_repository(),
    )
