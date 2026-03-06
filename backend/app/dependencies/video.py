"""Video presentation dependency providers.

Re-export composition root providers so this module remains the stable
presentation-facing import path without duplicating wrapper functions.
"""

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
    get_list_groups_use_case,
    get_list_tags_use_case,
    get_list_videos_use_case,
    get_remove_tag_from_video_use_case,
    get_remove_video_from_group_use_case,
    get_reorder_videos_use_case,
    get_shared_group_use_case,
    get_tag_detail_use_case,
    get_update_group_use_case,
    get_update_tag_use_case,
    get_update_video_use_case,
    get_video_detail_use_case,
    get_video_group_use_case,
)

__all__ = [
    "get_list_videos_use_case",
    "get_create_video_use_case",
    "get_video_detail_use_case",
    "get_update_video_use_case",
    "get_delete_video_use_case",
    "get_list_groups_use_case",
    "get_create_group_use_case",
    "get_video_group_use_case",
    "get_update_group_use_case",
    "get_delete_group_use_case",
    "get_add_video_to_group_use_case",
    "get_add_videos_to_group_use_case",
    "get_remove_video_from_group_use_case",
    "get_reorder_videos_use_case",
    "get_create_share_link_use_case",
    "get_delete_share_link_use_case",
    "get_shared_group_use_case",
    "get_list_tags_use_case",
    "get_create_tag_use_case",
    "get_tag_detail_use_case",
    "get_update_tag_use_case",
    "get_delete_tag_use_case",
    "get_add_tags_to_video_use_case",
    "get_remove_tag_from_video_use_case",
]
