from django.contrib import admin, messages
from django.contrib.auth import get_user_model
from django.contrib.auth.admin import UserAdmin
from django.db.models import Count

from .models import Video, VideoGroup, VideoGroupMember

User = get_user_model()


class BaseAdminMixin:
    """Unified management of common admin settings"""

    @staticmethod
    def get_optimized_queryset(
        request, model_class, select_related_fields=None, annotate_fields=None
    ):
        """
        Get optimized queryset
        """
        queryset = model_class.objects.all()

        if select_related_fields:
            queryset = queryset.select_related(*select_related_fields)

        if annotate_fields:
            queryset = queryset.annotate(**annotate_fields)

        return queryset


@admin.register(User)
class CustomUserAdmin(UserAdmin):
    list_display = (
        "username",
        "date_joined",
        "last_login",
        "is_active",
        "video_limit",
        "preferred_llm_model",
        "preferred_llm_temperature",
    )
    list_filter = (
        "is_staff",
        "is_active",
    )
    search_fields = ("username",)
    ordering = ("-date_joined",)

    fieldsets = UserAdmin.fieldsets + (
        ("Video Settings", {"fields": ("video_limit",)}),
        (
            "LLM Settings",
            {"fields": ("preferred_llm_model", "preferred_llm_temperature")},
        ),
    )
    add_fieldsets = UserAdmin.add_fieldsets

    def save_model(self, request, obj, form, change):
        """Override to show warning when reducing video_limit"""
        if change and "video_limit" in form.changed_data:
            old_user = User.objects.get(pk=obj.pk)
            old_limit = old_user.video_limit
            new_limit = obj.video_limit

            # Check if reduction will trigger deletions
            if self._will_delete_videos(old_limit, new_limit, obj):
                current_count = Video.objects.filter(user=obj).count()
                videos_to_delete = current_count - (
                    new_limit if new_limit is not None else 0
                )

                messages.warning(
                    request,
                    f"Warning: Reducing video_limit will automatically delete "
                    f"{videos_to_delete} oldest video(s) for user {obj.username}.",
                )

        super().save_model(request, obj, form, change)

    def _will_delete_videos(self, old_limit, new_limit, user):
        """Check if limit reduction will trigger deletions"""
        if old_limit == new_limit or new_limit is None:
            return False
        if old_limit is None or new_limit < old_limit:
            current_count = Video.objects.filter(user=user).count()
            return current_count > (new_limit if new_limit is not None else 0)
        return False


@admin.register(Video)
class VideoAdmin(admin.ModelAdmin):
    list_display = ("title", "user", "status", "uploaded_at")
    list_filter = ("status", "uploaded_at")
    search_fields = ("title", "user__username")
    readonly_fields = ("uploaded_at",)

    def get_queryset(self, request):
        """Preload user relation"""
        return BaseAdminMixin.get_optimized_queryset(
            request, Video, select_related_fields=["user"]
        )


@admin.register(VideoGroup)
class VideoGroupAdmin(admin.ModelAdmin):
    list_display = ("name", "user", "get_video_count", "created_at")
    list_filter = ("created_at",)
    search_fields = ("name", "user__username")
    readonly_fields = ("created_at", "updated_at", "get_video_count")

    def get_queryset(self, request):
        """Preload user relation and video_count"""
        return BaseAdminMixin.get_optimized_queryset(
            request,
            VideoGroup,
            select_related_fields=["user"],
            annotate_fields={"video_count": Count("members__video")},
        )

    @admin.display(description="Video Count", ordering="video_count")
    def get_video_count(self, obj):
        """Display video_count added by annotate"""
        return getattr(obj, "video_count", obj.members.count())


@admin.register(VideoGroupMember)
class VideoGroupMemberAdmin(admin.ModelAdmin):
    list_display = ("group", "video", "order", "added_at")
    list_filter = ("added_at",)
    search_fields = ("group__name", "video__title")
    readonly_fields = ("added_at",)

    def get_queryset(self, request):
        """Preload group and video relations"""
        return BaseAdminMixin.get_optimized_queryset(
            request,
            VideoGroupMember,
            select_related_fields=["group", "video", "group__user", "video__user"],
        )
