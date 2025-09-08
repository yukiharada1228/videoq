from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import User, Video, VideoGroup, VideoGroupMember, VideoGroupChatLog


@admin.register(User)
class CustomUserAdmin(UserAdmin):
    list_display = (
        "username",
        "email",
        "date_joined",
        "last_login",
        "is_active",
        "video_limit",
    )
    list_filter = (
        "is_staff",
        "is_active",
    )
    search_fields = ("username", "email")
    ordering = ("-date_joined",)

    fieldsets = UserAdmin.fieldsets + (
        (
            "クォータ設定",
            {"fields": ("video_limit",)},
        ),
    )


@admin.register(Video)
class VideoAdmin(admin.ModelAdmin):
    list_display = ("title", "user", "status", "is_visible", "uploaded_at")
    list_filter = ("status", "is_visible", "uploaded_at")
    search_fields = ("title", "user__username")
    ordering = ("-uploaded_at",)
    actions = ["make_visible", "make_hidden"]

    def make_visible(self, request, queryset):
        updated = queryset.update(is_visible=True)
        self.message_user(request, f"{updated}件の動画を表示にしました。")

    make_visible.short_description = "選択した動画を表示"

    def make_hidden(self, request, queryset):
        updated = queryset.update(is_visible=False)
        self.message_user(request, f"{updated}件の動画を非表示にしました。")

    make_hidden.short_description = "選択した動画を非表示"


@admin.register(VideoGroup)
class VideoGroupAdmin(admin.ModelAdmin):
    list_display = ("name", "user", "created_at")
    search_fields = ("name", "user__username")
    ordering = ("-created_at",)


@admin.register(VideoGroupMember)
class VideoGroupMemberAdmin(admin.ModelAdmin):
    list_display = ("group", "video", "added_at", "order")
    search_fields = ("group__name", "video__title")
    ordering = ("group", "order", "added_at")


@admin.register(VideoGroupChatLog)
class VideoGroupChatLogAdmin(admin.ModelAdmin):
    list_display = ("group", "source", "created_at", "session_id")
    search_fields = ("group__name", "question", "answer", "session_id")
    list_filter = ("source", "group")
    ordering = ("-created_at",)
