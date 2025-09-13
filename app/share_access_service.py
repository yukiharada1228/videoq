import json
import time
import uuid
from typing import Optional, Tuple

import redis
from django.conf import settings

from .models import VideoGroup


class ShareAccessService:
    """Service to manage concurrent access limits for shared URLs"""

    def __init__(self):
        self.redis_client = redis.from_url(settings.REDIS_URL)
        self.max_concurrent_users = settings.SHARE_ACCOUNT_MAX_CONCURRENT_USERS
        self.session_timeout_minutes = settings.SHARE_SESSION_TIMEOUT_MINUTES
        self.session_timeout_seconds = self.session_timeout_minutes * 60

    def _get_account_key(self, user_id: int) -> str:
        """Generate Redis key for account"""
        return f"share_account:{user_id}:active_sessions"

    def _get_session_key(self, session_id: str) -> str:
        """Generate Redis key for session (per browser)"""
        return f"share_session:{session_id}"

    def _get_user_id_from_share_token(self, share_token: str) -> Optional[int]:
        """Get user ID from share_token"""
        try:
            group = VideoGroup.objects.get(share_token=share_token)
            return group.user.id
        except VideoGroup.DoesNotExist:
            return None

    def register_session(self, share_token: str) -> Tuple[bool, str, Optional[str]]:
        """
        Register session and check access limits

        Returns:
            Tuple[bool, str, Optional[str]]: (success flag, session ID, error message)
        """
        try:
            # Get user ID
            user_id = self._get_user_id_from_share_token(share_token)
            if user_id is None:
                return False, "", "Invalid share token."

            account_key = self._get_account_key(user_id)

            # Get current active session count
            active_sessions = self.redis_client.smembers(account_key)

            # Remove timed out sessions (judged by inactive time)
            current_time = time.time()
            expired_sessions = []

            for session_id in active_sessions:
                session_key = self._get_session_key(session_id.decode("utf-8"))
                session_data = self.redis_client.get(session_key)

                if session_data:
                    session_info = json.loads(session_data)
                    # Judge by elapsed time from last activity
                    last_activity = session_info.get(
                        "last_activity", session_info.get("created_at", 0)
                    )
                    if current_time - last_activity > self.session_timeout_seconds:
                        expired_sessions.append(session_id)
                        self.redis_client.delete(session_key)

            # Delete expired sessions
            if expired_sessions:
                self.redis_client.srem(account_key, *expired_sessions)

            # Get updated active session count
            active_count = self.redis_client.scard(account_key)

            # Check limits
            if active_count >= self.max_concurrent_users:
                return (
                    False,
                    "",
                    f"Maximum concurrent access limit for this account ({self.max_concurrent_users} users) has been reached. Please try again after a while.",
                )

            # Register new session
            session_id = str(uuid.uuid4())
            session_data = {
                "session_id": session_id,
                "created_at": current_time,
                "last_activity": current_time,
                "share_token": share_token,
                "user_id": user_id,
            }

            # Save session information
            session_key = self._get_session_key(session_id)
            self.redis_client.setex(
                session_key, self.session_timeout_seconds, json.dumps(session_data)
            )

            # Add to active session list
            self.redis_client.sadd(account_key, session_id)
            self.redis_client.expire(account_key, self.session_timeout_seconds)

            return True, session_id, None

        except Exception as e:
            return False, "", f"Error occurred during session registration: {str(e)}"

    def update_session_activity(self, share_token: str, session_id: str) -> bool:
        """Update session last activity"""
        try:
            session_key = self._get_session_key(session_id)
            session_data = self.redis_client.get(session_key)

            if session_data:
                session_info = json.loads(session_data)
                # Check if it's a session for the same account
                if session_info.get("user_id") == self._get_user_id_from_share_token(
                    share_token
                ):
                    session_info["last_activity"] = time.time()
                    session_info["share_token"] = (
                        share_token  # Update latest access destination
                    )

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
        """Remove session"""
        try:
            # Get user ID
            user_id = self._get_user_id_from_share_token(share_token)
            if user_id is None:
                return False

            account_key = self._get_account_key(user_id)
            session_key = self._get_session_key(session_id)

            # Delete session information
            self.redis_client.delete(session_key)

            # Remove from active session list
            self.redis_client.srem(account_key, session_id)

            return True

        except Exception:
            return False

    def get_current_active_count(self, share_token: str) -> int:
        """Get current active session count"""
        try:
            # Get user ID
            user_id = self._get_user_id_from_share_token(share_token)
            if user_id is None:
                return 0

            account_key = self._get_account_key(user_id)

            # Cleanup expired sessions
            self._cleanup_expired_sessions(share_token)

            return self.redis_client.scard(account_key)

        except Exception:
            return 0

    def _cleanup_expired_sessions(self, share_token: str) -> None:
        """Cleanup expired sessions (judged by inactive time)"""
        try:
            # Get user ID
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

            # Delete expired sessions
            if expired_sessions:
                self.redis_client.srem(account_key, *expired_sessions)

        except Exception:
            pass

    def get_max_concurrent_users(self) -> int:
        """Get maximum concurrent access count"""
        return self.max_concurrent_users

    def get_session_timeout_minutes(self) -> int:
        """Get session timeout time (minutes)"""
        return self.session_timeout_minutes

    def get_account_active_count(self, user_id: int) -> int:
        """Get current active session count for specified account"""
        try:
            account_key = self._get_account_key(user_id)
            return self.redis_client.scard(account_key)
        except Exception:
            return 0
