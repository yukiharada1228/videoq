from django.contrib.auth import get_user_model
from rest_framework import generics
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken

from .serializers import (LoginSerializer, RefreshSerializer, UserSerializer,
                          UserSignupSerializer)

User = get_user_model()


class PublicAPIView(generics.GenericAPIView):
    """認証不要のAPIビュー"""

    permission_classes = [AllowAny]


class AuthenticatedAPIView(generics.GenericAPIView):
    """認証必須のAPIビュー"""

    permission_classes = [IsAuthenticated]


class UserSignupView(generics.CreateAPIView):
    """ユーザー新規登録ビュー"""

    queryset = User.objects.all()
    serializer_class = UserSignupSerializer
    permission_classes = [AllowAny]


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
        return Response({"access": str(refresh.access_token), "refresh": str(refresh)})


class RefreshView(PublicAPIView):
    """トークンリフレッシュビュー"""

    serializer_class = RefreshSerializer

    def post(self, request):
        if not request.data.get("refresh"):
            return Response({"detail": "no refresh"}, status=401)
        serializer = self.get_serializer(data=request.data)
        try:
            serializer.is_valid(raise_exception=True)
        except Exception:
            return Response({"detail": "invalid refresh"}, status=401)
        refresh = serializer.validated_data["refresh_obj"]
        access = refresh.access_token
        return Response({"access": str(access)})


class MeView(AuthenticatedAPIView, generics.RetrieveAPIView):
    """現在のユーザー情報取得ビュー"""

    serializer_class = UserSerializer

    def get_object(self):
        return self.request.user
