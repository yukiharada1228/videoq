import redis
import json
import time
import uuid
from django.conf import settings
from typing import Optional, Tuple


class ShareAccessService:
    """共有URLアクセス時の同時アクセス人数制限を管理するサービス"""
    
    def __init__(self):
        self.redis_client = redis.from_url(settings.REDIS_URL)
        self.max_concurrent_users = settings.SHARE_GROUP_MAX_CONCURRENT_USERS
        self.session_timeout_minutes = settings.SHARE_SESSION_TIMEOUT_MINUTES
        self.session_timeout_seconds = self.session_timeout_minutes * 60
    
    def _get_group_key(self, share_token: str) -> str:
        """グループのRedisキーを生成"""
        return f"share_group:{share_token}:active_sessions"
    
    def _get_session_key(self, share_token: str, session_id: str) -> str:
        """セッションのRedisキーを生成"""
        return f"share_session:{share_token}:{session_id}"
    
    def register_session(self, share_token: str) -> Tuple[bool, str, Optional[str]]:
        """
        セッションを登録し、アクセス制限をチェック
        
        Returns:
            Tuple[bool, str, Optional[str]]: (成功フラグ, セッションID, エラーメッセージ)
        """
        try:
            group_key = self._get_group_key(share_token)
            
            # 現在のアクティブセッション数を取得
            active_sessions = self.redis_client.smembers(group_key)
            
            # タイムアウトしたセッションを削除
            current_time = time.time()
            expired_sessions = []
            
            for session_id in active_sessions:
                session_key = self._get_session_key(share_token, session_id.decode('utf-8'))
                session_data = self.redis_client.get(session_key)
                
                if session_data:
                    session_info = json.loads(session_data)
                    if current_time - session_info['created_at'] > self.session_timeout_seconds:
                        expired_sessions.append(session_id)
                        self.redis_client.delete(session_key)
            
            # 期限切れセッションを削除
            if expired_sessions:
                self.redis_client.srem(group_key, *expired_sessions)
            
            # 更新されたアクティブセッション数を取得
            active_count = self.redis_client.scard(group_key)
            
            # 制限チェック
            if active_count >= self.max_concurrent_users:
                return False, "", f"同時アクセス上限（{self.max_concurrent_users}人）に達しました。しばらく時間をおいてから再度アクセスしてください。"
            
            # 新しいセッションを登録
            session_id = str(uuid.uuid4())
            session_data = {
                'session_id': session_id,
                'created_at': current_time,
                'last_activity': current_time
            }
            
            # セッション情報を保存
            session_key = self._get_session_key(share_token, session_id)
            self.redis_client.setex(
                session_key, 
                self.session_timeout_seconds, 
                json.dumps(session_data)
            )
            
            # アクティブセッションリストに追加
            self.redis_client.sadd(group_key, session_id)
            self.redis_client.expire(group_key, self.session_timeout_seconds)
            
            return True, session_id, None
            
        except Exception as e:
            return False, "", f"セッション登録中にエラーが発生しました: {str(e)}"
    
    def update_session_activity(self, share_token: str, session_id: str) -> bool:
        """セッションの最終アクティビティを更新"""
        try:
            session_key = self._get_session_key(share_token, session_id)
            session_data = self.redis_client.get(session_key)
            
            if session_data:
                session_info = json.loads(session_data)
                session_info['last_activity'] = time.time()
                
                self.redis_client.setex(
                    session_key,
                    self.session_timeout_seconds,
                    json.dumps(session_info)
                )
                return True
            
            return False
            
        except Exception:
            return False
    
    def remove_session(self, share_token: str, session_id: str) -> bool:
        """セッションを削除"""
        try:
            group_key = self._get_group_key(share_token)
            session_key = self._get_session_key(share_token, session_id)
            
            # セッション情報を削除
            self.redis_client.delete(session_key)
            
            # アクティブセッションリストから削除
            self.redis_client.srem(group_key, session_id)
            
            return True
            
        except Exception:
            return False
    
    def get_current_active_count(self, share_token: str) -> int:
        """現在のアクティブセッション数を取得"""
        try:
            group_key = self._get_group_key(share_token)
            
            # 期限切れセッションをクリーンアップ
            self._cleanup_expired_sessions(share_token)
            
            return self.redis_client.scard(group_key)
            
        except Exception:
            return 0
    
    def _cleanup_expired_sessions(self, share_token: str) -> None:
        """期限切れセッションをクリーンアップ"""
        try:
            group_key = self._get_group_key(share_token)
            active_sessions = self.redis_client.smembers(group_key)
            
            current_time = time.time()
            expired_sessions = []
            
            for session_id in active_sessions:
                session_key = self._get_session_key(share_token, session_id.decode('utf-8'))
                session_data = self.redis_client.get(session_key)
                
                if session_data:
                    session_info = json.loads(session_data)
                    if current_time - session_info['created_at'] > self.session_timeout_seconds:
                        expired_sessions.append(session_id)
                        self.redis_client.delete(session_key)
            
            # 期限切れセッションを削除
            if expired_sessions:
                self.redis_client.srem(group_key, *expired_sessions)
                
        except Exception:
            pass
    
    def get_max_concurrent_users(self) -> int:
        """最大同時アクセス数を取得"""
        return self.max_concurrent_users
    
    def get_session_timeout_minutes(self) -> int:
        """セッションタイムアウト時間（分）を取得"""
        return self.session_timeout_minutes 