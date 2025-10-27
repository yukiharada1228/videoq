from django.contrib import admin
from django.contrib.auth import get_user_model
from django.contrib.auth.admin import UserAdmin

from .models import Video, VideoGroup, VideoGroupMember

User = get_user_model()


@admin.register(User)
class CustomUserAdmin(UserAdmin):
    list_display = (
        "username",
        "date_joined",
        "last_login",
        "is_active",
    )
    list_filter = (
        "is_staff",
        "is_active",
    )
    search_fields = ("username",)
    ordering = ("-date_joined",)


@admin.register(Video)
class VideoAdmin(admin.ModelAdmin):
    list_display = ("title", "user", "status", "uploaded_at")
    list_filter = ("status", "uploaded_at")
    search_fields = ("title", "user__username")
    readonly_fields = ("uploaded_at",)

    def get_queryset(self, request):
        """N+1問題対策: userリレーションを事前読み込み"""
        return super().get_queryset(request).select_related("user")


@admin.register(VideoGroup)
class VideoGroupAdmin(admin.ModelAdmin):
    list_display = ("name", "user", "get_video_count", "created_at")
    list_filter = ("created_at",)
    search_fields = ("name", "user__username")
    readonly_fields = ("created_at", "updated_at", "get_video_count")

    def get_queryset(self, request):
        """N+1問題対策: userリレーションとvideo_countを事前読み込み"""
        from django.db.models import Count

        return (
            super()
            .get_queryset(request)
            .select_related("user")
            .annotate(video_count=Count("members__video"))
        )

    def get_video_count(self, obj):
        """annotateで追加されたvideo_countを表示（DRY原則・N+1問題対策）"""
        return getattr(obj, "video_count", obj.members.count())

    get_video_count.short_description = "動画数"
    get_video_count.admin_order_field = "video_count"


@admin.register(VideoGroupMember)
class VideoGroupMemberAdmin(admin.ModelAdmin):
    list_display = ("group", "video", "order", "added_at")
    list_filter = ("added_at",)
    search_fields = ("group__name", "video__title")
    readonly_fields = ("added_at",)

    def get_queryset(self, request):
        """N+1問題対策: groupとvideoリレーションを事前読み込み"""
        return super().get_queryset(request).select_related("group", "video")
