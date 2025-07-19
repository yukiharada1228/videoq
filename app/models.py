from django.db import models
from django.contrib.auth.models import AbstractUser
from django.conf import settings
from django.core.files.storage import FileSystemStorage
from storages.backends.s3boto3 import S3Boto3Storage
import os
import time
from app.plan_constants import PLAN_INFO
from app.plan_utils import disable_user_sharing


class User(AbstractUser):
    # OpenAI APIキー（暗号化保存）
    encrypted_openai_api_key = models.TextField(
        blank=True, null=True, help_text="暗号化されたOpenAI APIキー"
    )
    # サブスクリプション状態
    is_subscribed = models.BooleanField(default=False, help_text="有料プラン契約状態")
    # Stripe顧客ID
    stripe_customer_id = models.CharField(
        max_length=255, blank=True, null=True, help_text="Stripe顧客ID"
    )
    # サブスクリプションプラン（拡張性のためchoicesで管理）
    SUBSCRIPTION_PLAN_CHOICES = [(k, v["display"]) for k, v in PLAN_INFO.items()]
    subscription_plan = models.CharField(
        choices=SUBSCRIPTION_PLAN_CHOICES,
        default="free",
        help_text="現在のサブスクリプションプラン",
        max_length=32,
    )
    ban_reason = models.CharField(max_length=255, blank=True, help_text="BAN理由")

    def __str__(self):
        return self.username

    def save(self, *args, **kwargs):
        # BANされた場合は共有を無効化
        if self.pk is not None:
            old = type(self).objects.filter(pk=self.pk).first()
            if old and old.is_active and not self.is_active:
                disable_user_sharing(self)
        super().save(*args, **kwargs)


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

    # 共有URL履歴（サブスクリプション再開時に復活用）
    previous_share_token = models.CharField(
        max_length=64,
        unique=True,
        null=True,
        blank=True,
        help_text="以前の共有用トークン（履歴）",
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

    def save_share_token_history(self):
        """現在の共有トークンを履歴として保存"""
        if self.share_token and self.share_token != self.previous_share_token:
            self.previous_share_token = self.share_token

    def restore_share_token(self):
        """履歴から共有トークンを復元"""
        if self.previous_share_token:
            self.share_token = self.previous_share_token
            return True
        return False


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


class Video(models.Model):
    STATUS_CHOICES = [
        ("pending", "処理待ち"),
        ("processing", "処理中"),
        ("completed", "完了"),
        ("error", "エラー"),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="videos")
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

    def __str__(self):
        return self.title

    def delete(self, *args, **kwargs):
        """動画の完全削除（Pinecone + S3 + DB）"""
        import logging

        # OpenSearch側のベクトルデータも削除
        try:
            from app.opensearch_service import OpenSearchService

            # APIキーがある場合は復号化して使用、ない場合はNoneを渡す
            if self.user and self.user.encrypted_openai_api_key:
                from app.crypto_utils import decrypt_api_key

                api_key = decrypt_api_key(self.user.encrypted_openai_api_key)
            else:
                api_key = None

            if self.user:
                opensearch_service = OpenSearchService(
                    openai_api_key=api_key, user_id=self.user.id, ensure_indexes=False
                )
                opensearch_service.delete_video_data(self.id)
                logging.info(
                    f"User {self.user.id}: Deleted OpenSearch data for video {self.id}"
                )
        except Exception as e:
            # OpenSearch削除失敗は握りつぶす（ログのみ）
            logging.warning(
                f"User {self.user.id if self.user else 'Unknown'}: Failed to delete OpenSearch data for video {self.id}: {e}"
            )

        # S3ファイルを削除
        if self.file:
            try:
                self.file.delete(save=False)
                logging.info(
                    f"User {self.user.id if self.user else 'Unknown'}: Deleted S3 file for video {self.id}"
                )
            except Exception as e:
                logging.warning(
                    f"User {self.user.id if self.user else 'Unknown'}: Failed to delete S3 file for video {self.id}: {e}"
                )

        # データベースレコードを削除
        super().delete(*args, **kwargs)


class StripeWebhookEvent(models.Model):
    """Stripe Webhookイベントの冪等性を確保するためのモデル"""

    event_id = models.CharField(
        max_length=255, unique=True, help_text="StripeイベントID"
    )
    event_type = models.CharField(max_length=100, help_text="イベントタイプ")
    processed = models.BooleanField(default=False, help_text="処理済みフラグ")
    processed_at = models.DateTimeField(null=True, blank=True, help_text="処理日時")
    created_at = models.DateTimeField(auto_now_add=True, help_text="作成日時")
    error_message = models.TextField(
        blank=True, null=True, help_text="エラーメッセージ"
    )
    retry_count = models.IntegerField(default=0, help_text="再試行回数")

    class Meta:
        db_table = "stripe_webhook_events"
        indexes = [
            models.Index(fields=["event_id"]),
            models.Index(fields=["event_type"]),
            models.Index(fields=["processed"]),
            models.Index(fields=["created_at"]),
        ]

    def __str__(self):
        return f"{self.event_type} - {self.event_id}"

    def mark_processed(self):
        """イベントを処理済みとしてマーク"""
        from django.utils import timezone

        self.processed = True
        self.processed_at = timezone.now()
        self.save()

    def mark_failed(self, error_message):
        """イベントを失敗としてマーク"""
        self.error_message = error_message
        self.retry_count += 1
        self.save()


class SubscriptionChangeLog(models.Model):
    """サブスクリプション変更の履歴を記録するモデル"""

    user = models.ForeignKey(User, on_delete=models.CASCADE, help_text="ユーザー")
    old_plan = models.CharField(
        max_length=32, choices=User.SUBSCRIPTION_PLAN_CHOICES, help_text="変更前プラン"
    )
    new_plan = models.CharField(
        max_length=32, choices=User.SUBSCRIPTION_PLAN_CHOICES, help_text="変更後プラン"
    )
    old_subscribed = models.BooleanField(help_text="変更前の購読状態")
    new_subscribed = models.BooleanField(help_text="変更後の購読状態")
    stripe_event_id = models.CharField(
        max_length=255, blank=True, null=True, help_text="StripeイベントID"
    )
    stripe_subscription_id = models.CharField(
        max_length=255, blank=True, null=True, help_text="StripeサブスクリプションID"
    )
    change_reason = models.CharField(max_length=100, help_text="変更理由")
    created_at = models.DateTimeField(auto_now_add=True, help_text="変更日時")

    class Meta:
        db_table = "subscription_change_logs"
        indexes = [
            models.Index(fields=["user", "created_at"]),
            models.Index(fields=["stripe_event_id"]),
            models.Index(fields=["created_at"]),
        ]

    def __str__(self):
        return f"{self.user.username} - {self.old_plan} -> {self.new_plan} ({self.change_reason})"
