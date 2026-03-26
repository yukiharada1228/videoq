"""Django Admin configuration.

Admin is treated as an operational privileged path.
When admin actions apply business invariants, they should delegate to use cases
through app.dependencies to keep behavior aligned with API flows.
"""

from django.contrib import admin
from django.contrib.auth import get_user_model
from django.contrib.auth.admin import UserAdmin
from django.apps import apps
from django.db import transaction
from django.db.models import Count

from app.dependencies.admin import get_video_task_gateway
User = get_user_model()
Video = apps.get_model("app", "Video")
Subscription = apps.get_model("app", "Subscription")
VideoGroup = apps.get_model("app", "VideoGroup")
VideoGroupMember = apps.get_model("app", "VideoGroupMember")
AccountDeletionRequest = apps.get_model("app", "AccountDeletionRequest")


class BaseAdminMixin:
    """Unified management of common admin settings"""

    @staticmethod
    def optimize_queryset(queryset, select_related_fields=None, annotate_fields=None):
        """
        Get optimized queryset
        """
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
        "max_video_upload_size_mb",
    )
    list_filter = (
        "is_staff",
        "is_active",
    )
    search_fields = ("username",)
    ordering = ("-date_joined",)

    fieldsets = UserAdmin.fieldsets + (
        ("Video Settings", {"fields": ("max_video_upload_size_mb",)}),
    )
    add_fieldsets = UserAdmin.add_fieldsets


@admin.register(Video)
class VideoAdmin(admin.ModelAdmin):
    list_display = ("title", "user", "status", "uploaded_at")
    list_filter = ("status", "uploaded_at")
    search_fields = ("title", "user__username")
    readonly_fields = ("uploaded_at",)
    actions = ["reindex_all_embeddings"]

    def get_queryset(self, request):
        """Preload user relation"""
        return BaseAdminMixin.optimize_queryset(
            super().get_queryset(request), select_related_fields=["user"]
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

        task_id = get_video_task_gateway().enqueue_reindex_all_videos_embeddings()

        messages.success(
            request,
            f"Started re-indexing video embeddings. "
            f"Task ID: {task_id}. "
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
        return BaseAdminMixin.optimize_queryset(
            super().get_queryset(request),
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
        return BaseAdminMixin.optimize_queryset(
            super().get_queryset(request),
            select_related_fields=["group", "video", "group__user", "video__user"],
        )


@admin.register(AccountDeletionRequest)
class AccountDeletionRequestAdmin(admin.ModelAdmin):
    list_display = ("user", "requested_at", "reason")
    list_filter = ("requested_at",)
    search_fields = ("user__username", "user__email", "reason")
    readonly_fields = ("requested_at",)

    def get_queryset(self, request):
        return BaseAdminMixin.optimize_queryset(
            super().get_queryset(request), select_related_fields=["user"]
        )


@admin.register(Subscription)
class SubscriptionAdmin(admin.ModelAdmin):
    list_display = ("user", "plan", "stripe_status", "used_storage_bytes", "used_processing_seconds", "used_ai_answers")
    list_filter = ("plan",)
    search_fields = ("user__username", "user__email", "stripe_customer_id")
    readonly_fields = ("created_at", "updated_at")

    fieldsets = (
        (
            "Subscription",
            {
                "fields": (
                    "user",
                    "plan",
                    "stripe_customer_id",
                    "stripe_subscription_id",
                    "stripe_status",
                    "current_period_end",
                    "cancel_at_period_end",
                )
            },
        ),
        (
            "Usage",
            {
                "fields": (
                    "used_storage_bytes",
                    "used_processing_seconds",
                    "used_ai_answers",
                    "usage_period_start",
                )
            },
        ),
        (
            "Enterprise Custom Limits",
            {
                "fields": (
                    "custom_storage_gb",
                    "custom_processing_minutes",
                    "custom_ai_answers",
                    "unlimited_processing_minutes",
                    "unlimited_ai_answers",
                )
            },
        ),
        (
            "Timestamps",
            {"fields": ("created_at", "updated_at")},
        ),
    )
