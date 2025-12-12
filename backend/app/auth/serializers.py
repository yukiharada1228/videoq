import logging

from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.utils.encoding import force_str
from django.utils.http import urlsafe_base64_decode
from rest_framework import serializers
from rest_framework_simplejwt.tokens import RefreshToken

from app.utils.email import send_email_verification, send_password_reset_email

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

    def create(self, validated_data):
        try:
            user = User.objects.create_user(
                username=validated_data["username"],
                email=validated_data["email"],
                password=validated_data["password"],
                is_active=False,
            )
        except Exception as exc:
            logger.exception("Failed to create user during signup")
            raise exc

        try:
            send_email_verification(user)
        except Exception:
            # Propagate exception even if user is created but email sending fails
            user.delete()
            raise serializers.ValidationError(
                "Failed to send verification email. Please try again later."
            )

        return user


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
        fields = ["id", "username", "email", "video_limit", "video_count"]

    def get_video_count(self, obj):
        """現在のユーザーの動画数を返す"""
        return obj.videos.count()


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

    def validate(self, attrs):
        uidb64 = attrs.get("uid")
        token = attrs.get("token")

        try:
            uid = force_str(urlsafe_base64_decode(uidb64))
            user = User.objects.get(pk=uid)
        except (TypeError, ValueError, OverflowError, User.DoesNotExist):
            raise serializers.ValidationError("Invalid verification link.")

        if not default_token_generator.check_token(user, token):
            raise serializers.ValidationError("Token is invalid or has expired.")

        attrs["user"] = user
        return attrs

    def save(self, **kwargs):
        user = self.validated_data["user"]
        if not user.is_active:
            user.is_active = True
            user.save(update_fields=["is_active"])
        return user


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()

    def save(self, **kwargs):
        email = self.validated_data["email"]
        user = (
            User.objects.filter(email__iexact=email, is_active=True)
            .order_by("id")
            .first()
        )
        if not user:
            return None

        send_password_reset_email(user)
        return user


class PasswordResetConfirmSerializer(serializers.Serializer):
    uid = serializers.CharField()
    token = serializers.CharField()
    new_password = serializers.CharField(
        write_only=True, style={"input_type": "password"}, min_length=8
    )

    default_error_messages = {
        "invalid_link": "Invalid reset link.",
        "invalid_token": "Token is invalid or has expired.",
    }

    def validate(self, attrs):
        uidb64 = attrs.get("uid")
        token = attrs.get("token")

        try:
            uid = force_str(urlsafe_base64_decode(uidb64))
            user = User.objects.get(pk=uid)
        except (TypeError, ValueError, OverflowError, User.DoesNotExist):
            self.fail("invalid_link")

        if not default_token_generator.check_token(user, token):
            self.fail("invalid_token")

        new_password = attrs.get("new_password")
        validate_password(new_password, user)

        attrs["user"] = user
        return attrs

    def save(self, **kwargs):
        user = self.validated_data["user"]
        new_password = self.validated_data["new_password"]
        user.set_password(new_password)
        user.save(update_fields=["password"])
        return user


# Response serializers for API documentation
class LoginResponseSerializer(serializers.Serializer):
    access = serializers.CharField(help_text="Access token")
    refresh = serializers.CharField(help_text="Refresh token")


class RefreshResponseSerializer(serializers.Serializer):
    access = serializers.CharField(help_text="New access token")


class MessageResponseSerializer(serializers.Serializer):
    detail = serializers.CharField(help_text="Response message")


# OpenAI API Key serializers
class OpenAIApiKeySetSerializer(serializers.Serializer):
    api_key = serializers.CharField(
        write_only=True,
        style={"input_type": "password"},
        help_text="OpenAI API key (starts with sk-)",
        min_length=20,
        max_length=200,
    )

    def validate_api_key(self, value):
        """Validate OpenAI API key format"""
        if not value.startswith("sk-"):
            raise serializers.ValidationError(
                "Invalid API key format. OpenAI API keys should start with 'sk-'."
            )
        return value

    def save(self, user):
        """Save encrypted API key to user"""
        from app.utils.encryption import encrypt_api_key

        api_key = self.validated_data["api_key"]
        user.openai_api_key_encrypted = encrypt_api_key(api_key)
        user.save(update_fields=["openai_api_key_encrypted"])
        return user


class OpenAIApiKeyStatusSerializer(serializers.Serializer):
    has_api_key = serializers.BooleanField(
        help_text="Whether the user has set an OpenAI API key"
    )


class OpenAIApiKeyMessageSerializer(serializers.Serializer):
    message = serializers.CharField(help_text="Response message")
