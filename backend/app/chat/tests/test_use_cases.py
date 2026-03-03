from unittest.mock import Mock

from rest_framework.test import APITestCase

from app.chat.use_cases import (ChatFeedbackResult, ExportChatHistoryQuery,
                                ExportChatHistoryUseCase,
                                GetChatAnalyticsQuery, GetChatAnalyticsUseCase,
                                GetChatHistoryQuery, GetChatHistoryUseCase,
                                GetPopularScenesQuery, GetPopularScenesUseCase,
                                SendChatMessageCommand, SendChatMessageUseCase,
                                UpdateChatFeedbackCommand,
                                UpdateChatFeedbackUseCase)


def _make_user(id=1):
    return type("UserObj", (), {"id": id})()


def _make_group(id=1, user=None):
    return type("GroupObj", (), {"id": id, "user": user or _make_user()})()


class SendChatMessageUseCaseTests(APITestCase):
    def test_execute_returns_payload(self):
        user = _make_user()
        result_payload = {"role": "assistant", "content": "hello"}
        rag_service = Mock()
        rag_service.run.return_value = Mock(
            llm_response=Mock(content="hello"),
            related_videos=[],
            query_text="hi",
        )

        output = SendChatMessageUseCase(
            actor_loader=Mock(return_value=user),
            video_group_loader=Mock(),
            llm_loader=Mock(return_value="llm-obj"),
            rag_chat_service_factory=Mock(return_value=rag_service),
            chat_response_payload_builder=Mock(return_value=result_payload),
        ).execute(
            SendChatMessageCommand(
                actor_id=1,
                messages=[{"role": "user", "content": "hi"}],
                accept_language="ja,en;q=0.8",
            )
        )

        self.assertEqual(output.response_data, result_payload)

    def test_execute_raises_when_messages_empty(self):
        with self.assertRaises(ValueError):
            SendChatMessageUseCase(
                actor_loader=Mock(return_value=_make_user()),
                video_group_loader=Mock(),
                llm_loader=Mock(),
                rag_chat_service_factory=Mock(),
                chat_response_payload_builder=Mock(),
            ).execute(
                SendChatMessageCommand(
                    actor_id=1,
                    messages=[],
                )
            )

    def test_execute_raises_when_shared_group_not_found(self):
        with self.assertRaises(LookupError):
            SendChatMessageUseCase(
                actor_loader=Mock(),
                video_group_loader=Mock(side_effect=Exception("not found")),
                llm_loader=Mock(),
                rag_chat_service_factory=Mock(),
                chat_response_payload_builder=Mock(),
            ).execute(
                SendChatMessageCommand(
                    actor_id=None,
                    messages=[{"role": "user", "content": "hi"}],
                    group_id=1,
                    share_token="abc",
                )
            )


class UpdateChatFeedbackUseCaseTests(APITestCase):
    def test_execute_normalizes_empty_feedback(self):
        chat_log = type("ChatLogObj", (), {"id": 7, "feedback": None})()
        updater = Mock(return_value=chat_log)

        result = UpdateChatFeedbackUseCase(
            actor_loader=Mock(return_value=_make_user(id=3)),
            chat_feedback_updater=updater,
        ).execute(
            UpdateChatFeedbackCommand(
                actor_id=3,
                share_token=None,
                chat_log_id=7,
                feedback="",
            )
        )

        self.assertIsInstance(result, ChatFeedbackResult)
        self.assertEqual(result.chat_log_id, 7)
        self.assertIsNone(result.feedback)
        updater.assert_called_once_with(
            chat_log_id=7,
            feedback=None,
            request_user=updater.call_args.kwargs["request_user"],
            share_token=None,
        )

    def test_execute_raises_when_no_chat_log_id(self):
        with self.assertRaises(ValueError):
            UpdateChatFeedbackUseCase(
                actor_loader=Mock(),
                chat_feedback_updater=Mock(),
            ).execute(
                UpdateChatFeedbackCommand(actor_id=1, chat_log_id=None, feedback="good")
            )


class GetPopularScenesUseCaseTests(APITestCase):
    def test_execute_loads_group_and_returns_result(self):
        group = _make_group()
        popular_scenes_builder = Mock(return_value=[{"video_id": 1}])

        result = GetPopularScenesUseCase(
            video_group_loader=Mock(return_value=group),
            popular_scenes_builder=popular_scenes_builder,
        ).execute(
            GetPopularScenesQuery(
                actor_id=3,
                group_id=5,
                limit=10,
            )
        )

        self.assertEqual(result, [{"video_id": 1}])
        popular_scenes_builder.assert_called_once_with(group, limit=10)

    def test_execute_raises_when_no_group_id(self):
        with self.assertRaises(ValueError):
            GetPopularScenesUseCase(
                video_group_loader=Mock(),
                popular_scenes_builder=Mock(),
            ).execute(GetPopularScenesQuery(actor_id=1, group_id=None))


class GetChatAnalyticsUseCaseTests(APITestCase):
    def test_execute_loads_group_and_returns_result(self):
        group = _make_group()
        analytics = {"summary": {"total_questions": 1}}
        chat_analytics_builder = Mock(return_value=analytics)

        result = GetChatAnalyticsUseCase(
            video_group_loader=Mock(return_value=group),
            chat_analytics_builder=chat_analytics_builder,
        ).execute(
            GetChatAnalyticsQuery(
                actor_id=3,
                group_id=5,
            )
        )

        self.assertEqual(result, analytics)
        chat_analytics_builder.assert_called_once_with(group)


class GetChatHistoryUseCaseTests(APITestCase):
    def test_execute_returns_logs(self):
        group = _make_group()
        logs = ["log1", "log2"]

        result = GetChatHistoryUseCase(
            video_group_loader=Mock(return_value=group),
            chat_logs_loader=Mock(return_value=logs),
        ).execute(GetChatHistoryQuery(actor_id=1, group_id=5))

        self.assertEqual(result, logs)

    def test_execute_returns_empty_when_no_group(self):
        result = GetChatHistoryUseCase(
            video_group_loader=Mock(),
            chat_logs_loader=Mock(),
        ).execute(GetChatHistoryQuery(actor_id=1, group_id=None))

        self.assertEqual(result, [])

    def test_execute_returns_empty_when_group_not_found(self):
        result = GetChatHistoryUseCase(
            video_group_loader=Mock(side_effect=Exception("not found")),
            chat_logs_loader=Mock(),
        ).execute(GetChatHistoryQuery(actor_id=1, group_id=999))

        self.assertEqual(result, [])


class ExportChatHistoryUseCaseTests(APITestCase):
    def test_execute_returns_group_and_logs(self):
        group = _make_group()
        logs = ["log1"]

        result_group, result_logs = ExportChatHistoryUseCase(
            video_group_loader=Mock(return_value=group),
            chat_logs_loader=Mock(return_value=logs),
        ).execute(ExportChatHistoryQuery(actor_id=1, group_id=5))

        self.assertEqual(result_group.id, 1)
        self.assertEqual(result_logs, logs)

    def test_execute_raises_when_no_group_id(self):
        with self.assertRaises(ValueError):
            ExportChatHistoryUseCase(
                video_group_loader=Mock(),
                chat_logs_loader=Mock(),
            ).execute(ExportChatHistoryQuery(actor_id=1, group_id=None))
