"""Tests for SendMessageUseCase."""

import unittest

from app.domain.chat.gateways import RagGateway, RagUserNotFoundError
from app.domain.chat.repositories import ChatRepository, VideoGroupQueryRepository
from app.use_cases.chat.dto import ChatMessageInput
from app.use_cases.chat.exceptions import InvalidChatRequestError
from app.use_cases.chat.send_message import SendMessageUseCase
from app.use_cases.shared.exceptions import ResourceNotFound


class _StubChatRepository(ChatRepository):
    def get_logs_for_group(self, group_id: int, ascending: bool = True):
        raise NotImplementedError

    def create_log(self, user_id, group_id, question, answer, related_videos, is_shared):
        raise NotImplementedError

    def get_log_by_id(self, log_id: int):
        raise NotImplementedError

    def update_feedback(self, log, feedback):
        raise NotImplementedError

    def get_logs_values_for_group(self, group_id: int):
        raise NotImplementedError

    def get_analytics_raw(self, group_id: int):
        raise NotImplementedError


class _StubGroupRepository(VideoGroupQueryRepository):
    def __init__(self):
        self.last_call = None

    def get_with_members(self, group_id: int, user_id=None, share_token=None):
        self.last_call = {
            "group_id": group_id,
            "user_id": user_id,
            "share_token": share_token,
        }
        return None


class _RagGatewayUserNotFound(RagGateway):
    def generate_reply(self, messages, user_id, video_ids=None, locale=None):
        raise RagUserNotFoundError(f"User not found: {user_id}")


class SendMessageUseCaseTests(unittest.TestCase):
    def setUp(self):
        self.group_repo = _StubGroupRepository()
        self.use_case = SendMessageUseCase(
            chat_repo=_StubChatRepository(),
            group_query_repo=self.group_repo,
            rag_gateway=_RagGatewayUserNotFound(),
        )

    def test_execute_raises_when_messages_empty(self):
        with self.assertRaises(InvalidChatRequestError) as cm:
            self.use_case.execute(user_id=123, messages=[])
        self.assertEqual(str(cm.exception), "Messages are empty.")

    def test_execute_raises_when_shared_request_missing_group_id(self):
        with self.assertRaises(InvalidChatRequestError) as cm:
            self.use_case.execute(
                user_id=None,
                messages=[ChatMessageInput(role="user", content="hello")],
                group_id=None,
                share_token="token",
                is_shared=True,
            )
        self.assertEqual(str(cm.exception), "Chat group context ID not specified.")

    def test_execute_maps_rag_user_not_found_to_resource_not_found(self):
        with self.assertRaises(ResourceNotFound) as cm:
            self.use_case.execute(
                user_id=123,
                messages=[ChatMessageInput(role="user", content="hello")],
            )
        self.assertEqual(str(cm.exception), "Owner user not found.")

    def test_execute_uses_share_token_lookup_for_shared_group_access(self):
        with self.assertRaises(ResourceNotFound) as cm:
            self.use_case.execute(
                user_id=None,
                messages=[ChatMessageInput(role="user", content="hello")],
                group_id=10,
                share_token="share-abc",
                is_shared=True,
            )
        self.assertEqual(str(cm.exception), "Chat group context not found.")
        self.assertEqual(
            self.group_repo.last_call,
            {"group_id": 10, "user_id": None, "share_token": "share-abc"},
        )

    def test_execute_uses_user_lookup_for_authenticated_group_access(self):
        with self.assertRaises(ResourceNotFound) as cm:
            self.use_case.execute(
                user_id=123,
                messages=[ChatMessageInput(role="user", content="hello")],
                group_id=20,
                is_shared=False,
            )
        self.assertEqual(str(cm.exception), "Chat group context not found.")
        self.assertEqual(
            self.group_repo.last_call,
            {"group_id": 20, "user_id": 123, "share_token": None},
        )
