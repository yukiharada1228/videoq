import logging

from app.utils.email import send_email_verification, send_password_reset_email
from app.utils.encryption import encrypt_api_key, is_encrypted
from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.utils.encoding import force_str
from django.utils.http import urlsafe_base64_decode
from rest_framework import serializers
from rest_framework_simplejwt.tokens import RefreshToken

logger = logging.getLogger(__name__)

User = get_user_model()


class CredentialsSerializerMixin:
    """認証情報の共通バリデーション"""

    def validate_credentials(self, username: str, password: str):
        """ユーザー名とパスワードの検証"""
        if not username or not password:
            raise serializers.ValidationError("username と password は必須です")
        user = authenticate(username=username, password=password)
        if user is None:
            raise serializers.ValidationError("認証に失敗しました")
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
                "このメールアドレスは既に登録されています。"
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
            # ユーザーを作成済みでもメール送信失敗時は例外を伝播させる
            user.delete()
            raise serializers.ValidationError(
                "確認メールの送信に失敗しました。しばらくしてから再度お試しください。"
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
    class Meta:
        model = User
        fields = ["id", "username", "email", "encrypted_openai_api_key"]


class UserUpdateSerializer(serializers.ModelSerializer):
    """ユーザー情報更新用のシリアライザー"""

    class Meta:
        model = User
        fields = ["encrypted_openai_api_key"]

    def update(self, instance, validated_data):
        encrypted_api_key = validated_data.get("encrypted_openai_api_key")

        if encrypted_api_key:
            # APIキーが既に暗号化されているかチェック
            # プレーンテキストの場合のみ暗号化
            if not is_encrypted(encrypted_api_key):
                try:
                    encrypted_api_key = encrypt_api_key(encrypted_api_key)
                except Exception as e:
                    raise serializers.ValidationError(
                        f"APIキーの暗号化に失敗しました: {str(e)}"
                    )

            validated_data["encrypted_openai_api_key"] = encrypted_api_key
        else:
            # nullの場合は暗号化しない
            validated_data["encrypted_openai_api_key"] = None

        return super().update(instance, validated_data)


class RefreshSerializer(serializers.Serializer):
    refresh = serializers.CharField()

    def validate_refresh(self, value):
        """リフレッシュトークンの検証"""
        if not value:
            raise serializers.ValidationError("no refresh")
        try:
            # トークンの検証を行い、refresh_objとして保存
            self._refresh_obj = RefreshToken(value)
        except Exception:
            raise serializers.ValidationError("invalid refresh")
        return value

    def validate(self, attrs):
        # validate_refreshで作成したrefresh_objを使用
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
            raise serializers.ValidationError("無効な確認リンクです。")

        if not default_token_generator.check_token(user, token):
            raise serializers.ValidationError(
                "トークンが無効、または有効期限が切れています。"
            )

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
        "invalid_link": "無効なリセットリンクです。",
        "invalid_token": "トークンが無効、または有効期限が切れています。",
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
