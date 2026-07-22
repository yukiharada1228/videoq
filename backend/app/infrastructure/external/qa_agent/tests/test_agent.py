"""Tests for QaToolAgent loop, citations, and streaming."""

from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from langchain_core.messages import AIMessage

from app.infrastructure.external.qa_agent.agent import (
    QaToolAgent,
    _QaAgentStreamEnd,
    is_qa_agent_enabled,
)
from app.infrastructure.external.qa_agent.tools import SceneHit
from app.infrastructure.models import Video

User = get_user_model()


class IsQaAgentEnabledTests(TestCase):
    @override_settings(QA_AGENT_ENABLED=True, LLM_PROVIDER="openai")
    def test_enabled_for_openai(self):
        self.assertTrue(is_qa_agent_enabled())

    @override_settings(QA_AGENT_ENABLED=True, LLM_PROVIDER="ollama")
    def test_disabled_for_ollama_even_when_flag_on(self):
        self.assertFalse(is_qa_agent_enabled())

    @override_settings(QA_AGENT_ENABLED=False, LLM_PROVIDER="openai")
    def test_disabled_when_flag_off(self):
        self.assertFalse(is_qa_agent_enabled())


class QaToolAgentLoopTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="agent_user",
            email="agent@example.com",
            password="testpass123",
        )
        self.video = Video.objects.create(
            user=self.user, title="Lecture", status="completed"
        )

    @override_settings(QA_AGENT_MAX_ROUNDS=2, QA_AGENT_SEARCH_K=5)
    def test_max_rounds_stops_tool_loop(self):
        llm = MagicMock()
        tool_ai = AIMessage(
            content="",
            tool_calls=[
                {
                    "name": "search_scenes",
                    "args": {"query": "q"},
                    "id": "call_1",
                    "type": "tool_call",
                }
            ],
        )
        bound = MagicMock()
        bound.invoke.return_value = tool_ai
        llm.bind_tools.return_value = bound

        final = AIMessage(content="Final answer [1]")
        llm.invoke.return_value = final

        agent = QaToolAgent(
            user_id=self.user.id,
            llm=llm,
            video_ids=[self.video.id],
        )
        fake_tool = MagicMock()
        fake_tool.name = "search_scenes"
        fake_tool.invoke.return_value = '{"scenes":[],"count":0}'

        with patch.object(
            agent.toolkit, "as_langchain_tools", return_value=[fake_tool]
        ):
            result = agent.run(
                messages=[{"role": "user", "content": "What is X?"}],
                locale="en",
            )

        self.assertEqual(bound.invoke.call_count, 2)
        self.assertEqual(fake_tool.invoke.call_count, 2)
        self.assertEqual(result.content, "Final answer [1]")
        self.assertEqual(result.query_text, "What is X?")

    @override_settings(QA_AGENT_MAX_ROUNDS=3)
    def test_stops_early_when_no_tool_calls(self):
        llm = MagicMock()
        bound = MagicMock()
        bound.invoke.return_value = AIMessage(content="enough evidence")
        llm.bind_tools.return_value = bound
        llm.invoke.return_value = AIMessage(content="Answer body")

        agent = QaToolAgent(
            user_id=self.user.id,
            llm=llm,
            video_ids=[self.video.id],
        )
        result = agent.run(messages=[{"role": "user", "content": "hi"}])
        self.assertEqual(bound.invoke.call_count, 1)
        self.assertEqual(result.content, "Answer body")

    def test_build_evidence_payload_numbers_citations(self):
        agent = QaToolAgent(
            user_id=self.user.id,
            llm=MagicMock(),
            video_ids=[self.video.id],
        )
        agent.toolkit.remember(
            [
                SceneHit(
                    video_id=self.video.id,
                    video_title="Lecture",
                    start_time="00:00:10",
                    end_time="00:00:20",
                    page_content="first",
                    scene_index=1,
                ),
                SceneHit(
                    video_id=self.video.id,
                    video_title="Lecture",
                    start_time="00:01:00",
                    end_time="00:01:10",
                    page_content="second",
                    scene_index=2,
                ),
            ]
        )
        refs, citations, contexts = agent._build_evidence_payload()
        self.assertEqual(refs[0], "[1] Lecture 00:00:10 - 00:00:20\nfirst")
        self.assertEqual(refs[1], "[2] Lecture 00:01:00 - 00:01:10\nsecond")
        self.assertEqual(citations[0]["video_id"], str(self.video.id))
        self.assertEqual(citations[0]["title"], "Lecture")
        self.assertEqual(contexts, ["first", "second"])

    def test_stream_yields_tokens_then_end_sentinel(self):
        llm = MagicMock()
        bound = MagicMock()
        bound.invoke.return_value = AIMessage(content="")
        llm.bind_tools.return_value = bound

        chunk1 = MagicMock(content="Hello")
        chunk2 = MagicMock(content=" world")
        llm.stream.return_value = [chunk1, chunk2]

        agent = QaToolAgent(
            user_id=self.user.id,
            llm=llm,
            video_ids=[self.video.id],
        )
        items = list(
            agent.stream(messages=[{"role": "user", "content": "q"}])
        )
        self.assertEqual(items[0], "Hello")
        self.assertEqual(items[1], " world")
        self.assertIsInstance(items[-1], _QaAgentStreamEnd)
        self.assertEqual(items[-1].query_text, "q")

    def test_empty_video_ids_skips_tool_loop(self):
        llm = MagicMock()
        llm.invoke.return_value = AIMessage(content="no videos")
        agent = QaToolAgent(user_id=self.user.id, llm=llm, video_ids=[])
        result = agent.run(messages=[{"role": "user", "content": "q"}])
        llm.bind_tools.assert_not_called()
        self.assertEqual(result.content, "no videos")
        self.assertIsNone(result.citations)

    def test_inventory_question_uses_catalog_when_no_scenes(self):
        self.video.title = "デジタル回路　レポート解答（第1回）"
        self.video.save(update_fields=["title"])
        llm = MagicMock()
        bound = MagicMock()
        bound.invoke.return_value = AIMessage(content="")
        llm.bind_tools.return_value = bound
        llm.invoke.return_value = AIMessage(content="第1回があります")

        agent = QaToolAgent(
            user_id=self.user.id,
            llm=llm,
            video_ids=[self.video.id],
        )
        result = agent.run(
            messages=[{"role": "user", "content": "どんな講座がありますか？"}],
            locale="ja",
        )
        self.assertEqual(result.content, "第1回があります")
        self.assertTrue(result.citations)
        self.assertEqual(result.citations[0]["title"], self.video.title)
        # Final prompt must include catalog so the model is not forced to "out of scope".
        final_system = llm.invoke.call_args[0][0][0].content
        self.assertIn("Group Video Catalog", final_system)
        self.assertIn(self.video.title, final_system)
