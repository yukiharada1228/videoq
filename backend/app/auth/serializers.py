from django.contrib.auth import get_user_model
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from app.auth.services import authenticate_credentials
from app.models import UserApiKey

User = get_user_model()


class CredentialsSerializerMixin:
    """Common validation for credentials"""

    def validate_credentials(self, username: str, password: str):
        """Validate username and password"""
        try:
            return authenticate_credentials(username=username, password=password)
        except ValueError as exc:
            raise serializers.ValidationError(str(exc)) from exc


class UserSignupSerializer(serializers.ModelSerializer):
    email = serializers.EmailField()

    class Meta:
        model = User
        fields = ["username", "email", "password"]
        extra_kwargs = {"password": {"write_only": True}}

    def validate_email(self, value: str) -> str:
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError(
                "This email address is already registered."
            )
        return value


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(write_only=True, style={"input_type": "password"})


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
        if hasattr(obj, "video_count"):
            return obj.video_count
        return obj.videos.count()


class RefreshSerializer(serializers.Serializer):
    refresh = serializers.CharField(allow_blank=False)


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


class ApiKeySerializer(serializers.ModelSerializer):
    class Meta:
        model = UserApiKey
        fields = [
            "id",
            "name",
            "access_level",
            "prefix",
            "last_used_at",
            "created_at",
        ]
        read_only_fields = fields


class ApiKeyCreateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=100)
    access_level = serializers.ChoiceField(
        choices=UserApiKey.AccessLevel.choices,
        default=UserApiKey.AccessLevel.ALL,
    )

    def validate_name(self, value: str) -> str:
        name = value.strip()
        if not name:
            raise serializers.ValidationError("name is required")
        return name

    def validate(self, attrs):
        attrs["name"] = attrs["name"].strip()
        return attrs


class ApiKeyCreateResponseSerializer(ApiKeySerializer):
    api_key = serializers.CharField(
        help_text="Plain API key. This is only returned once."
    )

    class Meta(ApiKeySerializer.Meta):
        fields = [*ApiKeySerializer.Meta.fields, "api_key"]
        read_only_fields = fields
