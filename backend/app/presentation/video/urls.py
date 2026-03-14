from django.urls import path

from app.dependencies import video as video_dependencies

from .views import (
    AddVideoToGroupView,
    CreateShareLinkView,
    TagDetailView,
    TagListView,
    VideoDetailView,
    VideoGroupDetailView,
    VideoGroupListView,
    VideoListView,
    add_tags_to_video,
    add_videos_to_group,
    get_shared_group,
    remove_tag_from_video,
    reorder_videos_in_group,
)

urlpatterns = [
    path(
        "",
        VideoListView.as_view(
            list_videos_use_case=video_dependencies.get_list_videos_use_case,
            create_video_use_case=video_dependencies.get_create_video_use_case,
        ),
        name="video-list",
    ),
    path(
        "<int:pk>/",
        VideoDetailView.as_view(
            video_detail_use_case=video_dependencies.get_video_detail_use_case,
            update_video_use_case=video_dependencies.get_update_video_use_case,
            delete_video_use_case=video_dependencies.get_delete_video_use_case,
        ),
        name="video-detail",
    ),
    path(
        "groups/",
        VideoGroupListView.as_view(
            list_groups_use_case=video_dependencies.get_list_groups_use_case,
            create_group_use_case=video_dependencies.get_create_group_use_case,
        ),
        name="video-group-list",
    ),
    path(
        "groups/<int:pk>/",
        VideoGroupDetailView.as_view(
            video_group_use_case=video_dependencies.get_video_group_use_case,
            update_group_use_case=video_dependencies.get_update_group_use_case,
            delete_group_use_case=video_dependencies.get_delete_group_use_case,
        ),
        name="video-group-detail",
    ),
    path(
        "groups/<int:group_id>/videos/",
        add_videos_to_group,
        {
            "add_videos_to_group_use_case": video_dependencies.get_add_videos_to_group_use_case
        },
        name="add-videos-to-group",
    ),
    path(
        "groups/<int:group_id>/videos/<int:video_id>/",
        AddVideoToGroupView.as_view(
            add_video_to_group_use_case=video_dependencies.get_add_video_to_group_use_case,
            remove_video_from_group_use_case=video_dependencies.get_remove_video_from_group_use_case,
        ),
        name="add-video-to-group",
    ),
    path(
        "groups/<int:group_id>/videos/order/",
        reorder_videos_in_group,
        {"reorder_videos_use_case": video_dependencies.get_reorder_videos_use_case},
        name="reorder-videos-in-group",
    ),
    path(
        "groups/<int:group_id>/share/",
        CreateShareLinkView.as_view(
            create_share_link_use_case=video_dependencies.get_create_share_link_use_case,
            delete_share_link_use_case=video_dependencies.get_delete_share_link_use_case,
        ),
        name="create-share-link",
    ),
    path(
        "groups/share/<str:share_token>/",
        get_shared_group,
        {"shared_group_use_case": video_dependencies.get_shared_group_use_case},
        name="get-shared-group",
    ),
    path(
        "tags/",
        TagListView.as_view(
            list_tags_use_case=video_dependencies.get_list_tags_use_case,
            create_tag_use_case=video_dependencies.get_create_tag_use_case,
        ),
        name="tag-list",
    ),
    path(
        "tags/<int:pk>/",
        TagDetailView.as_view(
            tag_detail_use_case=video_dependencies.get_tag_detail_use_case,
            update_tag_use_case=video_dependencies.get_update_tag_use_case,
            delete_tag_use_case=video_dependencies.get_delete_tag_use_case,
        ),
        name="tag-detail",
    ),
    path(
        "<int:video_id>/tags/",
        add_tags_to_video,
        {"add_tags_to_video_use_case": video_dependencies.get_add_tags_to_video_use_case},
        name="add-tags-to-video",
    ),
    path(
        "<int:video_id>/tags/<int:tag_id>/",
        remove_tag_from_video,
        {
            "remove_tag_from_video_use_case": video_dependencies.get_remove_tag_from_video_use_case
        },
        name="remove-tag-from-video",
    ),
]
