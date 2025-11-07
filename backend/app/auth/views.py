from app.utils.mixins import AuthenticatedViewMixin, PublicViewMixin
from django.contrib.auth import get_user_model
from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework_simplejwt.exceptions import InvalidToken
from rest_framework_simplejwt.tokens import RefreshToken

from .serializers import (EmailVerificationSerializer, LoginSerializer,
                          PasswordChangeSerializer, RefreshSerializer,
                          UserSerializer, UserSignupSerializer,
                          UserUpdateSerializer)

User = get_user_model()


class PublicAPIView(PublicViewMixin, generics.GenericAPIView):
    """認証不要のAPIビュー"""


class AuthenticatedAPIView(AuthenticatedViewMixin, generics.GenericAPIView):
    """認証必須のAPIビュー"""


class UserSignupView(generics.CreateAPIView):
    """ユーザー新規登録ビュー"""

    queryset = User.objects.all()
    serializer_class = UserSignupSerializer
    permission_classes = PublicViewMixin.permission_classes

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        headers = self.get_success_headers(serializer.data)
        return Response(
            {"detail": "確認メールを送信しました。メールをご確認ください。"},
            status=status.HTTP_201_CREATED,
            headers=headers,
        )


class LoginView(PublicAPIView):
    """ログインビュー"""

    serializer_class = LoginSerializer

    def post(self, request):
        serializer = self.get_serializer(
            data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data["user"]
        refresh = RefreshToken.for_user(user)

        response = Response(
            {"access": str(refresh.access_token), "refresh": str(refresh)}
        )

        # HttpOnly Cookie に JWT トークンを設定
        response.set_cookie(
            key="access_token",
            value=str(refresh.access_token),
            httponly=True,
            secure=False,  # 開発環境では False、本番では True
            samesite="Lax",
            max_age=60 * 10,  # 10分（ACCESS_TOKEN_LIFETIME と同じ）
        )
        response.set_cookie(
            key="refresh_token",
            value=str(refresh),
            httponly=True,
            secure=False,  # 開発環境では False、本番では True
            samesite="Lax",
            max_age=60 * 60 * 24 * 14,  # 14日（REFRESH_TOKEN_LIFETIME と同じ）
        )

        return response


class LogoutView(AuthenticatedAPIView):
    """ログアウトビュー"""

    def post(self, request):
        """HttpOnly Cookieを削除してログアウト"""
        response = Response({"message": "ログアウトしました"})

        # HttpOnly Cookieを削除
        response.delete_cookie("access_token")
        response.delete_cookie("refresh_token")

        return response


class RefreshView(PublicAPIView):
    """トークンリフレッシュビュー"""

    serializer_class = RefreshSerializer

    def post(self, request):
        # Cookieからリフレッシュトークンを取得（優先）
        refresh_token = request.COOKIES.get("refresh_token")

        # Cookieにない場合はリクエストボディから取得（後方互換性）
        if not refresh_token:
            serializer = self.get_serializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            refresh = serializer.validated_data["refresh_obj"]
        else:
            # Cookieから取得したトークンを検証
            try:
                refresh = RefreshToken(refresh_token)
            except InvalidToken:
                return Response(
                    {"detail": "無効なリフレッシュトークンです"},
                    status=status.HTTP_401_UNAUTHORIZED,
                )

        access = refresh.access_token

        response = Response({"access": str(access)})

        # HttpOnly Cookie に新しい access_token を設定
        response.set_cookie(
            key="access_token",
            value=str(access),
            httponly=True,
            secure=False,  # 開発環境では False、本番では True
            samesite="Lax",
            max_age=60 * 10,  # 10分（ACCESS_TOKEN_LIFETIME と同じ）
        )

        return response


class EmailVerificationView(PublicAPIView):
    """メール認証完了ビュー"""

    serializer_class = EmailVerificationSerializer

    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response({"detail": "メール認証が完了しました。ログインしてください。"})


class MeView(AuthenticatedAPIView, generics.RetrieveUpdateAPIView):
    """現在のユーザー情報取得・更新ビュー"""

    def get_serializer_class(self):
        if self.request.method == "PUT" or self.request.method == "PATCH":
            return UserUpdateSerializer
        return UserSerializer

    def get_object(self):
        return self.request.user


class PasswordChangeView(AuthenticatedAPIView):
    """パスワード変更ビュー"""

    serializer_class = PasswordChangeSerializer

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response({"detail": "パスワードを変更しました。"})
