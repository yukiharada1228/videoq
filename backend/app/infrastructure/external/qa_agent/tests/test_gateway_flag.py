"""Gateway routing between classic RAG and QA tool agent."""

from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings

from app.domain.chat.dtos import ChatMessageDTO
from app.infrastructure.external.qa_agent.agent import QaToolAgentResult, _QaAgentStreamEnd
from app.infrastructure.external.rag_gateway import RagChatGateway

User = get_user_model()


class RagChatGatewayAgentFlagTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="flag_user",
            email="flag@example.com",
            password="testpass123",
        )
        self.messages = [ChatMessageDTO(role="user", content="hello")]

    @patch("app.infrastructure.external.rag_gateway.QaToolAgent")
    @patch("app.infrastructure.external.rag_gateway.RagChatService")
    @patch("app.infrastructure.external.rag_gateway.get_langchain_llm")
    @override_settings(QA_AGENT_ENABLED=False, LLM_PROVIDER="openai")
    def test_flag_off_uses_classic_rag(
        self, mock_get_llm, mock_service_cls, mock_agent_cls
    ):
        mock_get_llm.return_value = MagicMock()
        mock_service = MagicMock()
        mock_service.run.return_value = MagicMock(
            llm_response=MagicMock(content="classic"),
            query_text="hello",
            citations=None,
            retrieved_contexts=[],
        )
        mock_service_cls.return_value = mock_service

        gateway = RagChatGateway()
        result = gateway.generate_reply(messages=self.messages, user_id=self.user.id)

        self.assertEqual(result.content, "classic")
        mock_service.run.assert_called_once()
        mock_agent_cls.assert_not_called()

    @patch("app.infrastructure.external.rag_gateway.QaToolAgent")
    @patch("app.infrastructure.external.rag_gateway.RagChatService")
    @patch("app.infrastructure.external.rag_gateway.get_langchain_llm")
    @override_settings(QA_AGENT_ENABLED=True, LLM_PROVIDER="openai")
    def test_flag_on_uses_agent(
        self, mock_get_llm, mock_service_cls, mock_agent_cls
    ):
        mock_get_llm.return_value = MagicMock()
        mock_agent = MagicMock()
        mock_agent.run.return_value = QaToolAgentResult(
            content="agent answer",
            query_text="hello",
            citations=[
                {
                    "video_id": "12",
                    "title": "T",
                    "start_time": "00:00:01",
                    "end_time": "00:00:02",
                }
            ],
            retrieved_contexts=["ctx"],
        )
        mock_agent_cls.return_value = mock_agent

        gateway = RagChatGateway()
        result = gateway.generate_reply(
            messages=self.messages,
            user_id=self.user.id,
            video_ids=[12],
        )

        self.assertEqual(result.content, "agent answer")
        self.assertEqual(result.retrieved_contexts, ["ctx"])
        self.assertEqual(result.citations[0].video_id, 12)
        mock_agent.run.assert_called_once()
        mock_service_cls.assert_not_called()

    @patch("app.infrastructure.external.rag_gateway.QaToolAgent")
    @patch("app.infrastructure.external.rag_gateway.RagChatService")
    @patch("app.infrastructure.external.rag_gateway.get_langchain_llm")
    @override_settings(QA_AGENT_ENABLED=True, LLM_PROVIDER="ollama")
    def test_ollama_falls_back_to_classic_even_when_flag_on(
        self, mock_get_llm, mock_service_cls, mock_agent_cls
    ):
        mock_get_llm.return_value = MagicMock()
        mock_service = MagicMock()
        mock_service.run.return_value = MagicMock(
            llm_response=MagicMock(content="fallback"),
            query_text="hello",
            citations=None,
            retrieved_contexts=[],
        )
        mock_service_cls.return_value = mock_service

        gateway = RagChatGateway()
        result = gateway.generate_reply(messages=self.messages, user_id=self.user.id)

        self.assertEqual(result.content, "fallback")
        mock_service.run.assert_called_once()
        mock_agent_cls.assert_not_called()

    @patch("app.infrastructure.external.rag_gateway.QaToolAgent")
    @patch("app.infrastructure.external.rag_gateway.get_langchain_llm")
    @override_settings(QA_AGENT_ENABLED=True, LLM_PROVIDER="openai")
    def test_agent_stream_maps_to_sse_contract(self, mock_get_llm, mock_agent_cls):
        mock_get_llm.return_value = MagicMock()
        mock_agent = MagicMock()

        def _stream(**kwargs):
            yield "Hi"
            yield _QaAgentStreamEnd(
                citations=[
                    {
                        "video_id": "7",
                        "title": "V",
                        "start_time": "00:00:00",
                        "end_time": "00:00:01",
                    }
                ],
                query_text="hello",
                retrieved_contexts=["c"],
            )

        mock_agent.stream.side_effect = _stream
        mock_agent_cls.return_value = mock_agent

        gateway = RagChatGateway()
        chunks = list(
            gateway.stream_reply(messages=self.messages, user_id=self.user.id)
        )

        self.assertEqual(chunks[0].text, "Hi")
        self.assertTrue(chunks[-1].is_final)
        self.assertEqual(chunks[-1].query_text, "hello")
        self.assertEqual(chunks[-1].citations[0].video_id, 7)
        self.assertEqual(chunks[-1].retrieved_contexts, ["c"])
