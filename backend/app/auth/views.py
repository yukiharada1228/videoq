from django.contrib.auth import get_user_model
from rest_framework import generics
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken

from .serializers import (LoginSerializer, RefreshSerializer, UserSerializer,
                          UserSignupSerializer, UserUpdateSerializer)

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
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        refresh = serializer.validated_data["refresh_obj"]
        access = refresh.access_token
        return Response({"access": str(access)})


class MeView(AuthenticatedAPIView, generics.RetrieveUpdateAPIView):
    """現在のユーザー情報取得・更新ビュー"""

    def get_serializer_class(self):
        if self.request.method == "PUT" or self.request.method == "PATCH":
            return UserUpdateSerializer
        return UserSerializer

    def get_object(self):
        return self.request.user
