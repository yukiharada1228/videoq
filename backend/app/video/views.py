from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from app.models import Video
from .serializers import (
    VideoCreateSerializer,
    VideoListSerializer,
    VideoSerializer,
    VideoUpdateSerializer,
)


class BaseVideoView:
    """共通のVideoビュー基底クラス（DRY原則）"""
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        """現在のユーザーのVideoのみを返す共通ロジック（DRY原則）"""
        return Video.objects.filter(user=self.request.user)


class VideoListView(BaseVideoView, generics.ListCreateAPIView):
    """Video一覧取得・作成ビュー"""

    def get_serializer_class(self):
        """リクエストのメソッドに応じてシリアライザーを変更"""
        if self.request.method == "POST":
            return VideoCreateSerializer
        return VideoListSerializer


class VideoDetailView(BaseVideoView, generics.RetrieveUpdateDestroyAPIView):
    """Video詳細・更新・削除ビュー"""

    def get_queryset(self):
        """N+1問題対策: シリアライザーにuserを含めているため、select_relatedが必要"""
        return super().get_queryset().select_related('user')

    def get_serializer_class(self):
        """リクエストのメソッドに応じてシリアライザーを変更"""
        if self.request.method == "GET":
            return VideoSerializer
        if self.request.method in ["PUT", "PATCH"]:
            return VideoUpdateSerializer
        return VideoSerializer

    def destroy(self, request, *args, **kwargs):
        """Video削除時にファイルも削除"""
        instance = self.get_object()
        # ファイルが存在する場合は削除
        if instance.file:
            instance.file.delete(save=False)
        return super().destroy(request, *args, **kwargs)

