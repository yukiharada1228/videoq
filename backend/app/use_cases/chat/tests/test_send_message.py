"""Tests for SendMessageUseCase."""

import unittest
from unittest.mock import MagicMock

from app.domain.chat.gateways import RagGateway, RagUserNotFoundError
from app.domain.chat.repositories import ChatRepository, VideoGroupQueryRepository
from app.use_cases.chat.dto import ChatMessageInput, SendMessageResultDTO
from app.use_cases.chat.exceptions import InvalidChatRequestError
from app.use_cases.chat.send_message import SendMessageUseCase
from app.use_cases.shared.exceptions import ResourceNotFound


class _StubChatRepository(ChatRepository):
    def get_logs_for_group(self, group_id: int, ascending: bool = True):
        raise NotImplementedError

    def create_log(self, user_id, group_id, question, answer, citations, is_shared):
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
    def get_with_members(self, group_id: int, user_id=None, share_token=None):
        return None


class _RagGatewayUserNotFound(RagGateway):
    def generate_reply(self, messages, user_id, video_ids=None, locale=None, api_key=None):
        raise RagUserNotFoundError(f"User not found: {user_id}")

class SendMessageUseCaseTests(unittest.TestCase):
    def setUp(self):
        self.use_case = SendMessageUseCase(
            chat_repo=_StubChatRepository(),
            group_query_repo=_StubGroupRepository(),
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
        self.assertEqual(str(cm.exception), "Group ID not specified.")

    def test_execute_maps_rag_user_not_found_to_resource_not_found(self):
        with self.assertRaises(ResourceNotFound) as cm:
            self.use_case.execute(
                user_id=123,
                messages=[ChatMessageInput(role="user", content="hello")],
            )
        self.assertEqual(str(cm.exception), "User not found.")


class _SuccessRagGateway(RagGateway):
    """RAG gateway stub that returns a fixed successful answer."""

    def generate_reply(self, messages, user_id, video_ids=None, locale=None, api_key=None):
        from app.domain.chat.gateways import RagResult
        return RagResult(content="Hello!", query_text="q", citations=[])


class SendMessageAiAnswerBillingTests(unittest.TestCase):
    """Tests for optional AI answer usage recording in SendMessageUseCase."""

    def _make_use_case(self, ai_answer_record_use_case=None):
        return SendMessageUseCase(
            chat_repo=_StubChatRepository(),
            group_query_repo=_StubGroupRepository(),
            rag_gateway=_SuccessRagGateway(),
            ai_answer_record_use_case=ai_answer_record_use_case,
        )

    def test_records_ai_answer_on_successful_reply(self):
        mock_ai_record = MagicMock()
        use_case = self._make_use_case(mock_ai_record)

        use_case.execute(
            user_id=99,
            messages=[ChatMessageInput(role="user", content="hello")],
        )

        mock_ai_record.execute.assert_called_once_with(99)

    def test_skips_ai_answer_recording_when_no_use_case_injected(self):
        use_case = self._make_use_case(ai_answer_record_use_case=None)
        # Should not raise
        use_case.execute(
            user_id=99,
            messages=[ChatMessageInput(role="user", content="hello")],
        )

    def test_does_not_fail_when_billing_record_raises(self):
        mock_ai_record = MagicMock()
        mock_ai_record.execute.side_effect = RuntimeError("billing down")
        use_case = self._make_use_case(mock_ai_record)

        # Should not raise
        result = use_case.execute(
            user_id=99,
            messages=[ChatMessageInput(role="user", content="hello")],
        )
        self.assertEqual(result.content, "Hello!")
