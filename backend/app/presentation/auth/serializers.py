import logging

from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.password_validation import validate_password
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers
from rest_framework_simplejwt.tokens import RefreshToken

from app.domain.auth.entities import ACCESS_LEVEL_ALL, ACCESS_LEVEL_CHOICES

logger = logging.getLogger(__name__)

User = get_user_model()


class CredentialsSerializerMixin:
    """Common validation for credentials"""

    def validate_credentials(self, username: str, password: str):
        """Validate username and password"""
        if not username or not password:
            raise serializers.ValidationError("username and password are required")
        user = authenticate(username=username, password=password)
        if user is None:
            raise serializers.ValidationError("Authentication failed")
        return user


class UserSignupSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150)
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, style={"input_type": "password"})

    def validate_password(self, value: str) -> str:
        validate_password(value)
        return value


class LoginSerializer(serializers.Serializer, CredentialsSerializerMixin):
    username = serializers.CharField()
    password = serializers.CharField(write_only=True, style={"input_type": "password"})

    def validate(self, attrs):
        username = attrs.get("username")
        password = attrs.get("password")
        user = self.validate_credentials(username, password)
        attrs["user"] = user
        return attrs


class UserSerializer(serializers.ModelSerializer):
    video_count = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "video_limit",
            "video_count",
        ]

    @extend_schema_field(OpenApiTypes.INT)
    def get_video_count(self, obj) -> int:
        """Return the current user's video count"""
        # Use annotated video_count if available (to avoid N+1 query)
        return getattr(obj, "video_count", obj.videos.count())


class RefreshSerializer(serializers.Serializer):
    refresh = serializers.CharField()

    def validate_refresh(self, value):
        """Validate refresh token"""
        if not value:
            raise serializers.ValidationError("no refresh")
        try:
            # Validate token and save as refresh_obj
            self._refresh_obj = RefreshToken(value)
        except Exception:
            raise serializers.ValidationError("invalid refresh")
        return value

    def validate(self, attrs):
        # Use refresh_obj created in validate_refresh
        attrs["refresh_obj"] = self._refresh_obj
        return attrs


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
