"""
Tests for video serializers
"""

from io import BytesIO
from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory

from app.models import Tag, Video, VideoGroup, VideoGroupMember, VideoTag
from app.video.serializers import (TagCreateSerializer, TagDetailSerializer,
                                   TagListSerializer, TagUpdateSerializer,
                                   VideoCreateSerializer,
                                   VideoGroupDetailSerializer,
                                   VideoGroupListSerializer,
                                   VideoListSerializer, VideoSerializer,
                                   VideoUpdateSerializer)

User = get_user_model()


class VideoCreateSerializerTests(TestCase):
    """Tests for VideoCreateSerializer"""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
            video_limit=None,
        )

    def _create_video_file(self):
        """Helper to create a test video file"""
        return SimpleUploadedFile(
            "test_video.mp4",
            BytesIO(b"fake video content").read(),
            content_type="video/mp4",
        )

    def _get_request_context(self):
        """Helper to create request context"""
        request = self.factory.post("/videos/")
        request.user = self.user
        return {"request": Request(request)}

    @patch("app.video.serializers.transcribe_video.delay")
    def test_valid_video_creation(self, mock_task):
        """Test valid video creation"""
        data = {
            "file": self._create_video_file(),
            "title": "Test Video",
            "description": "Test Description",
        }

        serializer = VideoCreateSerializer(
            data=data, context=self._get_request_context()
        )

        self.assertTrue(serializer.is_valid())

    @patch("app.video.serializers.transcribe_video.delay")
    def test_starts_transcription_task_on_create(self, mock_task):
        """Test that transcription task is started on create"""
        data = {
            "file": self._create_video_file(),
            "title": "Test Video",
            "description": "Test Description",
        }

        serializer = VideoCreateSerializer(
            data=data, context=self._get_request_context()
        )
        self.assertTrue(serializer.is_valid())
        video = serializer.save()

        mock_task.assert_called_once_with(video.id)

    def test_validates_video_limit_zero(self):
        """Test validation when video_limit is 0"""
        self.user.video_limit = 0
        self.user.save()

        data = {
            "file": self._create_video_file(),
            "title": "Test Video",
        }

        serializer = VideoCreateSerializer(
            data=data, context=self._get_request_context()
        )

        self.assertFalse(serializer.is_valid())
        self.assertIn("Video upload limit reached", str(serializer.errors))

    @patch("app.video.serializers.transcribe_video.delay")
    def test_validates_video_limit_reached(self, mock_task):
        """Test validation when video_limit is reached"""
        self.user.video_limit = 2
        self.user.save()

        # Create 2 videos
        Video.objects.create(user=self.user, title="Video 1")
        Video.objects.create(user=self.user, title="Video 2")

        data = {
            "file": self._create_video_file(),
            "title": "Video 3",
        }

        serializer = VideoCreateSerializer(
            data=data, context=self._get_request_context()
        )

        self.assertFalse(serializer.is_valid())
        self.assertIn("Video upload limit reached", str(serializer.errors))

    @patch("app.video.serializers.transcribe_video.delay")
    def test_allows_upload_when_within_limit(self, mock_task):
        """Test that upload is allowed when within limit"""
        self.user.video_limit = 3
        self.user.save()

        Video.objects.create(user=self.user, title="Video 1")

        data = {
            "file": self._create_video_file(),
            "title": "Video 2",
        }

        serializer = VideoCreateSerializer(
            data=data, context=self._get_request_context()
        )

        self.assertTrue(serializer.is_valid())

    @patch("app.video.serializers.transcribe_video.delay")
    def test_allows_unlimited_uploads(self, mock_task):
        """Test that unlimited uploads are allowed when video_limit is None"""
        self.user.video_limit = None
        self.user.save()

        # Create many videos
        for i in range(10):
            Video.objects.create(user=self.user, title=f"Video {i}")

        data = {
            "file": self._create_video_file(),
            "title": "Another Video",
        }

        serializer = VideoCreateSerializer(
            data=data, context=self._get_request_context()
        )

        self.assertTrue(serializer.is_valid())

    def test_normalizes_empty_external_id(self):
        """Test that empty external_id is normalized to None"""
        data = {
            "file": self._create_video_file(),
            "title": "Test Video",
            "external_id": "",
        }

        serializer = VideoCreateSerializer(
            data=data, context=self._get_request_context()
        )

        self.assertTrue(serializer.is_valid())
        self.assertIsNone(serializer.validated_data.get("external_id"))

    def test_normalizes_whitespace_external_id(self):
        """Test that whitespace external_id is normalized to None"""
        data = {
            "file": self._create_video_file(),
            "title": "Test Video",
            "external_id": "   ",
        }

        serializer = VideoCreateSerializer(
            data=data, context=self._get_request_context()
        )

        self.assertTrue(serializer.is_valid())
        self.assertIsNone(serializer.validated_data.get("external_id"))


class TagCreateSerializerTests(TestCase):
    """Tests for TagCreateSerializer"""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
        )

    def _get_request_context(self):
        """Helper to create request context"""
        request = self.factory.post("/tags/")
        request.user = self.user
        return {"request": Request(request)}

    def test_valid_tag_creation(self):
        """Test valid tag creation"""
        data = {
            "name": "Important",
            "color": "#FF0000",
        }

        serializer = TagCreateSerializer(data=data, context=self._get_request_context())

        self.assertTrue(serializer.is_valid())

    def test_validates_empty_name(self):
        """Test that empty name is invalid"""
        data = {
            "name": "",
            "color": "#FF0000",
        }

        serializer = TagCreateSerializer(data=data, context=self._get_request_context())

        self.assertFalse(serializer.is_valid())
        self.assertIn("name", serializer.errors)

    def test_validates_whitespace_name(self):
        """Test that whitespace-only name is invalid"""
        data = {
            "name": "   ",
            "color": "#FF0000",
        }

        serializer = TagCreateSerializer(data=data, context=self._get_request_context())

        self.assertFalse(serializer.is_valid())

    def test_strips_name_whitespace(self):
        """Test that name whitespace is stripped"""
        data = {
            "name": "  Important  ",
            "color": "#FF0000",
        }

        serializer = TagCreateSerializer(data=data, context=self._get_request_context())

        self.assertTrue(serializer.is_valid())
        self.assertEqual(serializer.validated_data["name"], "Important")

    def test_validates_color_format_valid(self):
        """Test valid color formats"""
        valid_colors = ["#FF0000", "#00ff00", "#0000FF", "#123456", "#ABCDEF"]

        for color in valid_colors:
            data = {"name": "Test", "color": color}
            serializer = TagCreateSerializer(
                data=data, context=self._get_request_context()
            )
            self.assertTrue(serializer.is_valid(), f"Color {color} should be valid")

    def test_validates_color_format_invalid(self):
        """Test invalid color formats"""
        invalid_colors = [
            "#FFF",  # Too short
            "#FFFFFFF",  # Too long
            "FF0000",  # Missing #
            "#GGGGGG",  # Invalid hex
            "red",  # Named color
        ]

        for color in invalid_colors:
            data = {"name": "Test", "color": color}
            serializer = TagCreateSerializer(
                data=data, context=self._get_request_context()
            )
            self.assertFalse(serializer.is_valid(), f"Color {color} should be invalid")
            self.assertIn("color", serializer.errors)


class TagUpdateSerializerTests(TestCase):
    """Tests for TagUpdateSerializer"""

    def test_validates_color_format(self):
        """Test color format validation on update"""
        data = {"color": "invalid"}

        serializer = TagUpdateSerializer(data=data, partial=True)

        self.assertFalse(serializer.is_valid())
        self.assertIn("color", serializer.errors)

    def test_validates_empty_name_on_update(self):
        """Test that empty name is invalid on update"""
        data = {"name": ""}

        serializer = TagUpdateSerializer(data=data, partial=True)

        self.assertFalse(serializer.is_valid())


class VideoSerializerTests(TestCase):
    """Tests for VideoSerializer"""

    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
            video_limit=None,
        )
        self.video = Video.objects.create(
            user=self.user,
            title="Test Video",
            description="Test Description",
            status="completed",
        )

    def test_includes_tags(self):
        """Test that tags are included in serialization"""
        tag1 = Tag.objects.create(user=self.user, name="Tag1", color="#FF0000")
        tag2 = Tag.objects.create(user=self.user, name="Tag2", color="#00FF00")
        VideoTag.objects.create(video=self.video, tag=tag1)
        VideoTag.objects.create(video=self.video, tag=tag2)

        serializer = VideoSerializer(self.video)
        data = serializer.data

        self.assertEqual(len(data["tags"]), 2)
        self.assertIn("id", data["tags"][0])
        self.assertIn("name", data["tags"][0])
        self.assertIn("color", data["tags"][0])


class VideoGroupDetailSerializerTests(TestCase):
    """Tests for VideoGroupDetailSerializer"""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
            video_limit=None,
        )
        self.group = VideoGroup.objects.create(
            user=self.user,
            name="Test Group",
            description="Test Description",
        )

    def _get_request_context(self):
        """Helper to create request context"""
        request = self.factory.get("/groups/")
        request.user = self.user
        return {"request": Request(request)}

    def test_includes_videos_with_order(self):
        """Test that videos include order information"""
        video1 = Video.objects.create(user=self.user, title="Video 1")
        video2 = Video.objects.create(user=self.user, title="Video 2")
        VideoGroupMember.objects.create(group=self.group, video=video1, order=1)
        VideoGroupMember.objects.create(group=self.group, video=video2, order=0)

        # Add video_count annotation
        from django.db.models import Count

        group_with_count = VideoGroup.objects.annotate(
            video_count=Count("members")
        ).get(pk=self.group.pk)

        serializer = VideoGroupDetailSerializer(
            group_with_count, context=self._get_request_context()
        )
        data = serializer.data

        self.assertEqual(len(data["videos"]), 2)
        # Videos should be ordered by the members ordering (order, then added_at)
        orders = [v["order"] for v in data["videos"]]
        self.assertEqual(orders, [0, 1])

    def test_empty_group_returns_empty_videos(self):
        """Test that empty group returns empty videos list"""
        from django.db.models import Count

        group_with_count = VideoGroup.objects.annotate(
            video_count=Count("members")
        ).get(pk=self.group.pk)

        serializer = VideoGroupDetailSerializer(
            group_with_count, context=self._get_request_context()
        )
        data = serializer.data

        self.assertEqual(data["videos"], [])
        self.assertEqual(data["video_count"], 0)


class TagDetailSerializerTests(TestCase):
    """Tests for TagDetailSerializer"""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
            video_limit=None,
        )
        self.tag = Tag.objects.create(
            user=self.user,
            name="Test Tag",
            color="#FF0000",
        )

    def _get_request_context(self):
        """Helper to create request context"""
        request = self.factory.get("/tags/")
        request.user = self.user
        return {"request": Request(request)}

    def test_includes_videos_with_tag(self):
        """Test that videos with this tag are included"""
        video1 = Video.objects.create(user=self.user, title="Video 1")
        video2 = Video.objects.create(user=self.user, title="Video 2")
        VideoTag.objects.create(video=video1, tag=self.tag)
        VideoTag.objects.create(video=video2, tag=self.tag)

        # Add video_count annotation
        from django.db.models import Count

        tag_with_count = Tag.objects.annotate(video_count=Count("video_tags")).get(
            pk=self.tag.pk
        )

        serializer = TagDetailSerializer(
            tag_with_count, context=self._get_request_context()
        )
        data = serializer.data

        self.assertEqual(len(data["videos"]), 2)
        self.assertEqual(data["video_count"], 2)
