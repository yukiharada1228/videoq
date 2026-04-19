"""Tests for SendMessageUseCase.stream_execute() (streaming path)."""

import unittest
from unittest.mock import MagicMock

from app.domain.chat.gateways import LLMProviderError as DomainLLMProviderError
from app.domain.chat.gateways import RagGateway, RagStreamChunk, RagUserNotFoundError
from app.domain.chat.repositories import ChatRepository, VideoGroupQueryRepository
from app.use_cases.chat.dto import ChatMessageInput, StreamContentChunk, StreamDoneEvent
from app.use_cases.chat.exceptions import InvalidChatRequestError, LLMProviderError
from app.use_cases.chat.send_message import SendMessageUseCase
from app.use_cases.shared.exceptions import ResourceNotFound


class _StubChatRepository(ChatRepository):
    def get_logs_for_group(self, group_id, ascending=True):
        raise NotImplementedError

    def create_log(self, user_id, group_id, question, answer, citations, is_shared):
        raise NotImplementedError

    def get_log_by_id(self, log_id):
        raise NotImplementedError

    def update_feedback(self, log, feedback):
        raise NotImplementedError

    def get_logs_values_for_group(self, group_id):
        raise NotImplementedError

    def get_analytics_raw(self, group_id):
        raise NotImplementedError


class _StubGroupRepository(VideoGroupQueryRepository):
    def get_with_members(self, group_id, user_id=None, share_token=None):
        return None


class _StreamingRagGateway(RagGateway):
    """Stub gateway that streams two content chunks then a final chunk."""

    def __init__(self, chunks=None, citations=None):
        self._chunks = chunks or ["Hello ", "World"]
        self._citations = citations

    def generate_reply(self, messages, user_id, video_ids=None, locale=None, api_key=None, group_context=None):
        raise NotImplementedError

    def stream_reply(self, messages, user_id, video_ids=None, locale=None, api_key=None, group_context=None):
        for text in self._chunks:
            yield RagStreamChunk(text=text)
        yield RagStreamChunk(is_final=True, citations=self._citations, query_text="Test query")


class _ErrorStreamingRagGateway(RagGateway):
    """Stub gateway that raises LLMProviderError mid-stream."""

    def generate_reply(self, messages, user_id, video_ids=None, locale=None, api_key=None, group_context=None):
        raise NotImplementedError

    def stream_reply(self, messages, user_id, video_ids=None, locale=None, api_key=None, group_context=None):
        yield RagStreamChunk(text="partial ")
        raise DomainLLMProviderError("LLM exploded")


class _UserNotFoundRagGateway(RagGateway):
    def generate_reply(self, messages, user_id, video_ids=None, locale=None, api_key=None, group_context=None):
        raise NotImplementedError

    def stream_reply(self, messages, user_id, video_ids=None, locale=None, api_key=None, group_context=None):
        raise RagUserNotFoundError(f"User not found: {user_id}")
        # Need at least one yield to make this a generator
        yield  # pragma: no cover


def _make_use_case(gateway=None, chat_repo=None, **kwargs):
    return SendMessageUseCase(
        chat_repo=chat_repo or _StubChatRepository(),
        group_query_repo=_StubGroupRepository(),
        rag_gateway=gateway or _StreamingRagGateway(),
        **kwargs,
    )


class StreamExecuteContentTests(unittest.TestCase):
    """Tests for the content streaming path of stream_execute()."""

    def test_yields_content_chunks(self):
        use_case = _make_use_case()
        events = list(use_case.stream_execute(
            user_id=99,
            messages=[ChatMessageInput(role="user", content="hello")],
        ))
        content_events = [e for e in events if isinstance(e, StreamContentChunk)]
        self.assertEqual(len(content_events), 2)
        self.assertEqual(content_events[0].text, "Hello ")
        self.assertEqual(content_events[1].text, "World")

    def test_yields_done_event_at_end(self):
        use_case = _make_use_case()
        events = list(use_case.stream_execute(
            user_id=99,
            messages=[ChatMessageInput(role="user", content="hello")],
        ))
        done_events = [e for e in events if isinstance(e, StreamDoneEvent)]
        self.assertEqual(len(done_events), 1)
        done = done_events[0]
        self.assertEqual(done.content, "Hello World")
        self.assertIsNone(done.chat_log_id)
        self.assertIsNone(done.feedback)

    def test_done_event_is_last(self):
        use_case = _make_use_case()
        events = list(use_case.stream_execute(
            user_id=99,
            messages=[ChatMessageInput(role="user", content="hello")],
        ))
        self.assertIsInstance(events[-1], StreamDoneEvent)


class StreamExecuteValidationTests(unittest.TestCase):
    """Tests that stream_execute() validates input the same as execute()."""

    def test_raises_on_empty_messages(self):
        use_case = _make_use_case()
        with self.assertRaises(InvalidChatRequestError) as cm:
            list(use_case.stream_execute(user_id=99, messages=[]))
        self.assertEqual(str(cm.exception), "Messages are empty.")

    def test_raises_on_shared_request_missing_group_id(self):
        use_case = _make_use_case()
        with self.assertRaises(InvalidChatRequestError) as cm:
            list(use_case.stream_execute(
                user_id=None,
                messages=[ChatMessageInput(role="user", content="hello")],
                group_id=None,
                share_token="token",
                is_shared=True,
            ))
        self.assertEqual(str(cm.exception), "Group ID not specified.")

    def test_raises_on_user_not_found(self):
        use_case = _make_use_case(gateway=_UserNotFoundRagGateway())
        with self.assertRaises(ResourceNotFound) as cm:
            list(use_case.stream_execute(
                user_id=123,
                messages=[ChatMessageInput(role="user", content="hello")],
            ))
        self.assertEqual(str(cm.exception), "User not found.")

    def test_raises_llm_provider_error_mid_stream(self):
        use_case = _make_use_case(gateway=_ErrorStreamingRagGateway())
        with self.assertRaises(LLMProviderError):
            list(use_case.stream_execute(
                user_id=99,
                messages=[ChatMessageInput(role="user", content="hello")],
            ))


class StreamExecuteBillingTests(unittest.TestCase):
    """Tests billing integration for stream_execute()."""

    def test_checks_ai_answer_limit_before_streaming(self):
        mock_ai_check = MagicMock()
        use_case = _make_use_case(ai_answer_limit_check_use_case=mock_ai_check)

        list(use_case.stream_execute(
            user_id=99,
            messages=[ChatMessageInput(role="user", content="hello")],
        ))

        mock_ai_check.execute.assert_called_once_with(99)

    def test_records_ai_answer_after_streaming(self):
        mock_ai_record = MagicMock()
        use_case = _make_use_case(ai_answer_record_use_case=mock_ai_record)

        list(use_case.stream_execute(
            user_id=99,
            messages=[ChatMessageInput(role="user", content="hello")],
        ))

        mock_ai_record.execute.assert_called_once_with(99)

    def test_does_not_fail_when_billing_record_raises(self):
        mock_ai_record = MagicMock()
        mock_ai_record.execute.side_effect = RuntimeError("billing down")
        use_case = _make_use_case(ai_answer_record_use_case=mock_ai_record)

        # Should not raise
        events = list(use_case.stream_execute(
            user_id=99,
            messages=[ChatMessageInput(role="user", content="hello")],
        ))
        self.assertIsInstance(events[-1], StreamDoneEvent)
