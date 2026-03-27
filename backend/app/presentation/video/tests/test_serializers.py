"""
Tests for video serializers (presentation layer)
"""

from io import BytesIO
from unittest.mock import patch

from django.apps import apps
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory, force_authenticate

from app.presentation.video.serializers import (
    TagCreateSerializer,
    TagDetailSerializer,
    TagUpdateSerializer,
    VideoCreateSerializer,
    VideoGroupDetailSerializer,
    VideoSerializer,
)

User = get_user_model()
Tag = apps.get_model("app", "Tag")
Video = apps.get_model("app", "Video")
VideoGroup = apps.get_model("app", "VideoGroup")
VideoGroupMember = apps.get_model("app", "VideoGroupMember")
VideoTag = apps.get_model("app", "VideoTag")


class VideoCreateSerializerTests(TestCase):
    """Tests for VideoCreateSerializer — validates file type only.
    Quota enforcement and task dispatch are tested in use_cases/video/tests/.
    """

    def setUp(self):
        self.factory = APIRequestFactory()
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
        )

    def _create_video_file(self, name="test_video.mp4", content_type="video/mp4"):
        return SimpleUploadedFile(
            name,
            BytesIO(b"fake video content").read(),
            content_type=content_type,
        )

    def _get_request_context(self):
        request = self.factory.post("/videos/")
        force_authenticate(request, user=self.user)
        drf_request = Request(request)
        drf_request._user = self.user
        return {"request": drf_request}

    @patch("app.presentation.video.serializers.validate_video_media_file")
    def test_valid_video_creation(self, mock_validate_video):
        """Test that a valid video file passes serializer validation"""
        mock_validate_video.return_value = {
            "format": {"format_name": "mp4", "duration": "60.0"},
            "streams": [{"codec_type": "video", "codec_name": "h264"}],
        }
        data = {
            "file": self._create_video_file(),
            "title": "Test Video",
            "description": "Test Description",
        }

        serializer = VideoCreateSerializer(
            data=data, context=self._get_request_context()
        )

        self.assertTrue(serializer.is_valid())

    def test_rejects_invalid_file_extension(self):
        """Test that non-video file extensions are rejected"""
        data = {
            "file": self._create_video_file(name="document.pdf", content_type="application/pdf"),
            "title": "Test",
        }

        serializer = VideoCreateSerializer(
            data=data, context=self._get_request_context()
        )

        self.assertFalse(serializer.is_valid())
        self.assertIn("file", serializer.errors)

    def test_rejects_invalid_content_type(self):
        """Test that non-video MIME types are rejected"""
        data = {
            "file": self._create_video_file(name="test.mp4", content_type="application/octet-stream"),
            "title": "Test",
        }

        serializer = VideoCreateSerializer(
            data=data, context=self._get_request_context()
        )

        self.assertFalse(serializer.is_valid())
        self.assertIn("file", serializer.errors)

    @patch("app.presentation.video.serializers.validate_video_media_file")
    def test_accepts_various_video_formats(self, mock_validate_video):
        """Test that common video formats are accepted"""
        mock_validate_video.return_value = {
            "format": {"format_name": "mp4", "duration": "60.0"},
            "streams": [{"codec_type": "video", "codec_name": "h264"}],
        }
        formats = [
            ("video.mov", "video/quicktime"),
            ("video.avi", "video/x-msvideo"),
            ("video.webm", "video/webm"),
        ]
        for name, content_type in formats:
            with self.subTest(name=name):
                data = {
                    "file": self._create_video_file(name=name, content_type=content_type),
                    "title": "Test",
                }
                serializer = VideoCreateSerializer(
                    data=data, context=self._get_request_context()
                )
                self.assertTrue(serializer.is_valid(), serializer.errors)

    @patch("app.presentation.video.serializers.validate_video_media_file")
    def test_rejects_unreadable_video_payload(self, mock_validate_video):
        """Test that files failing ffprobe validation are rejected"""
        from app.contracts.media_validation import InvalidMediaFileError

        mock_validate_video.side_effect = InvalidMediaFileError(
            "Uploaded file is not a valid video."
        )
        data = {
            "file": self._create_video_file(),
            "title": "Test Video",
        }

        serializer = VideoCreateSerializer(
            data=data, context=self._get_request_context()
        )

        self.assertFalse(serializer.is_valid())
        self.assertEqual(
            serializer.errors["file"][0],
            "Uploaded file is not a valid video.",
        )

    @override_settings(MAX_VIDEO_UPLOAD_SIZE_BYTES=8)
    def test_rejects_oversized_video_file(self):
        """Test that files exceeding the app size limit are rejected"""
        data = {
            "file": self._create_video_file(),
            "title": "Test Video",
        }

        serializer = VideoCreateSerializer(
            data=data, context=self._get_request_context()
        )

        self.assertFalse(serializer.is_valid())
        self.assertEqual(
            serializer.errors["file"][0],
            "File size exceeds the limit of 1 MB.",
        )


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

    def test_allows_whitespace_name_at_boundary(self):
        """Whitespace-only checks are enforced in use-cases/domain."""
        data = {
            "name": "   ",
            "color": "#FF0000",
        }

        serializer = TagCreateSerializer(data=data, context=self._get_request_context())

        self.assertTrue(serializer.is_valid())

    def test_preserves_name_as_provided(self):
        """Normalization is handled by use-cases/domain."""
        data = {
            "name": "  Important  ",
            "color": "#FF0000",
        }

        serializer = TagCreateSerializer(data=data, context=self._get_request_context())

        self.assertTrue(serializer.is_valid())
        self.assertEqual(serializer.validated_data["name"], "  Important  ")

    def test_accepts_arbitrary_color_string_at_boundary(self):
        """Color format validation is enforced in use-cases/domain."""
        data = {"name": "Test", "color": "red"}
        serializer = TagCreateSerializer(
            data=data, context=self._get_request_context()
        )
        self.assertTrue(serializer.is_valid())


class TagUpdateSerializerTests(TestCase):
    """Tests for TagUpdateSerializer"""

    def test_accepts_arbitrary_color_string_on_update(self):
        """Color format validation is enforced in use-cases/domain."""
        data = {"color": "invalid"}

        serializer = TagUpdateSerializer(data=data, partial=True)

        self.assertTrue(serializer.is_valid())

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
        )
        self.video = Video.objects.create(
            user=self.user,
            title="Test Video",
            description="Test Description",
            status="completed",
        )

    def test_includes_tags(self):
        """Test that tags are included in serialization"""
        from app.domain.video.entities import TagEntity, VideoEntity

        tag1 = Tag.objects.create(user=self.user, name="Tag1", color="#FF0000")
        tag2 = Tag.objects.create(user=self.user, name="Tag2", color="#00FF00")

        video_entity = VideoEntity(
            id=self.video.id,
            user_id=self.user.id,
            title="Test Video",
            status="completed",
            description="Test Description",
            tags=[
                TagEntity(id=tag1.id, user_id=self.user.id, name="Tag1", color="#FF0000"),
                TagEntity(id=tag2.id, user_id=self.user.id, name="Tag2", color="#00FF00"),
            ],
        )

        serializer = VideoSerializer(video_entity)
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
        )
        self.group = VideoGroup.objects.create(
            user=self.user,
            name="Test Group",
            description="Test Description",
        )

    def _get_request_context(self):
        request = self.factory.get("/groups/")
        request.user = self.user
        return {"request": Request(request)}

    def test_includes_videos_with_order(self):
        """Test that videos include order information"""
        from app.domain.video.entities import VideoEntity, VideoGroupEntity, VideoGroupMemberEntity

        video1 = Video.objects.create(user=self.user, title="Video 1")
        video2 = Video.objects.create(user=self.user, title="Video 2")

        v1_entity = VideoEntity(id=video1.id, user_id=self.user.id, title="Video 1", status="processing", description="")
        v2_entity = VideoEntity(id=video2.id, user_id=self.user.id, title="Video 2", status="processing", description="")

        group_entity = VideoGroupEntity(
            id=self.group.id,
            user_id=self.user.id,
            name="Test Group",
            description="Test Description",
            video_count=2,
            members=[
                VideoGroupMemberEntity(id=1, group_id=self.group.id, video_id=video2.id, order=0, video=v2_entity),
                VideoGroupMemberEntity(id=2, group_id=self.group.id, video_id=video1.id, order=1, video=v1_entity),
            ],
        )

        serializer = VideoGroupDetailSerializer(
            group_entity, context=self._get_request_context()
        )
        data = serializer.data

        self.assertEqual(len(data["videos"]), 2)
        orders = [v["order"] for v in data["videos"]]
        self.assertEqual(orders, [0, 1])

    def test_empty_group_returns_empty_videos(self):
        """Test that empty group returns empty videos list"""
        from app.domain.video.entities import VideoGroupEntity

        group_entity = VideoGroupEntity(
            id=self.group.id,
            user_id=self.user.id,
            name="Test Group",
            description="Test Description",
            video_count=0,
            members=[],
        )

        serializer = VideoGroupDetailSerializer(
            group_entity, context=self._get_request_context()
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
        )
        self.tag = Tag.objects.create(
            user=self.user,
            name="Test Tag",
            color="#FF0000",
        )

    def _get_request_context(self):
        request = self.factory.get("/tags/")
        request.user = self.user
        return {"request": Request(request)}

    def test_includes_videos_with_tag(self):
        """Test that videos with this tag are included"""
        from app.domain.video.entities import TagEntity, VideoEntity

        video1 = Video.objects.create(user=self.user, title="Video 1")
        video2 = Video.objects.create(user=self.user, title="Video 2")

        tag_entity = TagEntity(
            id=self.tag.id,
            user_id=self.user.id,
            name="Test Tag",
            color="#FF0000",
            video_count=2,
            videos=[
                VideoEntity(id=video1.id, user_id=self.user.id, title="Video 1", status="processing", description=""),
                VideoEntity(id=video2.id, user_id=self.user.id, title="Video 2", status="processing", description=""),
            ],
        )

        serializer = TagDetailSerializer(
            tag_entity, context=self._get_request_context()
        )
        data = serializer.data

        self.assertEqual(len(data["videos"]), 2)
        self.assertEqual(data["video_count"], 2)
