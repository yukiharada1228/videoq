"""Service module for chat functionality"""

from .analytics import build_chat_analytics, build_popular_scenes
from .chat_records import (create_chat_response_payload, get_chat_logs_queryset,
                           get_video_group_with_members, update_chat_feedback)
from .llm import ChatServiceError, get_langchain_llm, handle_langchain_exception
from .rag_chat import RagChatResult, RagChatService

__all__ = [
    "RagChatResult",
    "RagChatService",
    "ChatServiceError",
    "get_langchain_llm",
    "handle_langchain_exception",
    "build_popular_scenes",
    "build_chat_analytics",
    "get_video_group_with_members",
    "get_chat_logs_queryset",
    "create_chat_response_payload",
    "update_chat_feedback",
]
