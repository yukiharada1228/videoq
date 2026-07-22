"""Prompt management module."""

from .loader import (
    build_fallback_learning_object,
    build_system_prompt,
    detect_transcript_locale,
    get_plog_study_config,
    get_qa_agent_config,
    normalize_learning_object_for_locale,
    resolve_opening_question,
)

__all__ = [
    "build_system_prompt",
    "build_fallback_learning_object",
    "detect_transcript_locale",
    "get_plog_study_config",
    "get_qa_agent_config",
    "normalize_learning_object_for_locale",
    "resolve_opening_question",
]
