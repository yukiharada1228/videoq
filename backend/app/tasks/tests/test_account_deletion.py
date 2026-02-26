"""
Tests for account deletion task
"""

from io import BytesIO
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase

from app.models import ChatLog, Tag, Video, VideoGroup
from app.tasks.account_deletion import delete_account_data

User = get_user_model()


class AccountDeletionTaskTests(TestCase):
    """Tests for delete_account_data task"""

    @patch("app.utils.vector_manager.delete_video_vectors")
    def test_delete_account_data_removes_related_objects(self, _mock_delete_vectors):
        user = User.objects.create_user(
            username="deleteuser",
            email="delete@example.com",
            password="testpass123",
        )

        video_file = SimpleUploadedFile(
            "test_video.mp4",
            BytesIO(b"fake video content").read(),
            content_type="video/mp4",
        )
        video = Video.objects.create(
            user=user, file=video_file, title="Test Video", description=""
        )

        Tag.objects.create(user=user, name="tag1")
        group = VideoGroup.objects.create(user=user, name="group1", description="")
        ChatLog.objects.create(
            user=user,
            group=group,
            question="q",
            answer="a",
            related_videos=[video.id],
        )

        delete_account_data(user.id)

        self.assertEqual(Video.objects.filter(user=user).count(), 0)
        self.assertEqual(Tag.objects.filter(user=user).count(), 0)
        self.assertEqual(VideoGroup.objects.filter(user=user).count(), 0)
        self.assertEqual(ChatLog.objects.filter(user=user).count(), 0)
        self.assertTrue(User.objects.filter(id=user.id).exists())
