import logging

from django.contrib.auth.password_validation import validate_password
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from app.domain.auth.entities import ACCESS_LEVEL_ALL, ACCESS_LEVEL_READ_ONLY

ACCESS_LEVEL_CHOICES = [
    (ACCESS_LEVEL_ALL, "All"),
    (ACCESS_LEVEL_READ_ONLY, "Read Only"),
]

logger = logging.getLogger(__name__)


class UserSignupSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150)
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, style={"input_type": "password"})

    def validate_password(self, value: str) -> str:
        validate_password(value)
        return value


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(write_only=True, style={"input_type": "password"})


class UserSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    username = serializers.CharField()
    email = serializers.EmailField()
    video_limit = serializers.IntegerField()
    video_count = serializers.IntegerField()


class RefreshSerializer(serializers.Serializer):
    refresh = serializers.CharField()


class EmailVerificationSerializer(serializers.Serializer):
    uid = serializers.CharField()
    token = serializers.CharField()


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()


class PasswordResetConfirmSerializer(serializers.Serializer):
    uid = serializers.CharField()
    token = serializers.CharField()
    new_password = serializers.CharField(
        write_only=True, style={"input_type": "password"}, min_length=8
    )

    def validate_new_password(self, value: str) -> str:
        validate_password(value)
        return value


# Response serializers for API documentation
class LoginResponseSerializer(serializers.Serializer):
    access = serializers.CharField(help_text="Access token")
    refresh = serializers.CharField(help_text="Refresh token")


class RefreshResponseSerializer(serializers.Serializer):
    access = serializers.CharField(help_text="New access token")


class MessageResponseSerializer(serializers.Serializer):
    detail = serializers.CharField(help_text="Response message")


class AccountDeleteSerializer(serializers.Serializer):
    reason = serializers.CharField(required=False, allow_blank=True)


class ApiKeySerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    access_level = serializers.CharField()
    prefix = serializers.CharField()
    last_used_at = serializers.DateTimeField(allow_null=True)
    created_at = serializers.DateTimeField()


class ApiKeyCreateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=100)
    access_level = serializers.ChoiceField(
        choices=ACCESS_LEVEL_CHOICES,
        default=ACCESS_LEVEL_ALL,
    )

    def validate_name(self, value: str) -> str:
        name = value.strip()
        if not name:
            raise serializers.ValidationError("name is required")
        return name


class ApiKeyCreateResponseSerializer(ApiKeySerializer):
    api_key = serializers.CharField(
        help_text="Plain API key. This is only returned once."
    )
