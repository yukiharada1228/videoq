from django.contrib.auth import authenticate, get_user_model
from rest_framework import serializers
from rest_framework_simplejwt.tokens import RefreshToken

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
    class Meta:
        model = User
        fields = ["username", "password"]
        extra_kwargs = {"password": {"write_only": True}}

    def create(self, validated_data):
        user = User.objects.create_user(**validated_data)
        user.save()
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
        fields = ["id", "username"]


class RefreshSerializer(serializers.Serializer):
    refresh = serializers.CharField()

    def validate_refresh(self, value):
        """リフレッシュトークンの検証"""
        if not value:
            raise serializers.ValidationError("refresh は必須です")
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
