from django.urls import path
from django.contrib.auth import views as auth_views
from . import views
from .views import (
    ShareVideoGroupView,
    VideoGroupShareToggleView,
    ShareVideoGroupChatView,
    ShareVideoGroupChatStreamView,
    TermsView,
    PrivacyView,
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
    # 動画グループ関連のURL
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
        "groups/<int:pk>/delete/",
        views.VideoGroupDeleteView.as_view(),
        name="video_group_delete",
    ),
    path("signup/", views.SignUpView.as_view(), name="signup"),
    path("signup_done/", views.SignUpDoneView.as_view(), name="signup_done"),
    path("activate/<uidb64>/<token>/", views.ActivateView.as_view(), name="activate"),
    # カスタムログインビュー（Stripe同期付き）
    path(
        "login/",
        views.LoginView.as_view(),
        name="login",
    ),
    path("logout/", auth_views.LogoutView.as_view(next_page="/login/"), name="logout"),
    # パスワードリセット関連
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
    path(
        "commercial-disclosure/",
        views.CommercialDisclosureView.as_view(),
        name="commercial_disclosure",
    ),
    path("terms/", TermsView.as_view(), name="terms"),
    path("privacy/", PrivacyView.as_view(), name="privacy"),
]
