from django.db import models
from django.contrib.auth.models import AbstractUser
from django.conf import settings
from django.core.files.storage import FileSystemStorage
from storages.backends.s3boto3 import S3Boto3Storage
import os
import time


class User(AbstractUser):
    # OpenAI APIキー（暗号化保存）
    encrypted_openai_api_key = models.TextField(
        blank=True, null=True, help_text="暗号化されたOpenAI APIキー"
    )
    # このユーザー固有の動画数上限（null の場合はデフォルト設定を使用）
    video_limit = models.IntegerField(
        null=True,
        blank=True,
        help_text="このユーザーの動画数上限（nullならデフォルト上限を適用）",
    )

    def __str__(self):
        return self.username

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        """ユーザー削除時にPinecone/OpenSearchのデータも削除"""
        try:
            from app.vector_search_factory import VectorSearchFactory

            if VectorSearchFactory.is_pinecone_enabled():
                from app.pinecone_service import PineconeService

                # APIキーは不要（namespace削除のみ）
                pinecone_service = PineconeService(
                    user_id=self.id, openai_api_key=None, ensure_indexes=False
                )
                pinecone_service.delete_user_namespace()
            if VectorSearchFactory.is_opensearch_enabled():
                from app.opensearch_service import OpenSearchService

                opensearch_service = OpenSearchService(
                    user_id=self.id, openai_api_key=None, ensure_indexes=False
                )
                opensearch_service.delete_user_data()
        except Exception as e:
            print(f"[User.delete] Error deleting vector DB data: {e}")
        super().delete(*args, **kwargs)

    def get_video_limit(self) -> int:
        """このユーザーに適用される動画数上限を返す。

        ユーザー個別の `video_limit` が設定されていればそれを使用し、
        設定されていなければ `settings.DEFAULT_MAX_VIDEOS_PER_USER` を使用する。
        """
        # 遅延インポートで循環参照を回避
        from django.conf import settings as _settings

        default_limit = getattr(_settings, "DEFAULT_MAX_VIDEOS_PER_USER", 100)
        if self.video_limit is not None:
            try:
                limit = int(self.video_limit)
            except Exception:
                limit = int(default_limit)
        else:
            try:
                limit = int(default_limit)
            except Exception:
                limit = 100
        return max(0, limit)


class SafeLocalFileStorage(FileSystemStorage):
    """
    ローカル用の安全なファイルストレージ
    """

    def get_available_name(self, name, max_length=None):
        """
        ファイル名を安全な形式に変換して、重複を避ける
        """
        # 絶対パスを相対パスに変換
        if os.path.isabs(name):
            name = os.path.basename(name)

        # ディレクトリ部分とファイル名部分に分割
        dir_name = os.path.dirname(name)
        base_name = os.path.basename(name)
        safe_base_name = self._get_safe_filename(base_name)
        # ディレクトリがあれば結合、なければファイル名のみ
        safe_name = (
            os.path.join(dir_name, safe_base_name) if dir_name else safe_base_name
        )

        # 元のget_available_nameメソッドを呼び出して重複チェック
        return super().get_available_name(safe_name, max_length)

    def _get_safe_filename(self, filename):
        """
        ファイル名をタイムスタンプベースの安全な形式に変換する
        """
        # 拡張子を取得
        _, ext = os.path.splitext(filename)

        # タイムスタンプベースのファイル名を生成
        timestamp = int(time.time() * 1000)  # ミリ秒単位のタイムスタンプ

        # 安全なファイル名を生成
        safe_name = f"video_{timestamp}{ext}"

        return safe_name


class SafeFileStorage(S3Boto3Storage):
    """
    安全に処理するカスタムS3ストレージ
    """

    def __init__(self, *args, **kwargs):
        # S3の設定を追加
        kwargs.update(
            {
                "bucket_name": os.environ.get("AWS_STORAGE_BUCKET_NAME"),
                "access_key": os.environ.get("AWS_ACCESS_KEY_ID"),
                "secret_key": os.environ.get("AWS_SECRET_ACCESS_KEY"),
                "location": "media/videos",  # S3内のディレクトリ
                "default_acl": "private",
                "custom_domain": False,
                "querystring_auth": True,
                "querystring_expire": 3600,
                "file_overwrite": False,  # ファイルの上書きを防ぐ
            }
        )
        super().__init__(*args, **kwargs)

    def get_available_name(self, name, max_length=None):
        """
        ファイル名を安全な形式に変換して、重複を避ける
        """
        # 絶対パスを相対パスに変換
        if os.path.isabs(name):
            name = os.path.basename(name)

        # ディレクトリ部分とファイル名部分に分割
        dir_name = os.path.dirname(name)
        base_name = os.path.basename(name)
        safe_base_name = self._get_safe_filename(base_name)
        # ディレクトリがあれば結合、なければファイル名のみ
        safe_name = (
            os.path.join(dir_name, safe_base_name) if dir_name else safe_base_name
        )

        # 元のget_available_nameメソッドを呼び出して重複チェック
        return super().get_available_name(safe_name, max_length)

    def _get_safe_filename(self, filename):
        """
        ファイル名をタイムスタンプベースの安全な形式に変換する
        """
        # 拡張子を取得
        _, ext = os.path.splitext(filename)

        # タイムスタンプベースのファイル名を生成
        timestamp = int(time.time() * 1000)  # ミリ秒単位のタイムスタンプ

        # 安全なファイル名を生成
        safe_name = f"video_{timestamp}{ext}"

        return safe_name

    def _normalize_name(self, name):
        """
        ファイル名を正規化する（S3用）
        """
        # 絶対パスを相対パスに変換
        if os.path.isabs(name):
            name = os.path.basename(name)

        # スラッシュを正規化
        name = name.replace("\\", "/")

        # 先頭のスラッシュを削除
        if name.startswith("/"):
            name = name[1:]

        return name


class VideoGroup(models.Model):
    """動画グループ（プレイリストのような概念）"""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="video_groups"
    )
    name = models.CharField(max_length=255, help_text="グループ名")
    description = models.TextField(blank=True, help_text="グループの説明")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # 共有用トークン（外部共有URL用）
    share_token = models.CharField(
        max_length=64, unique=True, null=True, blank=True, help_text="共有用トークン"
    )

    # ManyToManyFieldで動画との関連を定義
    videos = models.ManyToManyField(
        "Video", through="VideoGroupMember", related_name="video_groups_through"
    )

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.name} (by {self.user.username})"

    @property
    def video_count(self):
        """グループ内の動画数を取得"""
        return self.videos.count()

    @property
    def completed_videos(self):
        """完了した動画のみを取得"""
        return self.videos.filter(status="completed")


class VideoGroupMember(models.Model):
    """動画グループのメンバー（動画とグループの関連）"""

    group = models.ForeignKey(
        VideoGroup, on_delete=models.CASCADE, related_name="members"
    )
    video = models.ForeignKey("Video", on_delete=models.CASCADE, related_name="groups")
    added_at = models.DateTimeField(auto_now_add=True)
    order = models.IntegerField(default=0, help_text="グループ内での順序")

    class Meta:
        ordering = ["order", "added_at"]
        unique_together = ["group", "video"]  # 同じ動画を同じグループに重複追加できない

    def __str__(self):
        return f"{self.video.title} in {self.group.name}"


def user_directory_path(instance, filename):
    # 例: videos/ユーザーID/ファイル名
    return f"videos/{instance.user.id}/{filename}"


class Tag(models.Model):
    """動画に付与するタグ（ユーザー単位で管理）"""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="tags",
    )
    name = models.CharField(max_length=64)
    color = models.CharField(max_length=16, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("user", "name")
        ordering = ["name"]

    def __str__(self) -> str:
        return f"{self.name} (by {self.user.username})"


class Video(models.Model):
    STATUS_CHOICES = [
        ("pending", "処理待ち"),
        ("processing", "処理中"),
        ("completed", "完了"),
        ("error", "エラー"),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="videos"
    )
    # 違反フラグと理由を追加
    is_violation = models.BooleanField(default=False, help_text="利用規約違反フラグ")
    violation_reason = models.CharField(
        max_length=255, blank=True, help_text="違反理由"
    )
    file = models.FileField(
        upload_to=user_directory_path,
        storage=(
            SafeFileStorage()
            if os.environ.get("USE_S3", "FALSE") == "TRUE"
            else SafeLocalFileStorage()
        ),
    )
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    uploaded_at = models.DateTimeField(auto_now_add=True)
    transcript = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending")
    error_message = models.TextField(blank=True)
    tags = models.ManyToManyField("Tag", blank=True, related_name="videos")

    class Meta:
        ordering = ["-uploaded_at"]

    def __str__(self):
        return f"{self.title} (by {self.user.username})"

    def delete(self, *args, **kwargs):
        """
        動画を完全に削除する（ファイル、OpenSearchService、DB）
        """
        try:
            # S3ファイルを削除
            if self.file:
                try:
                    self.file.delete(save=False)
                except Exception as e:
                    print(f"Error deleting file: {e}")

            # ベクトル検索サービスのベクトルデータを削除
            try:
                from app.vector_search_factory import VectorSearchFactory

                search_service = VectorSearchFactory.create_search_service(
                    user_id=self.user.id
                )
                search_service.delete_video_data(self.id)
            except Exception as e:
                print(f"Error deleting vector search service vectors: {e}")

            # DBレコードを削除
            super().delete(*args, **kwargs)

        except Exception as e:
            print(f"Error in video deletion: {e}")
            # エラーが発生してもDBレコードは削除
            super().delete(*args, **kwargs)


class VideoGroupChatLog(models.Model):
    SOURCE_CHOICES = [
        ("owner", "オーナー"),
        ("share", "共有"),
    ]

    group = models.ForeignKey(
        VideoGroup, on_delete=models.CASCADE, related_name="chat_logs"
    )
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="chat_logs"
    )
    source = models.CharField(max_length=16, choices=SOURCE_CHOICES)
    session_id = models.CharField(
        max_length=64, blank=True, null=True, help_text="共有アクセスのセッションID"
    )
    question = models.TextField()
    answer = models.TextField(blank=True, default="")
    timestamp_results = models.JSONField(blank=True, null=True)
    related_questions = models.JSONField(blank=True, null=True)
    requester_ip = models.GenericIPAddressField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    approx_size = models.BigIntegerField(default=0, help_text="概算サイズ（バイト）")

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["group", "created_at"]),
            models.Index(fields=["owner", "created_at"]),
            models.Index(fields=["source", "created_at"]),
        ]

    def __str__(self):
        return f"[{self.get_source_display()}] {self.group.name}: {self.question[:20]}"
