from unittest.mock import MagicMock, Mock

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from app.chat.use_cases import (GetChatAnalyticsQuery,
                                GetChatAnalyticsUseCase,
                                GetPopularScenesQuery,
                                GetPopularScenesUseCase,
                                SendChatMessageCommand,
                                SendChatMessageUseCase,
                                UpdateChatFeedbackCommand,
                                UpdateChatFeedbackUseCase)

User = get_user_model()


class SendChatMessageUseCaseTests(APITestCase):
    def test_execute_returns_payload(self):
        user = User(username="tester")
        result_payload = {"role": "assistant", "content": "hello"}
        chat_message_sender = Mock(return_value=result_payload)

        output = SendChatMessageUseCase(
            chat_message_sender=chat_message_sender,
        ).execute(
            SendChatMessageCommand(
                request_user=user,
                messages=[{"role": "user", "content": "hi"}],
                accept_language="ja,en;q=0.8",
            )
        )

        self.assertEqual(output.response_data, result_payload)
        chat_message_sender.assert_called_once()


class UpdateChatFeedbackUseCaseTests(APITestCase):
    def test_execute_normalizes_empty_feedback(self):
        updater = Mock(return_value=type("ChatLogObj", (), {"id": 7, "feedback": None})())

        result = UpdateChatFeedbackUseCase(
            chat_feedback_updater=updater
        ).execute(
            UpdateChatFeedbackCommand(
                request_user="user",
                share_token=None,
                chat_log_id=7,
                feedback="",
            )
        )

        self.assertEqual(result.id, 7)
        self.assertIsNone(result.feedback)
        command = updater.call_args.args[0]
        self.assertEqual(command.chat_log_id, 7)
        self.assertIsNone(command.feedback)
        self.assertEqual(command.request_user, "user")
        self.assertIsNone(command.share_token)


class GetPopularScenesUseCaseTests(APITestCase):
    def test_execute_loads_group_and_returns_result(self):
        popular_scenes_getter = Mock(return_value=[{"video_id": 1}])

        result = GetPopularScenesUseCase(
            popular_scenes_getter=popular_scenes_getter,
        ).execute(
            GetPopularScenesQuery(
                request_user=type("ReqUser", (), {"id": 3})(),
                group_id=5,
                limit=10,
            )
        )

        self.assertEqual(result, [{"video_id": 1}])
        popular_scenes_getter.assert_called_once()


class GetChatAnalyticsUseCaseTests(APITestCase):
    def test_execute_loads_group_and_returns_result(self):
        analytics = {"summary": {"total_questions": 1}}
        chat_analytics_getter = Mock(return_value=analytics)

        result = GetChatAnalyticsUseCase(
            chat_analytics_getter=chat_analytics_getter,
        ).execute(
            GetChatAnalyticsQuery(
                request_user=type("ReqUser", (), {"id": 3})(),
                group_id=5,
            )
        )

        self.assertEqual(result, analytics)
        chat_analytics_getter.assert_called_once()
