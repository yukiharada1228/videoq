from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from django.urls import path
from django.shortcuts import redirect
from .models import User, Video, VideoGroup, VideoGroupMember


@admin.register(User)
class CustomUserAdmin(UserAdmin):
    list_display = (
        "username",
        "email",
        "date_joined",
        "last_login",
        "is_active",
        "ban_reason",
    )
    list_filter = (
        "is_staff",
        "is_active",
        "ban_reason",
    )
    search_fields = ("username", "email", "ban_reason")
    ordering = ("-date_joined",)

    actions = ["ban_users", "unban_users"]

    def ban_users(self, request, queryset):
        updated = queryset.update(is_active=False)
        self.message_user(
            request, f"{updated}件のユーザーをBANしました（is_active=False）。"
        )

    ban_users.short_description = "選択したユーザーをBAN（利用停止）"

    def unban_users(self, request, queryset):
        updated = queryset.update(is_active=True, ban_reason="")
        self.message_user(
            request, f"{updated}件のユーザーのBANを解除しました（is_active=True）。"
        )

    unban_users.short_description = "選択したユーザーのBANを解除"

    fieldsets = UserAdmin.fieldsets + (
        (
            "BAN管理",
            {"fields": ("ban_reason",)},
        ),
    )

    def get_urls(self):
        urls = super().get_urls()
        custom_urls = [
            path(
                "<int:user_id>/ban/",
                self.admin_site.admin_view(self.ban_user_view),
                name="app_user_ban",
            ),
            path(
                "<int:user_id>/unban/",
                self.admin_site.admin_view(self.unban_user_view),
                name="app_user_unban",
            ),
        ]
        return custom_urls + urls

    def ban_user_view(self, request, user_id):
        user = User.objects.get(id=user_id)
        user.is_active = False
        user.save()
        self.message_user(request, f"ユーザー {user.username} をBANしました。")
        return redirect("..")

    def unban_user_view(self, request, user_id):
        user = User.objects.get(id=user_id)
        user.is_active = True
        user.ban_reason = ""
        user.save()
        self.message_user(request, f"ユーザー {user.username} のBANを解除しました。")
        return redirect("..")


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
