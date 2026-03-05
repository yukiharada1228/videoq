import logging

from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.password_validation import validate_password
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from app.domain.auth.entities import ACCESS_LEVEL_ALL, ACCESS_LEVEL_READ_ONLY

ACCESS_LEVEL_CHOICES = [
    (ACCESS_LEVEL_ALL, "All"),
    (ACCESS_LEVEL_READ_ONLY, "Read Only"),
]

logger = logging.getLogger(__name__)
User = get_user_model()


class CredentialsSerializerMixin:
    """Shared credential validation for auth serializers."""

    @staticmethod
    def validate_credentials(username: str, password: str):
        if not username or not password:
            raise serializers.ValidationError("Username and password are required.")

        user = authenticate(username=username, password=password)
        if user is None:
            raise serializers.ValidationError("Invalid credentials.")
        return user


class UserSignupSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150)
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, style={"input_type": "password"})

    def validate_password(self, value: str) -> str:
        validate_password(value)
        return value

    def validate_email(self, value: str) -> str:
        email = value.strip()
        if User.objects.filter(email__iexact=email).exists():
            raise serializers.ValidationError("A user with this email already exists.")
        return email


class LoginSerializer(CredentialsSerializerMixin, serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(write_only=True, style={"input_type": "password"})

    def validate(self, attrs):
        user = self.validate_credentials(
            username=attrs.get("username", ""),
            password=attrs.get("password", ""),
        )
        attrs["user"] = user
        return attrs


class UserSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    username = serializers.CharField()
    email = serializers.EmailField()
    video_limit = serializers.IntegerField()
    video_count = serializers.SerializerMethodField()

    def get_video_count(self, obj) -> int:
        if isinstance(obj, dict):
            return int(obj.get("video_count", 0) or 0)
        videos = getattr(obj, "videos", None)
        if videos is None:
            return 0
        return videos.count()


class RefreshSerializer(serializers.Serializer):
    refresh = serializers.CharField()

    def validate_refresh(self, value: str) -> str:
        try:
            RefreshToken(value)
        except TokenError as e:
            raise serializers.ValidationError(str(e))
        return value


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
