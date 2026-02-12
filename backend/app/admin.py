from django.contrib import admin, messages
from django.contrib.auth import get_user_model
from django.contrib.auth.admin import UserAdmin
from django.db.models import Count

from .models import Subscription, UsageRecord, Video, VideoGroup, VideoGroupMember

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
        "get_plan",
        "get_usage",
    )
    list_filter = (
        "is_staff",
        "is_active",
    )
    search_fields = ("username", "email")
    ordering = ("-date_joined",)

    @admin.display(description="Plan")
    def get_plan(self, obj):
        try:
            return obj.subscription.plan
        except Exception:
            return "free"

    @admin.display(description="Usage (Proc/AI)")
    def get_usage(self, obj):
        return f"{obj.processing_minutes_used:.1f}m / {obj.ai_answers_used}"


@admin.register(Video)
class VideoAdmin(admin.ModelAdmin):
    list_display = ("title", "user", "status", "uploaded_at")
    list_filter = ("status", "uploaded_at")
    search_fields = ("title", "user__username")
    readonly_fields = ("uploaded_at",)
    actions = ["reindex_all_embeddings"]

    def get_queryset(self, request):
        """Preload user relation"""
        return BaseAdminMixin.get_optimized_queryset(
            request, Video, select_related_fields=["user"]
        )

    @admin.action(description="Re-index video embeddings")
    def reindex_all_embeddings(self, request, queryset):
        """
        Regenerate embedding vectors for all videos (superuser only)
        Note: queryset selection is ignored - all videos will be re-indexed
        """
        if not request.user.is_superuser:
            messages.error(request, "This action is only available to superusers.")
            return

        # Start Celery task
        from app.tasks.reindexing import reindex_all_videos_embeddings

        task = reindex_all_videos_embeddings.delay()

        messages.success(
            request,
            f"Started re-indexing video embeddings. "
            f"Task ID: {task.id}. "
            f"This may take some time. Check Celery worker logs for progress.",
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


@admin.register(Subscription)
class SubscriptionAdmin(admin.ModelAdmin):
    list_display = ("user", "plan", "stripe_status", "cancel_at_period_end", "current_period_end")
    list_filter = ("plan", "stripe_status", "cancel_at_period_end")
    search_fields = ("user__username", "user__email", "stripe_customer_id")
    readonly_fields = ("created_at", "updated_at")
    raw_id_fields = ("user",)

    def get_queryset(self, request):
        return super().get_queryset(request).select_related("user")


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


@admin.register(UsageRecord)
class UsageRecordAdmin(admin.ModelAdmin):
    list_display = ("user", "resource", "amount", "video", "created_at")
    list_filter = ("resource", "created_at")
    search_fields = ("user__username", "user__email")
    readonly_fields = ("created_at",)
    raw_id_fields = ("user", "video")

    def get_queryset(self, request):
        return super().get_queryset(request).select_related("user", "video")
