import logging

from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from app.contracts.auth import ACCESS_LEVEL_ALL, ACCESS_LEVEL_READ_ONLY

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
    video_limit = serializers.IntegerField(allow_null=True)
    video_count = serializers.SerializerMethodField()

    def get_video_count(self, obj) -> int:
        # Prefer the explicit boundary field (UserEntity/User DTO).
        if hasattr(obj, "video_count"):
            return int(getattr(obj, "video_count") or 0)
        if isinstance(obj, dict):
            return int(obj.get("video_count", 0) or 0)
        videos = getattr(obj, "videos", None)
        if videos is None:
            return 0
        return videos.count()


class EmailVerificationSerializer(serializers.Serializer):
    uid = serializers.CharField()
    token = serializers.CharField()


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()


class PasswordResetConfirmBodySerializer(serializers.Serializer):
    """Serializer for PATCH /password-resets/<token>/: token comes from URL path."""

    uid = serializers.CharField()
    new_password = serializers.CharField(
        write_only=True, style={"input_type": "password"}, min_length=8
    )

    def validate_new_password(self, value: str) -> str:
        validate_password(value)
        return value


# Response serializers for API documentation
class LoginResponseSerializer(serializers.Serializer):
    message = serializers.CharField(
        required=False,
        help_text="Optional response message. JWT tokens are set in HttpOnly cookies.",
    )


class RefreshResponseSerializer(serializers.Serializer):
    message = serializers.CharField(
        required=False,
        help_text="Optional response message. Rotated JWT tokens are set in HttpOnly cookies.",
    )


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


class OpenAiApiKeyInputSerializer(serializers.Serializer):
    api_key = serializers.CharField(min_length=1)


class OpenAiApiKeyStatusSerializer(serializers.Serializer):
    has_key = serializers.BooleanField()
    masked_key = serializers.CharField(allow_null=True)
