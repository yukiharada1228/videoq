from django.urls import path

from .views import (VideoDetailView, VideoGroupDetailView, VideoGroupListView,
                    VideoListView, add_video_to_group, add_videos_to_group,
                    remove_video_from_group)

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
]
