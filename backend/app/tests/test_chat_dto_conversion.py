"""Tests for chat DTO conversion and SendMessageUseCase boundary enforcement."""

import unittest
from unittest.mock import MagicMock

from app.domain.chat.dtos import ChatMessageDTO, RelatedVideoDTO
from app.domain.chat.gateways import RagResult
from app.use_cases.chat.send_message import SendMessageUseCase
from app.use_cases.shared.exceptions import PermissionDenied


class ChatDTOTests(unittest.TestCase):
    def test_chat_message_dict_to_dto(self):
        raw = {"role": "user", "content": "hello"}
        dto = ChatMessageDTO.from_dict(raw)
        self.assertEqual(dto.role, "user")
        self.assertEqual(dto.content, "hello")
        self.assertEqual(dto.to_dict(), raw)

    def test_related_video_dict_to_dto(self):
        raw = {
            "video_id": 10,
            "title": "Intro",
            "start_time": "00:00:05",
            "end_time": "00:00:15",
        }
        dto = RelatedVideoDTO.from_dict(raw)
        self.assertEqual(dto.video_id, 10)
        self.assertEqual(dto.title, "Intro")
        self.assertEqual(dto.start_time, "00:00:05")
        self.assertEqual(dto.end_time, "00:00:15")
        self.assertEqual(dto.to_dict(), raw)

    def test_related_video_to_dict_roundtrip(self):
        dto = RelatedVideoDTO(
            video_id=42, title="Clip", start_time="00:01:00", end_time="00:01:20"
        )
        self.assertEqual(
            dto.to_dict(),
            {"video_id": 42, "title": "Clip", "start_time": "00:01:00", "end_time": "00:01:20"},
        )


class SendMessageUseCaseBoundaryTests(unittest.TestCase):
    """Verify that SendMessageUseCase handles DTO boundaries correctly."""

    def _make_use_case(self, rag_result=None):
        chat_repo = MagicMock()
        group_query_repo = MagicMock()
        group_query_repo.get_with_members.return_value = None  # no group by default
        rag_gateway = MagicMock()
        if rag_result is not None:
            rag_gateway.generate_reply.return_value = rag_result
        use_case = SendMessageUseCase(
            chat_repo=chat_repo,
            group_query_repo=group_query_repo,
            rag_gateway=rag_gateway,
        )
        return use_case, chat_repo, group_query_repo, rag_gateway

    def test_execute_passes_dto_messages_to_gateway(self):
        """UseCase must pass ChatMessageDTO list to rag_gateway, not raw dicts."""
        rag_result = RagResult(content="reply", query_text="q", related_videos=None)
        use_case, _, _, rag_gateway = self._make_use_case(rag_result)

        message_dtos = [ChatMessageDTO(role="user", content="hello")]
        use_case.execute(user_id=1, messages=message_dtos)

        call_args = rag_gateway.generate_reply.call_args
        passed_messages = call_args[1]["messages"]
        self.assertTrue(
            all(isinstance(m, ChatMessageDTO) for m in passed_messages),
            "rag_gateway must receive ChatMessageDTO instances, not dicts",
        )

    def test_result_related_videos_are_dtos(self):
        """SendMessageResult.related_videos must contain RelatedVideoDTO instances."""
        related = [RelatedVideoDTO(video_id=1, title="T", start_time="0", end_time="1")]
        rag_result = RagResult(content="reply", query_text="q", related_videos=related)
        use_case, chat_repo, group_query_repo, _ = self._make_use_case(rag_result)

        group = MagicMock()
        group.id = 10
        group.user_id = 1
        group.member_video_ids = [1]
        group_query_repo.get_with_members.return_value = group
        chat_repo.create_log.return_value = MagicMock(id=99, feedback=None)

        message_dtos = [ChatMessageDTO(role="user", content="hello")]
        result = use_case.execute(user_id=1, messages=message_dtos, group_id=10)

        self.assertIsNotNone(result.related_videos)
        self.assertTrue(
            all(isinstance(v, RelatedVideoDTO) for v in result.related_videos),
            "SendMessageResult.related_videos must contain RelatedVideoDTO instances",
        )

    def test_create_log_receives_dto_sequence(self):
        """ChatRepository.create_log must be called with RelatedVideoDTO sequence, not dicts."""
        related = [RelatedVideoDTO(video_id=2, title="V", start_time=None, end_time=None)]
        rag_result = RagResult(content="reply", query_text="q", related_videos=related)
        use_case, chat_repo, group_query_repo, _ = self._make_use_case(rag_result)

        group = MagicMock()
        group.id = 5
        group.user_id = 1
        group.member_video_ids = [2]
        group_query_repo.get_with_members.return_value = group
        chat_repo.create_log.return_value = MagicMock(id=1, feedback=None)

        use_case.execute(user_id=1, messages=[ChatMessageDTO(role="user", content="q")], group_id=5)

        call_kwargs = chat_repo.create_log.call_args[1]
        passed_videos = call_kwargs["related_videos"]
        self.assertTrue(
            all(isinstance(v, RelatedVideoDTO) for v in passed_videos),
            "create_log must receive RelatedVideoDTO instances; dict conversion belongs in infrastructure",
        )


class SendMessageNullabilityTests(unittest.TestCase):
    """Verify user_id nullability contract in SendMessageUseCase."""

    def _make_use_case(self):
        chat_repo = MagicMock()
        group_query_repo = MagicMock()
        group_query_repo.get_with_members.return_value = None
        rag_gateway = MagicMock()
        return SendMessageUseCase(
            chat_repo=chat_repo,
            group_query_repo=group_query_repo,
            rag_gateway=rag_gateway,
        ), rag_gateway

    def test_raises_permission_denied_when_user_id_is_none(self):
        """PermissionDenied must be raised if owner_user_id cannot be resolved."""
        use_case, rag_gateway = self._make_use_case()

        with self.assertRaises(PermissionDenied):
            use_case.execute(
                user_id=None,
                messages=[ChatMessageDTO(role="user", content="hello")],
            )

        rag_gateway.generate_reply.assert_not_called()

    def test_rag_gateway_not_called_when_owner_is_none(self):
        """Ensure None never reaches the RAG gateway."""
        use_case, rag_gateway = self._make_use_case()

        try:
            use_case.execute(user_id=None, messages=[ChatMessageDTO(role="user", content="x")])
        except PermissionDenied:
            pass

        rag_gateway.generate_reply.assert_not_called()


if __name__ == "__main__":
    unittest.main()
