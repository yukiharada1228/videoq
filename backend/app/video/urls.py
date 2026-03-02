from django.urls import path

from .views import (AddVideoToGroupView, CreateShareLinkView, TagDetailView,
                    TagListView, VideoDetailView, VideoGroupDetailView,
                    VideoGroupListView, VideoListView, add_tags_to_video,
                    add_videos_to_group, delete_share_link, get_shared_group,
                    remove_tag_from_video, remove_video_from_group,
                    reorder_videos_in_group)

urlpatterns = [
    path("", VideoListView.as_view(), name="video-list"),
    path("<int:pk>/", VideoDetailView.as_view(), name="video-detail"),
    path("groups/", VideoGroupListView.as_view(), name="video-group-list"),
    path("groups/<int:pk>/", VideoGroupDetailView.as_view(), name="video-group-detail"),
    path(
        "groups/<int:group_id>/videos/", add_videos_to_group, name="add-videos-to-group"
    ),
    path(
        "groups/<int:group_id>/videos/<int:video_id>/",
        AddVideoToGroupView.as_view(),
        name="add-video-to-group",
    ),
    path(
        "groups/<int:group_id>/videos/<int:video_id>/remove/",
        remove_video_from_group,
        name="remove-video-from-group",
    ),
    path(
        "groups/<int:group_id>/reorder/",
        reorder_videos_in_group,
        name="reorder-videos-in-group",
    ),
    # Share link related
    path(
        "groups/<int:group_id>/share/",
        CreateShareLinkView.as_view(),
        name="create-share-link",
    ),
    path(
        "groups/<int:group_id>/share/delete/",
        delete_share_link,
        name="delete-share-link",
    ),
    path(
        "groups/shared/<str:share_token>/",
        get_shared_group,
        name="get-shared-group",
    ),
    # Tag management
    path("tags/", TagListView.as_view(), name="tag-list"),
    path("tags/<int:pk>/", TagDetailView.as_view(), name="tag-detail"),
    # Video-Tag relationship
    path(
        "<int:video_id>/tags/",
        add_tags_to_video,
        name="add-tags-to-video",
    ),
    path(
        "<int:video_id>/tags/<int:tag_id>/remove/",
        remove_tag_from_video,
        name="remove-tag-from-video",
    ),
]
