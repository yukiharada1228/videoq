from django.urls import path
from django.contrib.auth import views as auth_views
from . import views
from .views import (
    ShareVideoGroupView,
    VideoGroupShareToggleView,
    ShareVideoGroupChatView,
    ShareVideoGroupChatStreamView,
    ChatLogDashboardView,
    ChatLogDeleteView,
    ChatLogBulkDeleteView,
    ChatLogExportView,
    VideoGroupAddByTagsView,
    TermsView,
    PrivacyView,
    protected_media,
)

app_name = "app"

urlpatterns = [
    path("health/", views.health_check, name="health_check"),
    path("", views.HomeView.as_view(), name="home"),
    path("upload/", views.VideoUploadView.as_view(), name="upload_video"),
    path("videos/", views.VideoListView.as_view(), name="video_list"),
    path("video/<int:pk>/", views.VideoDetailView.as_view(), name="video_detail"),
    path("video/<int:pk>/edit/", views.VideoEditView.as_view(), name="video_edit"),
    path("delete/<int:pk>/", views.VideoDeleteView.as_view(), name="delete_video"),
    path(
        "video/<int:video_id>/reprocess/",
        views.VideoReprocessView.as_view(),
        name="video_reprocess",
    ),
    # Video group related URLs
    path("groups/", views.VideoGroupListView.as_view(), name="video_group_list"),
    path(
        "groups/create/",
        views.VideoGroupCreateView.as_view(),
        name="video_group_create",
    ),
    path(
        "groups/<int:pk>/",
        views.VideoGroupDetailView.as_view(),
        name="video_group_detail",
    ),
    path(
        "groups/<int:group_id>/add-video/",
        views.VideoGroupAddVideoView.as_view(),
        name="video_group_add_video",
    ),
    path(
        "groups/<int:group_id>/add-by-tags/",
        VideoGroupAddByTagsView.as_view(),
        name="video_group_add_by_tags",
    ),
    path(
        "groups/<int:group_id>/remove-video/<int:video_id>/",
        views.VideoGroupRemoveVideoView.as_view(),
        name="video_group_remove_video",
    ),
    path(
        "groups/<int:group_id>/chat/",
        views.VideoGroupChatView.as_view(),
        name="video_group_chat",
    ),
    path(
        "groups/<int:group_id>/chat/stream/",
        views.VideoGroupChatStreamView.as_view(),
        name="video_group_chat_stream",
    ),
    path(
        "groups/<int:group_id>/chat/logs/",
        views.VideoGroupChatLogListView.as_view(),
        name="video_group_chat_logs",
    ),
    path(
        "groups/chat-logs/",
        ChatLogDashboardView.as_view(),
        name="chat_logs_dashboard",
    ),
    path(
        "groups/chat-logs/delete/<int:log_id>/",
        ChatLogDeleteView.as_view(),
        name="chat_log_delete",
    ),
    path(
        "groups/chat-logs/bulk-delete/",
        ChatLogBulkDeleteView.as_view(),
        name="chat_log_bulk_delete",
    ),
    path(
        "groups/chat-logs/export/",
        ChatLogExportView.as_view(),
        name="chat_log_export",
    ),
    path(
        "groups/<int:pk>/delete/",
        views.VideoGroupDeleteView.as_view(),
        name="video_group_delete",
    ),
    # Tag management related URLs
    path("tags/", views.TagManagementView.as_view(), name="tag_management"),
    path("tags/create/", views.TagCreateView.as_view(), name="tag_create"),
    path("tags/<int:pk>/edit/", views.TagEditView.as_view(), name="tag_edit"),
    path("tags/<int:pk>/delete/", views.TagDeleteView.as_view(), name="tag_delete"),
    path("signup/", views.SignUpView.as_view(), name="signup"),
    path("signup_done/", views.SignUpDoneView.as_view(), name="signup_done"),
    path("activate/<uidb64>/<token>/", views.ActivateView.as_view(), name="activate"),
    # Custom login view (with Stripe sync)
    path(
        "login/",
        views.LoginView.as_view(),
        name="login",
    ),
    path("logout/", auth_views.LogoutView.as_view(next_page="/login/"), name="logout"),
    # Password reset related
    path(
        "password_reset/",
        auth_views.PasswordResetView.as_view(
            template_name="app/password_reset_form.html",
            email_template_name="app/password_reset_email.html",
            html_email_template_name="app/password_reset_email.html",
            subject_template_name="app/password_reset_subject.txt",
            success_url="/password_reset/done/",
        ),
        name="password_reset",
    ),
    path(
        "password_reset/done/",
        auth_views.PasswordResetDoneView.as_view(
            template_name="app/password_reset_done.html"
        ),
        name="password_reset_done",
    ),
    path(
        "reset/<uidb64>/<token>/",
        auth_views.PasswordResetConfirmView.as_view(
            template_name="app/password_reset_confirm.html", success_url="/reset/done/"
        ),
        name="password_reset_confirm",
    ),
    path(
        "reset/done/",
        auth_views.PasswordResetCompleteView.as_view(
            template_name="app/password_reset_complete.html"
        ),
        name="password_reset_complete",
    ),
    path(
        "settings/openai-key/",
        views.OpenAIKeyUpdateView.as_view(),
        name="openai_key_update",
    ),
    path(
        "share/group/<slug:share_token>/",
        ShareVideoGroupView.as_view(),
        name="share_video_group",
    ),
    path(
        "group/<int:pk>/share_toggle/",
        VideoGroupShareToggleView.as_view(),
        name="video_group_share_toggle",
    ),
    path(
        "share/group/<slug:share_token>/chat/",
        ShareVideoGroupChatView.as_view(),
        name="share_video_group_chat",
    ),
    path(
        "share/group/<slug:share_token>/chat/stream/",
        ShareVideoGroupChatStreamView.as_view(),
        name="share_video_group_chat_stream",
    ),
    path("terms/", TermsView.as_view(), name="terms"),
    path("privacy/", PrivacyView.as_view(), name="privacy"),
    path("media/<path:path>", protected_media),
]
