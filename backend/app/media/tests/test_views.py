"""
Tests for media views
"""
import os
import tempfile
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from app.models import Video, VideoGroup, VideoGroupMember

User = get_user_model()


@override_settings(MEDIA_ROOT=tempfile.mkdtemp())
class ProtectedMediaViewTests(APITestCase):
    """Tests for ProtectedMediaView"""

    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
        )
        self.client = APIClient()

        # Create a test file
        self.test_file = SimpleUploadedFile(
            "test_video.mp4", b"test video content", content_type="video/mp4"
        )
        self.video = Video.objects.create(
            user=self.user,
            title="Test Video",
            file=self.test_file,
            status="completed",
        )

    def tearDown(self):
        """Clean up test files"""
        if self.video.file:
            try:
                if os.path.exists(self.video.file.path):
                    os.remove(self.video.file.path)
            except Exception:
                pass

    def test_get_media_with_authenticated_user(self):
        """Test accessing media with authenticated user"""
        self.client.force_authenticate(user=self.user)
        url = reverse("app:protected_media", kwargs={"path": self.video.file.name})

        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("X-Accel-Redirect", response)

    def test_get_media_with_share_token(self):
        """Test accessing media with share token"""
        import secrets

        share_token = secrets.token_urlsafe(32)
        group = VideoGroup.objects.create(
            user=self.user, name="Test Group", description="Test", share_token=share_token
        )
        VideoGroupMember.objects.create(group=group, video=self.video, order=0)

        # Don't force authenticate - use share token instead
        self.client.force_authenticate(user=None)
        url = reverse("app:protected_media", kwargs={"path": self.video.file.name})
        url += f"?share_token={share_token}"

        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("X-Accel-Redirect", response)

    def test_get_media_unauthorized(self):
        """Test accessing media without authentication"""
        # Don't authenticate
        self.client.force_authenticate(user=None)
        url = reverse("app:protected_media", kwargs={"path": self.video.file.name})

        response = self.client.get(url)

        # Should return 401 (Unauthorized) because authentication failed
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_get_media_wrong_user(self):
        """Test accessing media with wrong user"""
        other_user = User.objects.create_user(
            username="otheruser",
            email="other@example.com",
            password="testpass123",
        )
        self.client.force_authenticate(user=other_user)
        url = reverse("app:protected_media", kwargs={"path": self.video.file.name})

        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_get_media_share_token_wrong_group(self):
        """Test accessing media with share token for wrong group"""
        import secrets

        share_token = secrets.token_urlsafe(32)
        # Create group but don't add video to it
        VideoGroup.objects.create(
            user=self.user, name="Test Group", description="Test", share_token=share_token
        )

        # Don't force authenticate - use share token instead
        self.client.force_authenticate(user=None)
        url = reverse("app:protected_media", kwargs={"path": self.video.file.name})
        url += f"?share_token={share_token}"

        response = self.client.get(url)

        # Share token authentication succeeds, but video is not in group, so 404
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_get_media_file_not_found(self):
        """Test accessing non-existent file"""
        self.client.force_authenticate(user=self.user)
        url = reverse("app:protected_media", kwargs={"path": "nonexistent.mp4"})

        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_get_media_video_not_found(self):
        """Test accessing file that doesn't belong to any video"""
        self.client.force_authenticate(user=self.user)
        # Create a file that doesn't belong to any video
        other_file = SimpleUploadedFile(
            "other.mp4", b"content", content_type="video/mp4"
        )
        file_path = os.path.join(self.video.file.storage.location, other_file.name)
        os.makedirs(os.path.dirname(file_path), exist_ok=True)
        with open(file_path, "wb") as f:
            f.write(other_file.read())

        url = reverse("app:protected_media", kwargs={"path": other_file.name})

        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

        # Cleanup
        if os.path.exists(file_path):
            os.remove(file_path)

    @patch("app.media.views.mimetypes.guess_type")
    def test_get_media_content_type(self, mock_guess_type):
        """Test that Content-Type header is set correctly"""
        mock_guess_type.return_value = ("video/mp4", None)
        self.client.force_authenticate(user=self.user)
        url = reverse("app:protected_media", kwargs={"path": self.video.file.name})

        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response["Content-Type"], "video/mp4")

