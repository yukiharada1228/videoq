"""
Tests for video serializers (presentation layer)
"""

import unittest
from io import BytesIO
from unittest.mock import MagicMock

from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory

from app.domain.video.entities import (
    TagEntity,
    VideoEntity,
    VideoGroupEntity,
    VideoGroupMemberEntity,
)
from app.presentation.video.serializers import (
    TagCreateSerializer,
    TagDetailSerializer,
    TagUpdateSerializer,
    VideoCreateSerializer,
    VideoGroupDetailSerializer,
    VideoSerializer,
)


def _make_user(user_id=101):
    user = MagicMock()
    user.id = user_id
    user.pk = user_id
    user.is_authenticated = True
    return user


class VideoCreateSerializerTests(unittest.TestCase):
    """Tests for VideoCreateSerializer — validates file type only.
    Quota enforcement and task dispatch are tested in use_cases/video/tests/.
    """

    def setUp(self):
        self.factory = APIRequestFactory()
        self.user = _make_user()

    def _create_video_file(self, name="test_video.mp4", content_type="video/mp4"):
        return SimpleUploadedFile(
            name,
            BytesIO(b"fake video content").read(),
            content_type=content_type,
        )

    def _get_request_context(self):
        request = self.factory.post("/videos/")
        drf_request = Request(request)
        drf_request._user = self.user
        return {"request": drf_request}

    def test_valid_video_creation(self):
        """Test that a valid video file passes serializer validation"""
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

    def test_accepts_various_video_formats(self):
        """Test that common video formats are accepted"""
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


class TagCreateSerializerTests(unittest.TestCase):
    """Tests for TagCreateSerializer"""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.user = _make_user()

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
            "#FFF",      # Too short
            "#FFFFFFF",  # Too long
            "FF0000",    # Missing #
            "#GGGGGG",   # Invalid hex
            "red",       # Named color
        ]

        for color in invalid_colors:
            data = {"name": "Test", "color": color}
            serializer = TagCreateSerializer(
                data=data, context=self._get_request_context()
            )
            self.assertFalse(serializer.is_valid(), f"Color {color} should be invalid")
            self.assertIn("color", serializer.errors)


class TagUpdateSerializerTests(unittest.TestCase):
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


class VideoSerializerTests(unittest.TestCase):
    """Tests for VideoSerializer"""

    def test_includes_tags(self):
        """Test that tags are included in serialization"""
        video_entity = VideoEntity(
            id=1,
            user_id=10,
            title="Test Video",
            status="completed",
            description="Test Description",
            tags=[
                TagEntity(id=100, user_id=10, name="Tag1", color="#FF0000"),
                TagEntity(id=101, user_id=10, name="Tag2", color="#00FF00"),
            ],
        )

        serializer = VideoSerializer(video_entity)
        data = serializer.data

        self.assertEqual(len(data["tags"]), 2)
        self.assertIn("id", data["tags"][0])
        self.assertIn("name", data["tags"][0])
        self.assertIn("color", data["tags"][0])


class VideoGroupDetailSerializerTests(unittest.TestCase):
    """Tests for VideoGroupDetailSerializer"""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.user = _make_user()

    def _get_request_context(self):
        request = self.factory.get("/groups/")
        request.user = self.user
        return {"request": Request(request)}

    def test_includes_videos_with_order(self):
        """Test that videos include order information"""
        v1_entity = VideoEntity(id=1, user_id=10, title="Video 1", status="processing", description="")
        v2_entity = VideoEntity(id=2, user_id=10, title="Video 2", status="processing", description="")

        group_entity = VideoGroupEntity(
            id=50,
            user_id=10,
            name="Test Group",
            description="Test Description",
            video_count=2,
            members=[
                VideoGroupMemberEntity(id=1, group_id=50, video_id=2, order=0, video=v2_entity),
                VideoGroupMemberEntity(id=2, group_id=50, video_id=1, order=1, video=v1_entity),
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
        group_entity = VideoGroupEntity(
            id=50,
            user_id=10,
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


class TagDetailSerializerTests(unittest.TestCase):
    """Tests for TagDetailSerializer"""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.user = _make_user()

    def _get_request_context(self):
        request = self.factory.get("/tags/")
        request.user = self.user
        return {"request": Request(request)}

    def test_includes_videos_with_tag(self):
        """Test that videos with this tag are included"""
        tag_entity = TagEntity(
            id=100,
            user_id=10,
            name="Test Tag",
            color="#FF0000",
            video_count=2,
            videos=[
                VideoEntity(id=1, user_id=10, title="Video 1", status="processing", description=""),
                VideoEntity(id=2, user_id=10, title="Video 2", status="processing", description=""),
            ],
        )

        serializer = TagDetailSerializer(
            tag_entity, context=self._get_request_context()
        )
        data = serializer.data

        self.assertEqual(len(data["videos"]), 2)
        self.assertEqual(data["video_count"], 2)
