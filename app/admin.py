from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from django.http import HttpResponseRedirect
from django.urls import path
from django.contrib import messages
from django.shortcuts import redirect
from django.utils.html import format_html
from .models import User, Video, VideoGroup, VideoGroupMember, SubscriptionChangeLog, StripeWebhookEvent
from .stripe_service import StripeService
from .plan_utils import (
    get_plan_name_from_product_id,
    restore_user_sharing,
    disable_user_sharing,
    enforce_video_limit_for_plan,
    log_subscription_change,
    handle_plan_change,
)
import logging
from django.template.response import TemplateResponse


@admin.register(User)
class CustomUserAdmin(UserAdmin):
    list_display = (
        "username",
        "email",
        "is_subscribed",
        "subscription_plan",
        "stripe_customer_id",
        "date_joined",
        "last_login",
        "is_active",
        "ban_reason",
    )
    list_filter = (
        "is_subscribed",
        "subscription_plan",
        "is_staff",
        "is_active",
        "ban_reason",
    )
    search_fields = ("username", "email", "stripe_customer_id", "ban_reason")
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
            "Stripe情報",
            {"fields": ("stripe_customer_id", "is_subscribed", "subscription_plan")},
        ),
        (
            "BAN管理",
            {"fields": ("ban_reason",)},
        ),
    )

    def get_urls(self):
        urls = super().get_urls()
        custom_urls = [
            path(
                "<int:user_id>/sync-stripe/",
                self.admin_site.admin_view(self.sync_stripe_subscription),
                name="user-sync-stripe",
            ),
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

    def sync_stripe_subscription(self, request, user_id):
        try:
            user = User.objects.get(id=user_id)
            stripe_service = StripeService()
            plan_utils = type(
                "PlanUtils",
                (),
                {
                    "get_plan_name_from_product_id": staticmethod(
                        get_plan_name_from_product_id
                    ),
                    "restore_user_sharing": staticmethod(restore_user_sharing),
                    "disable_user_sharing": staticmethod(disable_user_sharing),
                    "enforce_video_limit_for_plan": staticmethod(enforce_video_limit_for_plan),
                    "log_subscription_change": staticmethod(log_subscription_change),
                    "handle_plan_change": staticmethod(handle_plan_change),
                },
            )()

            result = stripe_service.sync_user_subscription(user, plan_utils, logging)

            if result["status"] == "success":
                if result["synced"]:
                    messages.success(
                        request,
                        f"ユーザー {user.username} のサブスクリプション同期が完了しました。",
                    )
                else:
                    messages.info(
                        request,
                        f"ユーザー {user.username} のサブスクリプションに変更はありませんでした。",
                    )
            else:
                messages.error(
                    request,
                    f'ユーザー {user.username} のサブスクリプション同期に失敗しました: {result["message"]}',
                )

        except User.DoesNotExist:
            messages.error(request, f"ユーザーID {user_id} が見つかりません。")
        except Exception as e:
            messages.error(request, f"同期処理中にエラーが発生しました: {str(e)}")

        return HttpResponseRedirect(
            request.META.get("HTTP_REFERER", "/admin/app/user/")
        )

    def ban_user_view(self, request, user_id):
        user = self.get_object(request, user_id)
        if not user:
            return redirect(f"../../{user_id}/change/")
        if request.method == "POST":
            reason = request.POST.get("ban_reason", "")
            user.is_active = False
            user.ban_reason = reason if reason else "管理画面からBAN"
            user.save()
            self.message_user(request, f"ユーザー {user.username} をBANしました。")
            return redirect(f"../../{user_id}/change/")
        # GETの場合は確認画面を表示
        context = {
            "opts": self.model._meta,
            "original": user,
            "ban_reason": user.ban_reason,
            "user_id": user_id,
        }
        return TemplateResponse(request, "admin/ban_confirm.html", context)

    def unban_user_view(self, request, user_id):
        user = self.get_object(request, user_id)
        if user:
            user.is_active = True
            user.ban_reason = ""
            user.save()
            self.message_user(
                request, f"ユーザー {user.username} のBANを解除しました。"
            )
        return redirect(f"../../{user_id}/change/")

    def render_change_form(self, request, context, *args, **kwargs):
        obj = context.get("original")
        form = context["adminform"].form
        if obj and obj.pk and "ban_reason" in form.fields:
            if obj.is_active:
                form.fields["ban_reason"].help_text += format_html(
                    '<br><a class="button" style="margin-top:10px;" href="../ban/">このユーザーをBANする</a>'
                )
            else:
                form.fields["ban_reason"].help_text += format_html(
                    '<br><a class="button" style="margin-top:10px;" href="../unban/">BANを解除する</a>'
                )
        return super().render_change_form(request, context, *args, **kwargs)


@admin.register(Video)
class VideoAdmin(admin.ModelAdmin):
    list_display = (
        "title",
        "user",
        "uploaded_at",
        "status",
        "is_violation",
        "violation_reason",
    )
    list_filter = (
        "uploaded_at",
        "user",
        "status",
        "is_violation",
        "video_groups_through__name",
    )
    search_fields = ("title", "user__username", "violation_reason")
    readonly_fields = ("uploaded_at",)


class VideoGroupMemberInline(admin.TabularInline):
    model = VideoGroupMember
    extra = 0
    fields = ("video", "added_at", "order")
    readonly_fields = ("added_at",)


@admin.register(VideoGroup)
class VideoGroupAdmin(admin.ModelAdmin):
    list_display = ("name", "user", "video_count", "created_at")
    list_filter = ("created_at", "user")
    search_fields = ("name", "user__username", "share_token")
    readonly_fields = ("video_count",)
    inlines = [VideoGroupMemberInline]


@admin.register(SubscriptionChangeLog)
class SubscriptionChangeLogAdmin(admin.ModelAdmin):
    list_display = ("user", "old_plan", "new_plan", "old_subscribed", "new_subscribed", "change_reason", "created_at")
    list_filter = ("old_plan", "new_plan", "old_subscribed", "new_subscribed", "created_at")
    search_fields = ("user__username", "stripe_event_id", "stripe_subscription_id", "change_reason")
    actions = ["delete_selected_logs"]

    def delete_selected_logs(self, request, queryset):
        count = queryset.count()
        queryset.delete()
        self.message_user(request, f"{count}件のサブスクリプション履歴を削除しました。")
    delete_selected_logs.short_description = "選択した履歴を削除"

@admin.register(StripeWebhookEvent)
class StripeWebhookEventAdmin(admin.ModelAdmin):
    list_display = ("event_id", "event_type", "processed", "processed_at", "created_at", "retry_count")
    list_filter = ("event_type", "processed", "created_at")
    search_fields = ("event_id", "event_type", "error_message")
    actions = ["delete_selected_events"]

    def delete_selected_events(self, request, queryset):
        count = queryset.count()
        queryset.delete()
        self.message_user(request, f"{count}件のWebhookイベント履歴を削除しました。")
    delete_selected_events.short_description = "選択したイベントを削除"
