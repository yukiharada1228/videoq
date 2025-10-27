from django.contrib import admin
from django.contrib.auth import get_user_model
from django.contrib.auth.admin import UserAdmin

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
