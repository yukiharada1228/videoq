"""
Application composition root.

Canonical DI wiring lives in context modules under ``app.composition_root``.
This package root intentionally stays a thin aggregation layer to preserve
import compatibility for existing callers (``from app import composition_root``
or ``from app.composition_root import ...``).
"""

from app.composition_root.auth import (
    get_authorize_api_key_use_case,
    get_confirm_password_reset_use_case,
    get_create_api_key_use_case,
    get_current_user_use_case,
    get_delete_account_data_use_case,
    get_delete_account_use_case,
    get_list_api_keys_use_case,
    get_login_use_case,
    get_refresh_token_use_case,
    get_resolve_api_key_use_case,
    get_resolve_share_token_use_case,
    get_request_password_reset_use_case,
    get_revoke_api_key_use_case,
    get_signup_use_case,
    get_verify_email_use_case,
)
from app.composition_root.chat import (
    get_chat_analytics_use_case,
    get_chat_history_use_case,
    get_export_history_use_case,
    get_popular_scenes_use_case,
    get_send_message_use_case,
    get_submit_feedback_use_case,
)
from app.composition_root.media import get_resolve_protected_media_use_case
from app.composition_root.video import (
    get_add_tags_to_video_use_case,
    get_add_video_to_group_use_case,
    get_add_videos_to_group_use_case,
    get_create_group_use_case,
    get_create_share_link_use_case,
    get_create_tag_use_case,
    get_create_video_use_case,
    get_delete_group_use_case,
    get_delete_share_link_use_case,
    get_delete_tag_use_case,
    get_delete_video_use_case,
    get_enforce_video_limit_use_case,
    get_list_groups_use_case,
    get_list_tags_use_case,
    get_list_videos_use_case,
    get_reindex_all_videos_use_case,
    get_remove_tag_from_video_use_case,
    get_remove_video_from_group_use_case,
    get_reorder_videos_use_case,
    get_run_transcription_use_case,
    get_shared_group_use_case,
    get_tag_detail_use_case,
    get_update_group_use_case,
    get_update_tag_use_case,
    get_update_video_use_case,
    get_video_detail_use_case,
    get_video_group_use_case,
)

__all__ = [
    # video
    "get_list_videos_use_case",
    "get_reindex_all_videos_use_case",
    "get_run_transcription_use_case",
    "get_video_detail_use_case",
    "get_create_video_use_case",
    "get_update_video_use_case",
    "get_delete_video_use_case",
    "get_enforce_video_limit_use_case",
    # video group
    "get_list_groups_use_case",
    "get_create_group_use_case",
    "get_update_group_use_case",
    "get_delete_group_use_case",
    "get_video_group_use_case",
    "get_shared_group_use_case",
    "get_add_video_to_group_use_case",
    "get_add_videos_to_group_use_case",
    "get_remove_video_from_group_use_case",
    "get_reorder_videos_use_case",
    "get_create_share_link_use_case",
    "get_delete_share_link_use_case",
    # tag
    "get_list_tags_use_case",
    "get_create_tag_use_case",
    "get_update_tag_use_case",
    "get_delete_tag_use_case",
    "get_tag_detail_use_case",
    "get_add_tags_to_video_use_case",
    "get_remove_tag_from_video_use_case",
    # chat
    "get_send_message_use_case",
    "get_chat_history_use_case",
    "get_chat_analytics_use_case",
    "get_popular_scenes_use_case",
    "get_submit_feedback_use_case",
    "get_export_history_use_case",
    # auth
    "get_login_use_case",
    "get_refresh_token_use_case",
    "get_current_user_use_case",
    "get_signup_use_case",
    "get_verify_email_use_case",
    "get_request_password_reset_use_case",
    "get_confirm_password_reset_use_case",
    "get_delete_account_use_case",
    "get_delete_account_data_use_case",
    "get_list_api_keys_use_case",
    "get_create_api_key_use_case",
    "get_revoke_api_key_use_case",
    "get_authorize_api_key_use_case",
    "get_resolve_share_token_use_case",
    "get_resolve_api_key_use_case",
    # media
    "get_resolve_protected_media_use_case",
]
