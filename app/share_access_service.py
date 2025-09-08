import redis
import json
import time
import uuid
from django.conf import settings
from typing import Optional, Tuple
from .models import VideoGroup


class ShareAccessService:
    """共有URLアクセス時の同時アクセス人数制限を管理するサービス"""

    def __init__(self):
        self.redis_client = redis.from_url(settings.REDIS_URL)
        self.max_concurrent_users = settings.SHARE_ACCOUNT_MAX_CONCURRENT_USERS
        self.session_timeout_minutes = settings.SHARE_SESSION_TIMEOUT_MINUTES
        self.session_timeout_seconds = self.session_timeout_minutes * 60

    def _get_account_key(self, user_id: int) -> str:
        """アカウントのRedisキーを生成"""
        return f"share_account:{user_id}:active_sessions"

    def _get_session_key(self, session_id: str) -> str:
        """セッションのRedisキーを生成（ブラウザ単位）"""
        return f"share_session:{session_id}"

    def _get_user_id_from_share_token(self, share_token: str) -> Optional[int]:
        """share_tokenからユーザーIDを取得"""
        try:
            group = VideoGroup.objects.get(share_token=share_token)
            return group.user.id
        except VideoGroup.DoesNotExist:
            return None

    def register_session(self, share_token: str) -> Tuple[bool, str, Optional[str]]:
        """
        セッションを登録し、アクセス制限をチェック

        Returns:
            Tuple[bool, str, Optional[str]]: (成功フラグ, セッションID, エラーメッセージ)
        """
        try:
            # ユーザーIDを取得
            user_id = self._get_user_id_from_share_token(share_token)
            if user_id is None:
                return False, "", "無効な共有トークンです。"

            account_key = self._get_account_key(user_id)

            # 現在のアクティブセッション数を取得
            active_sessions = self.redis_client.smembers(account_key)

            # タイムアウトしたセッションを削除（非アクティブ時間で判定）
            current_time = time.time()
            expired_sessions = []

            for session_id in active_sessions:
                session_key = self._get_session_key(session_id.decode("utf-8"))
                session_data = self.redis_client.get(session_key)

                if session_data:
                    session_info = json.loads(session_data)
                    # 最終アクティビティからの経過時間で判定
                    last_activity = session_info.get(
                        "last_activity", session_info.get("created_at", 0)
                    )
                    if current_time - last_activity > self.session_timeout_seconds:
                        expired_sessions.append(session_id)
                        self.redis_client.delete(session_key)

            # 期限切れセッションを削除
            if expired_sessions:
                self.redis_client.srem(account_key, *expired_sessions)

            # 更新されたアクティブセッション数を取得
            active_count = self.redis_client.scard(account_key)

            # 制限チェック
            if active_count >= self.max_concurrent_users:
                return (
                    False,
                    "",
                    f"このアカウントの同時アクセス上限（{self.max_concurrent_users}人）に達しました。しばらく時間をおいてから再度アクセスしてください。",
                )

            # 新しいセッションを登録
            session_id = str(uuid.uuid4())
            session_data = {
                "session_id": session_id,
                "created_at": current_time,
                "last_activity": current_time,
                "share_token": share_token,
                "user_id": user_id,
            }

            # セッション情報を保存
            session_key = self._get_session_key(session_id)
            self.redis_client.setex(
                session_key, self.session_timeout_seconds, json.dumps(session_data)
            )

            # アクティブセッションリストに追加
            self.redis_client.sadd(account_key, session_id)
            self.redis_client.expire(account_key, self.session_timeout_seconds)

            return True, session_id, None

        except Exception as e:
            return False, "", f"セッション登録中にエラーが発生しました: {str(e)}"

    def update_session_activity(self, share_token: str, session_id: str) -> bool:
        """セッションの最終アクティビティを更新"""
        try:
            session_key = self._get_session_key(session_id)
            session_data = self.redis_client.get(session_key)

            if session_data:
                session_info = json.loads(session_data)
                # 同じアカウントのセッションかチェック
                if session_info.get("user_id") == self._get_user_id_from_share_token(
                    share_token
                ):
                    session_info["last_activity"] = time.time()
                    session_info["share_token"] = share_token  # 最新のアクセス先を更新

                    self.redis_client.setex(
                        session_key,
                        self.session_timeout_seconds,
                        json.dumps(session_info),
                    )
                    return True

            return False

        except Exception:
            return False

    def remove_session(self, share_token: str, session_id: str) -> bool:
        """セッションを削除"""
        try:
            # ユーザーIDを取得
            user_id = self._get_user_id_from_share_token(share_token)
            if user_id is None:
                return False

            account_key = self._get_account_key(user_id)
            session_key = self._get_session_key(session_id)

            # セッション情報を削除
            self.redis_client.delete(session_key)

            # アクティブセッションリストから削除
            self.redis_client.srem(account_key, session_id)

            return True

        except Exception:
            return False

    def get_current_active_count(self, share_token: str) -> int:
        """現在のアクティブセッション数を取得"""
        try:
            # ユーザーIDを取得
            user_id = self._get_user_id_from_share_token(share_token)
            if user_id is None:
                return 0

            account_key = self._get_account_key(user_id)

            # 期限切れセッションをクリーンアップ
            self._cleanup_expired_sessions(share_token)

            return self.redis_client.scard(account_key)

        except Exception:
            return 0

    def _cleanup_expired_sessions(self, share_token: str) -> None:
        """期限切れセッションをクリーンアップ（非アクティブ時間で判定）"""
        try:
            # ユーザーIDを取得
            user_id = self._get_user_id_from_share_token(share_token)
            if user_id is None:
                return

            account_key = self._get_account_key(user_id)
            active_sessions = self.redis_client.smembers(account_key)

            current_time = time.time()
            expired_sessions = []

            for session_id in active_sessions:
                session_key = self._get_session_key(session_id.decode("utf-8"))
                session_data = self.redis_client.get(session_key)

                if session_data:
                    session_info = json.loads(session_data)
                    last_activity = session_info.get(
                        "last_activity", session_info.get("created_at", 0)
                    )
                    if current_time - last_activity > self.session_timeout_seconds:
                        expired_sessions.append(session_id)
                        self.redis_client.delete(session_key)

            # 期限切れセッションを削除
            if expired_sessions:
                self.redis_client.srem(account_key, *expired_sessions)

        except Exception:
            pass

    def get_max_concurrent_users(self) -> int:
        """最大同時アクセス数を取得"""
        return self.max_concurrent_users

    def get_session_timeout_minutes(self) -> int:
        """セッションタイムアウト時間（分）を取得"""
        return self.session_timeout_minutes

    def get_account_active_count(self, user_id: int) -> int:
        """指定されたアカウントの現在のアクティブセッション数を取得"""
        try:
            account_key = self._get_account_key(user_id)
            return self.redis_client.scard(account_key)
        except Exception:
            return 0
