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
    list_display = ("title", "user", "uploaded_at", "status", "is_violation")
    search_fields = ("title", "user__username")
    list_filter = ("status", "is_violation")
    ordering = ("-uploaded_at",)


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
