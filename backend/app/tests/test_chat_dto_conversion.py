"""Tests for chat DTO conversion and SendMessageUseCase boundary enforcement."""

import unittest
from unittest.mock import MagicMock

from app.domain.chat.dtos import ChatMessageDTO, CitationDTO
from app.domain.chat.gateways import RagResult
from app.use_cases.chat.dto import ChatMessageInput, CitationResponseDTO
from app.use_cases.chat.send_message import SendMessageUseCase
from app.use_cases.shared.exceptions import PermissionDenied


class ChatDTOTests(unittest.TestCase):
    def test_chat_message_input_fields(self):
        inp = ChatMessageInput(role="user", content="hello")
        self.assertEqual(inp.role, "user")
        self.assertEqual(inp.content, "hello")

    def test_citation_dto_fields(self):
        dto = CitationDTO(
            video_id=42, title="Clip", start_time="00:01:00", end_time="00:01:20"
        )
        self.assertEqual(dto.video_id, 42)
        self.assertEqual(dto.title, "Clip")
        self.assertEqual(dto.start_time, "00:01:00")
        self.assertEqual(dto.end_time, "00:01:20")


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

    def test_execute_converts_input_to_domain_dto_for_gateway(self):
        """UseCase must convert ChatMessageInput to ChatMessageDTO before calling rag_gateway."""
        rag_result = RagResult(content="reply", query_text="q", citations=None)
        use_case, _, _, rag_gateway = self._make_use_case(rag_result)

        message_inputs = [ChatMessageInput(role="user", content="hello")]
        use_case.execute(user_id=1, messages=message_inputs)

        call_args = rag_gateway.generate_reply.call_args
        passed_messages = call_args[1]["messages"]
        self.assertTrue(
            all(isinstance(m, ChatMessageDTO) for m in passed_messages),
            "rag_gateway must receive ChatMessageDTO instances converted from ChatMessageInput",
        )

    def test_result_citations_are_use_case_dtos(self):
        """SendMessageResultDTO.citations must contain CitationResponseDTO instances."""
        citations = [CitationDTO(video_id=1, title="T", start_time="0", end_time="1")]
        rag_result = RagResult(content="reply", query_text="q", citations=citations)
        use_case, chat_repo, group_query_repo, _ = self._make_use_case(rag_result)

        group = MagicMock()
        group.id = 10
        group.user_id = 1
        group.member_video_ids = [1]
        group_query_repo.get_with_members.return_value = group
        chat_repo.create_log.return_value = MagicMock(id=99, feedback=None)

        message_inputs = [ChatMessageInput(role="user", content="hello")]
        result = use_case.execute(user_id=1, messages=message_inputs, group_id=10)

        self.assertIsNotNone(result.citations)
        self.assertTrue(
            all(isinstance(v, CitationResponseDTO) for v in result.citations),
            "SendMessageResultDTO.citations must contain CitationResponseDTO instances",
        )

    def test_create_log_receives_dto_sequence(self):
        """ChatRepository.create_log must be called with CitationDTO sequence, not dicts."""
        citations = [CitationDTO(video_id=2, title="V", start_time=None, end_time=None)]
        rag_result = RagResult(content="reply", query_text="q", citations=citations)
        use_case, chat_repo, group_query_repo, _ = self._make_use_case(rag_result)

        group = MagicMock()
        group.id = 5
        group.user_id = 1
        group.member_video_ids = [2]
        group_query_repo.get_with_members.return_value = group
        chat_repo.create_log.return_value = MagicMock(id=1, feedback=None)

        use_case.execute(user_id=1, messages=[ChatMessageInput(role="user", content="q")], group_id=5)

        call_kwargs = chat_repo.create_log.call_args[1]
        passed_citations = call_kwargs["citations"]
        self.assertTrue(
            all(isinstance(v, CitationDTO) for v in passed_citations),
            "create_log must receive CitationDTO instances; dict conversion belongs in infrastructure",
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
                messages=[ChatMessageInput(role="user", content="hello")],
            )

        rag_gateway.generate_reply.assert_not_called()

    def test_rag_gateway_not_called_when_owner_is_none(self):
        """Ensure None never reaches the RAG gateway."""
        use_case, rag_gateway = self._make_use_case()

        try:
            use_case.execute(user_id=None, messages=[ChatMessageInput(role="user", content="x")])
        except PermissionDenied:
            pass

        rag_gateway.generate_reply.assert_not_called()


class GetChatHistoryUseCaseContractTests(unittest.TestCase):
    """Verify that GetChatHistoryUseCase raises ResourceNotFound when the group is missing."""

    def _make_use_case(self, group=None):
        from app.use_cases.chat.get_history import GetChatHistoryUseCase

        chat_repo = MagicMock()
        group_query_repo = MagicMock()
        group_query_repo.get_with_members.return_value = group
        return GetChatHistoryUseCase(chat_repo=chat_repo, group_query_repo=group_query_repo), chat_repo

    def test_raises_resource_not_found_when_group_missing(self):
        from app.use_cases.shared.exceptions import ResourceNotFound

        use_case, _ = self._make_use_case(group=None)
        with self.assertRaises(ResourceNotFound):
            use_case.execute(group_id=99, user_id=1)

    def test_returns_logs_when_group_exists(self):
        from app.use_cases.chat.dto import ChatLogResponseDTO

        group = MagicMock()
        group.id = 7
        use_case, chat_repo = self._make_use_case(group=group)
        log1 = MagicMock(
            id=1,
            group_id=7,
            question="Q1",
            answer="A1",
            citations=[],
            is_shared_origin=False,
            feedback=None,
            created_at=None,
        )
        log2 = MagicMock(
            id=2,
            group_id=7,
            question="Q2",
            answer="A2",
            citations=[],
            is_shared_origin=True,
            feedback="good",
            created_at=None,
        )
        chat_repo.get_logs_for_group.return_value = [log1, log2]

        result = use_case.execute(group_id=7, user_id=1)

        self.assertEqual(len(result), 2)
        self.assertIsInstance(result[0], ChatLogResponseDTO)
        self.assertEqual(result[0].question, "Q1")
        self.assertEqual(result[1].feedback, "good")
        chat_repo.get_logs_for_group.assert_called_once_with(7, ascending=False)


class ExportChatHistoryBuildRowsTests(unittest.TestCase):
    """Verify _build_rows accepts ChatLogEntity and yields ChatHistoryExportRow DTOs."""

    def test_build_rows_yields_export_row_dtos(self):
        from datetime import datetime

        from app.domain.chat.entities import ChatLogEntity
        from app.use_cases.chat.dto import ChatHistoryExportRow
        from app.use_cases.chat.export_history import ExportChatHistoryUseCase

        log = ChatLogEntity(
            id=1,
            user_id=2,
            group_id=3,
            group_user_id=2,
            group_share_token=None,
            question="Q?",
            answer="A.",
            citations=[],
            is_shared_origin=False,
            feedback=None,
            created_at=datetime(2026, 1, 1),
        )

        rows = list(ExportChatHistoryUseCase._build_rows([log]))

        self.assertEqual(len(rows), 1)
        self.assertIsInstance(rows[0], ChatHistoryExportRow)
        self.assertEqual(rows[0].question, "Q?")
        self.assertEqual(rows[0].answer, "A.")

    def test_build_rows_empty_list_yields_nothing(self):
        from app.use_cases.chat.export_history import ExportChatHistoryUseCase

        rows = list(ExportChatHistoryUseCase._build_rows([]))
        self.assertEqual(rows, [])


if __name__ == "__main__":
    unittest.main()
