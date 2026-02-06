"""
Tests for Video model
"""

from django.contrib.auth import get_user_model
from django.test import TestCase

from app.models import Video

User = get_user_model()


class VideoModelTests(TestCase):
    """Tests for Video model"""

    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
            video_limit=None,
        )

    def test_create_video_with_required_fields(self):
        """Test creating a video with required fields"""
        video = Video.objects.create(
            user=self.user,
            title="Test Video",
        )

        self.assertEqual(video.title, "Test Video")
        self.assertEqual(video.user, self.user)
        self.assertEqual(video.status, "pending")

    def test_default_status_is_pending(self):
        """Test that default status is pending"""
        video = Video.objects.create(
            user=self.user,
            title="Test Video",
        )

        self.assertEqual(video.status, "pending")

    def test_status_choices(self):
        """Test valid status choices"""
        for status, _ in Video.STATUS_CHOICES:
            video = Video.objects.create(
                user=self.user,
                title=f"Video {status}",
                status=status,
            )
            self.assertEqual(video.status, status)

    def test_description_is_optional(self):
        """Test that description is optional"""
        video = Video.objects.create(
            user=self.user,
            title="Test Video",
        )

        self.assertEqual(video.description, "")

    def test_transcript_is_optional(self):
        """Test that transcript is optional"""
        video = Video.objects.create(
            user=self.user,
            title="Test Video",
        )

        self.assertEqual(video.transcript, "")

    def test_external_id_is_optional(self):
        """Test that external_id is optional"""
        video = Video.objects.create(
            user=self.user,
            title="Test Video",
        )

        self.assertIsNone(video.external_id)

    def test_external_id_is_unique(self):
        """Test that external_id must be unique when set"""
        Video.objects.create(
            user=self.user,
            title="Video 1",
            external_id="ext-123",
        )

        from django.db import IntegrityError

        with self.assertRaises(IntegrityError):
            Video.objects.create(
                user=self.user,
                title="Video 2",
                external_id="ext-123",
            )

    def test_uploaded_at_is_auto_set(self):
        """Test that uploaded_at is automatically set"""
        video = Video.objects.create(
            user=self.user,
            title="Test Video",
        )

        self.assertIsNotNone(video.uploaded_at)

    def test_str_representation(self):
        """Test string representation of video"""
        video = Video.objects.create(
            user=self.user,
            title="My Video",
        )

        self.assertEqual(str(video), "My Video (by testuser)")

    def test_ordering_by_uploaded_at_desc(self):
        """Test that videos are ordered by uploaded_at descending"""
        video1 = Video.objects.create(user=self.user, title="Video 1")
        video2 = Video.objects.create(user=self.user, title="Video 2")
        video3 = Video.objects.create(user=self.user, title="Video 3")

        videos = list(Video.objects.all())

        # Most recently created should be first
        self.assertEqual(videos[0], video3)
        self.assertEqual(videos[1], video2)
        self.assertEqual(videos[2], video1)
