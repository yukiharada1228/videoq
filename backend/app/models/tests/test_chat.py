"""
Tests for ChatLog model
"""

from django.contrib.auth import get_user_model
from django.test import TestCase

from app.models import ChatLog, VideoGroup

User = get_user_model()


class ChatLogModelTests(TestCase):
    """Tests for ChatLog model"""

    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
        )
        self.group = VideoGroup.objects.create(
            user=self.user,
            name="Test Group",
        )

    def test_create_chat_log(self):
        """Test creating a chat log"""
        chat_log = ChatLog.objects.create(
            user=self.user,
            group=self.group,
            question="What is this video about?",
            answer="This video is about testing.",
        )

        self.assertEqual(chat_log.question, "What is this video about?")
        self.assertEqual(chat_log.answer, "This video is about testing.")
        self.assertEqual(chat_log.user, self.user)
        self.assertEqual(chat_log.group, self.group)

    def test_default_related_videos_is_empty_list(self):
        """Test that default related_videos is empty list"""
        chat_log = ChatLog.objects.create(
            user=self.user,
            group=self.group,
            question="Question",
            answer="Answer",
        )

        self.assertEqual(chat_log.related_videos, [])

    def test_related_videos_stores_json(self):
        """Test that related_videos stores JSON data"""
        related = [
            {"video_id": 1, "title": "Video 1", "start_time": "00:00:10"},
            {"video_id": 2, "title": "Video 2", "start_time": "00:01:30"},
        ]

        chat_log = ChatLog.objects.create(
            user=self.user,
            group=self.group,
            question="Question",
            answer="Answer",
            related_videos=related,
        )

        chat_log.refresh_from_db()
        self.assertEqual(chat_log.related_videos, related)

    def test_default_is_shared_origin_is_false(self):
        """Test that default is_shared_origin is False"""
        chat_log = ChatLog.objects.create(
            user=self.user,
            group=self.group,
            question="Question",
            answer="Answer",
        )

        self.assertFalse(chat_log.is_shared_origin)

    def test_feedback_choices(self):
        """Test valid feedback choices"""
        chat_log = ChatLog.objects.create(
            user=self.user,
            group=self.group,
            question="Question",
            answer="Answer",
            feedback="good",
        )
        self.assertEqual(chat_log.feedback, "good")

        chat_log.feedback = "bad"
        chat_log.save()
        self.assertEqual(chat_log.feedback, "bad")

    def test_feedback_is_optional(self):
        """Test that feedback is optional"""
        chat_log = ChatLog.objects.create(
            user=self.user,
            group=self.group,
            question="Question",
            answer="Answer",
        )

        self.assertIsNone(chat_log.feedback)

    def test_created_at_is_auto_set(self):
        """Test that created_at is automatically set"""
        chat_log = ChatLog.objects.create(
            user=self.user,
            group=self.group,
            question="Question",
            answer="Answer",
        )

        self.assertIsNotNone(chat_log.created_at)

    def test_ordering_by_created_at_desc(self):
        """Test that chat logs are ordered by created_at descending"""
        log1 = ChatLog.objects.create(
            user=self.user, group=self.group, question="Q1", answer="A1"
        )
        log2 = ChatLog.objects.create(
            user=self.user, group=self.group, question="Q2", answer="A2"
        )
        log3 = ChatLog.objects.create(
            user=self.user, group=self.group, question="Q3", answer="A3"
        )

        logs = list(ChatLog.objects.all())

        # Most recent first
        self.assertEqual(logs[0], log3)
        self.assertEqual(logs[1], log2)
        self.assertEqual(logs[2], log1)

    def test_cascade_delete_on_user(self):
        """Test that chat logs are deleted when user is deleted"""
        ChatLog.objects.create(
            user=self.user, group=self.group, question="Q", answer="A"
        )

        self.user.delete()

        self.assertEqual(ChatLog.objects.count(), 0)

    def test_cascade_delete_on_group(self):
        """Test that chat logs are deleted when group is deleted"""
        ChatLog.objects.create(
            user=self.user, group=self.group, question="Q", answer="A"
        )

        self.group.delete()

        self.assertEqual(ChatLog.objects.count(), 0)
