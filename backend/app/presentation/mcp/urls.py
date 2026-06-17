"""URL routing for the MCP Streamable HTTP endpoint."""

from django.urls import re_path

from app.dependencies import chat as chat_deps
from app.dependencies import evaluation as eval_deps
from app.dependencies import video as video_deps

from .views import MCPEndpointView

_mcp_view = MCPEndpointView.as_view(
    list_videos_use_case=video_deps.get_list_videos_use_case,
    video_detail_use_case=video_deps.get_video_detail_use_case,
    list_groups_use_case=video_deps.get_list_groups_use_case,
    video_group_use_case=video_deps.get_video_group_use_case,
    list_tags_use_case=video_deps.get_list_tags_use_case,
    chat_history_use_case=chat_deps.get_chat_history_use_case,
    chat_analytics_use_case=chat_deps.get_chat_analytics_use_case,
    chat_keywords_use_case=chat_deps.get_chat_keywords_use_case,
    evaluation_summary_use_case=eval_deps.get_get_evaluation_summary_use_case,
    evaluation_logs_use_case=eval_deps.get_list_chat_log_evaluations_use_case,
)

# Match the include() prefix exactly. ``videoq/urls.py`` mounts this
# include under both ``api/mcp/`` and ``api/mcp`` so the endpoint
# responds to either form without an APPEND_SLASH 301 redirect.
urlpatterns = [
    re_path(r"^$", _mcp_view, name="mcp-endpoint"),
]
