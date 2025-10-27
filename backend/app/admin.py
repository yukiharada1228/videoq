from django.contrib import admin
from django.contrib.auth import get_user_model
from django.contrib.auth.admin import UserAdmin

from .models import Video

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
