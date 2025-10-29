from django.urls import path

from .views import (VideoDetailView, VideoGroupDetailView, VideoGroupListView,
                    VideoListView, add_video_to_group, add_videos_to_group,
                    create_share_link, delete_share_link, get_shared_group,
                    remove_video_from_group, reorder_videos_in_group)

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
        add_video_to_group,
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
    # 共有リンク関連
    path(
        "groups/<int:group_id>/share/",
        create_share_link,
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
]
