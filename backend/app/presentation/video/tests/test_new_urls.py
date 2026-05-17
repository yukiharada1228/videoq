"""
TDD tests for new REST URL patterns in video domain (issue #651).
"""

from unittest.mock import patch

from django.apps import apps
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

User = get_user_model()
Video = apps.get_model("app", "Video")
VideoGroup = apps.get_model("app", "VideoGroup")
VideoGroupMember = apps.get_model("app", "VideoGroupMember")


class VideoUploadsUrlTests(APITestCase):
    """POST /api/videos/uploads/ replaces /api/videos/upload-request/"""

    def setUp(self):
        self.user = User.objects.create_user(
            username="upload_url_user",
            email="upload_url@example.com",
            password="testpass123",
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_post_to_uploads_url_resolves(self):
        """POST /api/videos/uploads/ URL must resolve (new name: video-uploads)."""
        url = reverse("video-uploads")
        self.assertIsNotNone(url)
        self.assertIn("uploads", url)

    def test_old_upload_request_url_no_longer_exists(self):
        """POST /api/videos/upload-request/ should return 404 (old URL removed)."""
        with self.assertRaises(Exception):
            reverse("video-upload-request")


class VideoConfirmUploadViaPatchTests(APITestCase):
    """PATCH /api/videos/{pk}/ with {"status": "uploaded"} replaces POST /upload-complete/"""

    def setUp(self):
        self.user = User.objects.create_user(
            username="confirm_upload_user",
            email="confirm_upload@example.com",
            password="testpass123",
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.video = Video.objects.create(
            user=self.user,
            title="Test Video",
            description="",
            status="uploading",
        )

    @patch("app.entrypoints.tasks.transcription.transcribe_video.delay")
    def test_patch_with_status_uploaded_confirms_upload(self, _mock_delay):
        """PATCH /api/videos/{pk}/ with {"status": "uploaded"} triggers upload confirm."""
        url = reverse("video-detail", kwargs={"pk": self.video.id})
        response = self.client.patch(url, {"status": "uploaded"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.video.refresh_from_db()
        self.assertEqual(self.video.status, "pending")

    def test_old_upload_complete_url_no_longer_exists(self):
        """POST /api/videos/{pk}/upload-complete/ should no longer be registered."""
        with self.assertRaises(Exception):
            reverse("video-upload-complete", kwargs={"pk": self.video.id})


class GroupVideoDetailUrlNameTests(APITestCase):
    """URL name 'add-video-to-group' renamed to 'group-video-detail'."""

    def setUp(self):
        self.user = User.objects.create_user(
            username="group_video_user",
            email="group_video@example.com",
            password="testpass123",
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.group = VideoGroup.objects.create(
            user=self.user, name="G", description=""
        )
        self.video = Video.objects.create(
            user=self.user, title="V", description="", status="completed"
        )

    def test_group_video_detail_url_name_resolves(self):
        """URL name 'group-video-detail' must be registered."""
        url = reverse(
            "group-video-detail",
            kwargs={"group_id": self.group.id, "video_id": self.video.id},
        )
        self.assertIsNotNone(url)

    def test_old_add_video_to_group_url_name_no_longer_exists(self):
        """Old URL name 'add-video-to-group' must be removed."""
        with self.assertRaises(Exception):
            reverse(
                "add-video-to-group",
                kwargs={"group_id": self.group.id, "video_id": self.video.id},
            )

    def test_post_via_group_video_detail_adds_video(self):
        url = reverse(
            "group-video-detail",
            kwargs={"group_id": self.group.id, "video_id": self.video.id},
        )
        response = self.client.post(url)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_delete_via_group_video_detail_returns_204(self):
        """DELETE /api/videos/groups/{group_id}/videos/{video_id}/ returns 204."""
        VideoGroupMember.objects.create(
            group=self.group, video=self.video, order=0
        )
        url = reverse(
            "group-video-detail",
            kwargs={"group_id": self.group.id, "video_id": self.video.id},
        )
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)


class ShareLinkDeleteReturns204Tests(APITestCase):
    """DELETE /api/videos/groups/{group_id}/share/ returns 204."""

    def setUp(self):
        self.user = User.objects.create_user(
            username="share_delete_user",
            email="share_delete@example.com",
            password="testpass123",
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.group = VideoGroup.objects.create(
            user=self.user,
            name="G",
            description="",
            share_slug="test-share-slug",
        )

    def test_delete_share_link_returns_204(self):
        url = reverse("create-share-link", kwargs={"group_id": self.group.id})
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
