from unittest.mock import Mock
from rest_framework.test import APITestCase

from app.chat.use_cases import (ChatFeedbackResult, GetChatAnalyticsQuery,
                                GetChatAnalyticsUseCase,
                                GetPopularScenesQuery,
                                GetPopularScenesUseCase,
                                SendChatMessageCommand,
                                SendChatMessageUseCase,
                                UpdateChatFeedbackCommand,
                                UpdateChatFeedbackUseCase)

class SendChatMessageUseCaseTests(APITestCase):
    def test_execute_returns_payload(self):
        result_payload = {"role": "assistant", "content": "hello"}
        chat_message_sender = Mock(return_value=result_payload)

        output = SendChatMessageUseCase(
            chat_message_sender=chat_message_sender,
        ).execute(
            SendChatMessageCommand(
                actor_id=1,
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
                actor_id=3,
                share_token=None,
                chat_log_id=7,
                feedback="",
            )
        )

        self.assertIsInstance(result, ChatFeedbackResult)
        self.assertEqual(result.chat_log_id, 7)
        self.assertIsNone(result.feedback)
        command = updater.call_args.args[0]
        self.assertEqual(command.chat_log_id, 7)
        self.assertIsNone(command.feedback)
        self.assertEqual(command.actor_id, 3)
        self.assertIsNone(command.share_token)


class GetPopularScenesUseCaseTests(APITestCase):
    def test_execute_loads_group_and_returns_result(self):
        popular_scenes_getter = Mock(return_value=[{"video_id": 1}])

        result = GetPopularScenesUseCase(
            popular_scenes_getter=popular_scenes_getter,
        ).execute(
            GetPopularScenesQuery(
                actor_id=3,
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
                actor_id=3,
                group_id=5,
            )
        )

        self.assertEqual(result, analytics)
        chat_analytics_getter.assert_called_once()
