from unittest.mock import patch

from django.apps import apps
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

User = get_user_model()
Tag = apps.get_model("app", "Tag")
Video = apps.get_model("app", "Video")
VideoGroup = apps.get_model("app", "VideoGroup")
VideoGroupMember = apps.get_model("app", "VideoGroupMember")


class VideoGroupAPITestCase(APITestCase):
    """VideoGroup API tests"""

    def setUp(self):
        """Prepare test data"""
        self.user = User.objects.create_user(
            username="testuser",
            email="testuser@example.com",
            password="testpass123",
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_create_video_group(self):
        """Test group creation"""
        url = reverse("video-group-list")
        data = {"name": "Test Group", "description": "Test Description"}
        response = self.client.post(url, data, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn("id", response.data)
        self.assertEqual(response.data["name"], "Test Group")
        self.assertEqual(response.data["description"], "Test Description")
        self.assertEqual(response.data["video_count"], 0)
        self.assertIn("created_at", response.data)
        self.assertIn("videos", response.data)
        self.assertEqual(response.data["videos"], [])
        self.assertEqual(VideoGroup.objects.count(), 1)
        group = VideoGroup.objects.get()
        self.assertEqual(group.name, "Test Group")
        self.assertEqual(group.user, self.user)

    def test_list_video_groups(self):
        """Test retrieving group list"""
        VideoGroup.objects.create(user=self.user, name="Group 1")
        VideoGroup.objects.create(user=self.user, name="Group 2")

        url = reverse("video-group-list")
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 2)
        # Verify video_count is included
        self.assertIn("video_count", response.data[0])

    def test_get_video_group_detail(self):
        """Test retrieving group details"""
        group = VideoGroup.objects.create(user=self.user, name="Test Group")

        url = reverse("video-group-detail", kwargs={"pk": group.pk})
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["name"], "Test Group")
        self.assertIn("video_count", response.data)
        self.assertIn("videos", response.data)

    def test_update_video_group(self):
        """Test group update"""
        group = VideoGroup.objects.create(user=self.user, name="Test Group")

        url = reverse("video-group-detail", kwargs={"pk": group.pk})
        data = {"name": "Updated Group", "description": "Updated Description"}
        response = self.client.patch(url, data, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["id"], group.id)
        self.assertEqual(response.data["name"], "Updated Group")
        self.assertIn("video_count", response.data)
        self.assertIn("videos", response.data)
        group.refresh_from_db()
        self.assertEqual(group.name, "Updated Group")
        self.assertEqual(group.description, "Updated Description")

    def test_delete_video_group(self):
        """Test group deletion"""
        group = VideoGroup.objects.create(user=self.user, name="Test Group")

        url = reverse("video-group-detail", kwargs={"pk": group.pk})
        response = self.client.delete(url)

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(VideoGroup.objects.count(), 0)

    def test_404_error_on_invalid_group_id(self):
        """Verify 404 error is returned for non-existent group ID"""
        url = reverse("video-group-detail", kwargs={"pk": 99999})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class VideoGroupMemberAPITestCase(APITestCase):
    """VideoGroupMember API tests"""

    def setUp(self):
        """Prepare test data"""
        self.user = User.objects.create_user(
            username="testuser",
            email="member@example.com",
            password="testpass123",
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

        # Create test video and group
        self.video = Video.objects.create(
            user=self.user,
            title="Test Video",
            description="Test Description",
            status="pending",
        )
        self.group = VideoGroup.objects.create(
            user=self.user, name="Test Group", description="Test Description"
        )

    def test_add_video_to_group(self):
        """Test adding video to group"""
        url = reverse(
            "add-video-to-group",
            kwargs={"group_id": self.group.pk, "video_id": self.video.pk},
        )
        response = self.client.post(url)

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(VideoGroupMember.objects.count(), 1)
        member = VideoGroupMember.objects.get()
        self.assertEqual(member.group, self.group)
        self.assertEqual(member.video, self.video)

    def test_add_video_to_group_duplicate(self):
        """Test error when trying to add the same video multiple times"""
        VideoGroupMember.objects.create(group=self.group, video=self.video)

        url = reverse(
            "add-video-to-group",
            kwargs={"group_id": self.group.pk, "video_id": self.video.pk},
        )
        response = self.client.post(url)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(VideoGroupMember.objects.count(), 1)

    def test_add_multiple_videos_to_group(self):
        """Test adding multiple videos in bulk"""
        video2 = Video.objects.create(
            user=self.user,
            title="Test Video 2",
            description="Test Description 2",
            status="pending",
        )
        video3 = Video.objects.create(
            user=self.user,
            title="Test Video 3",
            description="Test Description 3",
            status="pending",
        )

        url = reverse("add-videos-to-group", kwargs={"group_id": self.group.pk})
        data = {"video_ids": [self.video.pk, video2.pk, video3.pk]}
        response = self.client.post(url, data, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(VideoGroupMember.objects.count(), 3)
        self.assertEqual(response.data["added_count"], 3)
        self.assertEqual(response.data["skipped_count"], 0)

    def test_remove_video_from_group(self):
        """Test removing video from group"""
        VideoGroupMember.objects.create(group=self.group, video=self.video)

        url = reverse(
            "remove-video-from-group",
            kwargs={"group_id": self.group.pk, "video_id": self.video.pk},
        )
        response = self.client.delete(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(VideoGroupMember.objects.count(), 0)

    def test_remove_video_from_group_not_member(self):
        """Test error when trying to remove video not in the group"""
        url = reverse(
            "remove-video-from-group",
            kwargs={"group_id": self.group.pk, "video_id": self.video.pk},
        )
        response = self.client.delete(url)

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(VideoGroupMember.objects.count(), 0)

    def test_video_group_detail_with_members(self):
        """Test group details with videos"""
        VideoGroupMember.objects.create(group=self.group, video=self.video, order=0)

        url = reverse("video-group-detail", kwargs={"pk": self.group.pk})
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["video_count"], 1)
        self.assertEqual(len(response.data["videos"]), 1)
        self.assertEqual(response.data["videos"][0]["title"], "Test Video")


class VideoGroupPermissionTestCase(APITestCase):
    """VideoGroup permission restriction tests"""

    def setUp(self):
        """Prepare test data"""
        self.user1 = User.objects.create_user(
            username="user1", email="user1@example.com", password="testpass123"
        )
        self.user2 = User.objects.create_user(
            username="user2", email="user2@example.com", password="testpass123"
        )

        # Create user1's group
        self.group = VideoGroup.objects.create(
            user=self.user1, name="User1 Group", description="Test Description"
        )

        self.client1 = APIClient()
        self.client1.force_authenticate(user=self.user1)

        self.client2 = APIClient()
        self.client2.force_authenticate(user=self.user2)

    def test_user_can_only_see_own_groups(self):
        """Users can only see their own groups"""
        # user1 has one group
        # user2 creates a separate group
        VideoGroup.objects.create(user=self.user2, name="User2 Group")

        url = reverse("video-group-list")
        response = self.client1.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["name"], "User1 Group")

    def test_user_cannot_access_other_user_group(self):
        """Users cannot access other users' groups"""
        url = reverse("video-group-detail", kwargs={"pk": self.group.pk})
        response = self.client2.get(url)

        # Returns 404 due to lack of ownership
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_user_cannot_delete_other_user_group(self):
        """Users cannot delete other users' groups"""
        url = reverse("video-group-detail", kwargs={"pk": self.group.pk})
        response = self.client2.delete(url)

        # Returns 404 due to lack of ownership
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(VideoGroup.objects.count(), 1)


class VideoListViewTests(APITestCase):
    """Tests for VideoListView search, filter, and ordering"""

    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

        # Create test videos
        self.video1 = Video.objects.create(
            user=self.user,
            title="Python Tutorial",
            description="Learn Python programming",
            status="completed",
        )
        self.video2 = Video.objects.create(
            user=self.user,
            title="Django Guide",
            description="Django framework tutorial",
            status="pending",
        )
        self.video3 = Video.objects.create(
            user=self.user,
            title="JavaScript Basics",
            description="JavaScript programming basics",
            status="completed",
        )

    def test_list_videos_with_search(self):
        """Test video list with search query"""
        url = reverse("video-list")
        response = self.client.get(url, {"q": "Python"})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["title"], "Python Tutorial")

    def test_list_videos_with_status_filter(self):
        """Test video list with status filter"""
        url = reverse("video-list")
        response = self.client.get(url, {"status": "completed"})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 2)
        for video in response.data:
            self.assertEqual(video["status"], "completed")

    def test_list_videos_with_ordering(self):
        """Test video list with ordering"""
        url = reverse("video-list")
        response = self.client.get(url, {"ordering": "title_asc"})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 3)
        self.assertEqual(response.data[0]["title"], "Django Guide")
        self.assertEqual(response.data[1]["title"], "JavaScript Basics")
        self.assertEqual(response.data[2]["title"], "Python Tutorial")

    def test_list_videos_with_combined_filters(self):
        """Test video list with search and status filter"""
        url = reverse("video-list")
        response = self.client.get(url, {"q": "Django", "status": "pending"})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["title"], "Django Guide")


class VideoDetailViewTests(APITestCase):
    """Tests for VideoDetailView update and delete"""

    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

        self.video = Video.objects.create(
            user=self.user,
            title="Original Title",
            description="Original Description",
            status="completed",
        )

    @patch("app.infrastructure.external.vector_gateway.update_video_title_in_vectors")
    def test_update_video_title_updates_pgvector(self, mock_update):
        """Test that updating video title updates PGVector"""
        url = reverse("video-detail", kwargs={"pk": self.video.pk})
        data = {"title": "Updated Title"}

        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.patch(url, data, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["id"], self.video.id)
        self.assertEqual(response.data["title"], "Updated Title")
        self.assertEqual(response.data["user"], self.user.id)
        self.assertIn("status", response.data)
        self.video.refresh_from_db()
        self.assertEqual(self.video.title, "Updated Title")
        mock_update.assert_called_once_with(self.video.id, "Updated Title")

    def test_update_video_without_title_change(self):
        """Test that updating video without title change doesn't update PGVector"""
        url = reverse("video-detail", kwargs={"pk": self.video.pk})
        data = {"description": "Updated Description"}

        response = self.client.patch(url, data, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["id"], self.video.id)
        self.assertEqual(response.data["description"], "Updated Description")
        self.assertEqual(response.data["user"], self.user.id)
        self.video.refresh_from_db()
        self.assertEqual(self.video.description, "Updated Description")
        self.assertEqual(self.video.title, "Original Title")


class TagViewTests(APITestCase):
    """Tests for tag responses and related delete behaviors."""

    def setUp(self):
        self.user = User.objects.create_user(
            username="taguser",
            email="taguser@example.com",
            password="testpass123",
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.video = Video.objects.create(
            user=self.user,
            title="Tag Test Video",
            description="Video used in tag tests",
            status="completed",
        )

    def test_update_tag_returns_id(self):
        """Test tag update response includes id."""
        tag = Tag.objects.create(user=self.user, name="Tag 1", color="#111111")
        url = reverse("tag-detail", kwargs={"pk": tag.pk})

        response = self.client.patch(
            url,
            {"name": "Tag 2", "color": "#222222"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["id"], tag.id)
        self.assertEqual(response.data["name"], "Tag 2")
        self.assertIn("created_at", response.data)
        self.assertIn("videos", response.data)
        self.assertEqual(response.data["videos"], [])

    def test_create_tag_returns_metadata(self):
        """Test tag create response includes metadata."""
        url = reverse("tag-list")

        response = self.client.post(
            url,
            {"name": "Tag 1", "color": "#111111"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn("id", response.data)
        self.assertEqual(response.data["name"], "Tag 1")
        self.assertIn("created_at", response.data)
        self.assertEqual(response.data["video_count"], 0)

    def test_create_tag_returns_400_for_invalid_color(self):
        """Invalid tag color should be rejected at use-case/domain boundary."""
        url = reverse("tag-list")
        response = self.client.post(
            url,
            {"name": "Tag 1", "color": "red"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.data["error"]["message"], "Invalid color format. Use #RRGGBB"
        )

    def test_update_tag_returns_400_for_whitespace_name(self):
        """Whitespace-only tag name should be rejected at use-case/domain boundary."""
        tag = Tag.objects.create(user=self.user, name="Tag 1", color="#111111")
        url = reverse("tag-detail", kwargs={"pk": tag.pk})
        response = self.client.patch(
            url,
            {"name": "   "},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["error"]["message"], "Tag name cannot be empty")

    @patch("app.infrastructure.external.vector_gateway.delete_video_vectors")
    def test_delete_video_deletes_vectors(self, mock_delete):
        """Test that deleting video deletes vectors and performs hard delete"""
        url = reverse("video-detail", kwargs={"pk": self.video.pk})
        video_id = self.video.id

        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.delete(url)

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        # Video should be hard deleted (record no longer exists)
        self.assertFalse(Video.objects.filter(pk=self.video.pk).exists())
        # delete_video_vectors is called once via DeleteVideoUseCase
        self.assertEqual(mock_delete.call_count, 1)
        self.assertEqual(mock_delete.call_args_list[0][0][0], video_id)

    @patch("app.infrastructure.external.vector_gateway.delete_video_vectors")
    def test_delete_video_vector_error_handling(self, mock_delete):
        """Test that vector deletion error doesn't prevent video hard delete"""
        mock_delete.side_effect = Exception("Vector deletion failed")
        url = reverse("video-detail", kwargs={"pk": self.video.pk})

        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.delete(url)

        # Video should still be hard deleted even if vector deletion fails
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        # Video should be hard deleted (record no longer exists)
        self.assertFalse(Video.objects.filter(pk=self.video.pk).exists())

    @patch("app.infrastructure.external.vector_gateway.delete_video_vectors")
    def test_delete_video_removes_from_groups(self, mock_delete):
        """Test that deleting video removes it from all groups"""
        # Create groups and add video to them
        group1 = VideoGroup.objects.create(user=self.user, name="Group 1")
        group2 = VideoGroup.objects.create(user=self.user, name="Group 2")
        VideoGroupMember.objects.create(group=group1, video=self.video)
        VideoGroupMember.objects.create(group=group2, video=self.video)

        # Verify video is in both groups
        self.assertEqual(VideoGroupMember.objects.filter(video=self.video).count(), 2)

        url = reverse("video-detail", kwargs={"pk": self.video.pk})
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.delete(url)

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        # Video should be removed from all groups
        self.assertEqual(VideoGroupMember.objects.filter(video=self.video).count(), 0)
        # Groups should still exist
        self.assertEqual(
            VideoGroup.objects.filter(pk__in=[group1.pk, group2.pk]).count(), 2
        )


class ShareLinkTests(APITestCase):
    """Tests for share link functionality"""

    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

        self.group = VideoGroup.objects.create(
            user=self.user, name="Test Group", description="Test"
        )

    def test_create_share_link(self):
        """Test creating a share link"""
        url = reverse("create-share-link", kwargs={"group_id": self.group.pk})

        response = self.client.post(url)

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn("share_token", response.data)
        self.group.refresh_from_db()
        self.assertIsNotNone(self.group.share_token)

    def test_delete_share_link(self):
        """Test deleting a share link"""
        import secrets

        self.group.share_token = secrets.token_urlsafe(32)
        self.group.save()

        url = reverse("delete-share-link", kwargs={"group_id": self.group.pk})

        response = self.client.delete(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.group.refresh_from_db()
        self.assertIsNone(self.group.share_token)

    def test_get_shared_group(self):
        """Test getting shared group by token"""
        import secrets

        share_token = secrets.token_urlsafe(32)
        self.group.share_token = share_token
        self.group.save()

        url = reverse("get-shared-group", kwargs={"share_token": share_token})

        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["name"], "Test Group")

    def test_get_shared_group_not_found(self):
        """Test getting shared group with invalid token"""
        url = reverse("get-shared-group", kwargs={"share_token": "invalid-token"})

        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class ReorderVideosTests(APITestCase):
    """Tests for reordering videos in group"""

    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

        self.group = VideoGroup.objects.create(
            user=self.user, name="Test Group", description="Test"
        )
        self.video1 = Video.objects.create(
            user=self.user, title="Video 1", status="completed"
        )
        self.video2 = Video.objects.create(
            user=self.user, title="Video 2", status="completed"
        )
        self.video3 = Video.objects.create(
            user=self.user, title="Video 3", status="completed"
        )

        VideoGroupMember.objects.create(group=self.group, video=self.video1, order=0)
        VideoGroupMember.objects.create(group=self.group, video=self.video2, order=1)
        VideoGroupMember.objects.create(group=self.group, video=self.video3, order=2)

    def test_reorder_videos(self):
        """Test reordering videos in group"""
        url = reverse("reorder-videos-in-group", kwargs={"group_id": self.group.pk})
        data = {"video_ids": [self.video3.pk, self.video1.pk, self.video2.pk]}

        response = self.client.patch(url, data, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.video1.refresh_from_db()
        self.video2.refresh_from_db()
        self.video3.refresh_from_db()

        member1 = VideoGroupMember.objects.get(group=self.group, video=self.video1)
        member2 = VideoGroupMember.objects.get(group=self.group, video=self.video2)
        member3 = VideoGroupMember.objects.get(group=self.group, video=self.video3)

        self.assertEqual(member1.order, 1)
        self.assertEqual(member2.order, 2)
        self.assertEqual(member3.order, 0)


class VideoUploadTests(APITestCase):
    """Tests for video upload"""

    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
            video_limit=None,
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    @patch("app.presentation.video.serializers.validate_video_media_file")
    @patch("app.infrastructure.tasks.task_gateway.current_app.send_task")
    def test_upload(self, mock_task, mock_validate_video):
        """Test video upload"""
        from io import BytesIO

        from django.core.files.uploadedfile import SimpleUploadedFile

        mock_validate_video.return_value = {
            "format": {"format_name": "mp4", "duration": "60.0"},
            "streams": [{"codec_type": "video", "codec_name": "h264"}],
        }

        video_file = SimpleUploadedFile(
            "test_video.mp4",
            BytesIO(b"fake video content").read(),
            content_type="video/mp4",
        )

        url = reverse("video-list")
        data = {
            "file": video_file,
            "title": "Test Video",
            "description": "Test Description",
        }

        response = self.client.post(url, data, format="multipart")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn("id", response.data)
        self.assertEqual(response.data["title"], "Test Video")
        self.assertEqual(response.data["user"], self.user.id)
        self.assertIn("status", response.data)
        self.assertEqual(Video.objects.count(), 1)

        video = Video.objects.first()
        self.assertEqual(video.title, "Test Video")

    @patch("app.presentation.video.serializers.validate_video_media_file")
    @patch("app.infrastructure.tasks.task_gateway.current_app.send_task")
    def test_upload_rejects_invalid_media_payload(self, mock_task, mock_validate_video):
        """Test video upload rejects files that fail ffprobe validation"""
        from io import BytesIO

        from django.core.files.uploadedfile import SimpleUploadedFile

        from app.infrastructure.transcription.audio_processing import InvalidMediaFileError

        mock_validate_video.side_effect = InvalidMediaFileError(
            "Uploaded file is not a valid video."
        )

        video_file = SimpleUploadedFile(
            "test_video.mp4",
            BytesIO(b"not actually a video").read(),
            content_type="video/mp4",
        )

        url = reverse("video-list")
        response = self.client.post(
            url,
            {"file": video_file, "title": "Test Video"},
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Uploaded file is not a valid video.", str(response.data))
        self.assertEqual(Video.objects.count(), 0)
        mock_task.assert_not_called()


class VideoLimitTests(APITestCase):
    """Tests for video upload limit functionality"""

    def setUp(self):
        self.client = APIClient()

    def _create_video_file(self):
        """Helper method to create a test video file"""
        from io import BytesIO

        from django.core.files.uploadedfile import SimpleUploadedFile

        return SimpleUploadedFile(
            "test_video.mp4",
            BytesIO(b"fake video content").read(),
            content_type="video/mp4",
        )

    @patch("app.presentation.video.serializers.validate_video_media_file")
    @patch("app.infrastructure.tasks.task_gateway.current_app.send_task")
    def test_upload_with_unlimited_video_limit(self, mock_task, mock_validate_video):
        """Test video upload when video_limit is None (unlimited)"""
        mock_validate_video.return_value = {
            "format": {"format_name": "mp4", "duration": "60.0"},
            "streams": [{"codec_type": "video", "codec_name": "h264"}],
        }
        user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
            video_limit=None,  # Unlimited
        )
        self.client.force_authenticate(user=user)

        # Create 3 videos
        for i in range(3):
            url = reverse("video-list")
            data = {
                "file": self._create_video_file(),
                "title": f"Test Video {i}",
                "description": "Test Description",
            }
            response = self.client.post(url, data, format="multipart")
            self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        self.assertEqual(Video.objects.filter(user=user).count(), 3)

    @patch("app.presentation.video.serializers.validate_video_media_file")
    @patch("app.infrastructure.tasks.task_gateway.current_app.send_task")
    def test_upload_with_zero_video_limit(self, mock_task, mock_validate_video):
        """Test video upload when video_limit is 0 (no uploads allowed)"""
        mock_validate_video.return_value = {
            "format": {"format_name": "mp4", "duration": "60.0"},
            "streams": [{"codec_type": "video", "codec_name": "h264"}],
        }
        user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
            video_limit=0,  # No uploads allowed
        )
        self.client.force_authenticate(user=user)

        url = reverse("video-list")
        data = {
            "file": self._create_video_file(),
            "title": "Test Video",
            "description": "Test Description",
        }
        response = self.client.post(url, data, format="multipart")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Video upload limit reached", str(response.data))
        self.assertEqual(Video.objects.filter(user=user).count(), 0)

    @patch("app.presentation.video.serializers.validate_video_media_file")
    @patch("app.infrastructure.tasks.task_gateway.current_app.send_task")
    def test_upload_within_video_limit(self, mock_task, mock_validate_video):
        """Test video upload within the limit"""
        mock_validate_video.return_value = {
            "format": {"format_name": "mp4", "duration": "60.0"},
            "streams": [{"codec_type": "video", "codec_name": "h264"}],
        }
        user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
            video_limit=3,
        )
        self.client.force_authenticate(user=user)

        # Upload 2 videos (within limit of 3)
        for i in range(2):
            url = reverse("video-list")
            data = {
                "file": self._create_video_file(),
                "title": f"Test Video {i}",
                "description": "Test Description",
            }
            response = self.client.post(url, data, format="multipart")
            self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        self.assertEqual(Video.objects.filter(user=user).count(), 2)

    @patch("app.presentation.video.serializers.validate_video_media_file")
    @patch("app.infrastructure.tasks.task_gateway.current_app.send_task")
    def test_upload_at_exact_video_limit(self, mock_task, mock_validate_video):
        """Test video upload at exact limit"""
        mock_validate_video.return_value = {
            "format": {"format_name": "mp4", "duration": "60.0"},
            "streams": [{"codec_type": "video", "codec_name": "h264"}],
        }
        user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
            video_limit=2,
        )
        self.client.force_authenticate(user=user)

        # Upload exactly 2 videos (the limit)
        for i in range(2):
            url = reverse("video-list")
            data = {
                "file": self._create_video_file(),
                "title": f"Test Video {i}",
                "description": "Test Description",
            }
            response = self.client.post(url, data, format="multipart")
            self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        self.assertEqual(Video.objects.filter(user=user).count(), 2)

    @patch("app.presentation.video.serializers.validate_video_media_file")
    @patch("app.infrastructure.tasks.task_gateway.current_app.send_task")
    def test_upload_exceeds_video_limit(self, mock_task, mock_validate_video):
        """Test video upload when limit is exceeded"""
        mock_validate_video.return_value = {
            "format": {"format_name": "mp4", "duration": "60.0"},
            "streams": [{"codec_type": "video", "codec_name": "h264"}],
        }
        user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
            video_limit=2,
        )
        self.client.force_authenticate(user=user)

        # Upload 2 videos successfully
        for i in range(2):
            url = reverse("video-list")
            data = {
                "file": self._create_video_file(),
                "title": f"Test Video {i}",
                "description": "Test Description",
            }
            response = self.client.post(url, data, format="multipart")
            self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        # Try to upload the 3rd video (should fail)
        url = reverse("video-list")
        data = {
            "file": self._create_video_file(),
            "title": "Test Video 3",
            "description": "Test Description",
        }
        response = self.client.post(url, data, format="multipart")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Video upload limit reached", str(response.data))
        self.assertEqual(Video.objects.filter(user=user).count(), 2)

    @patch("app.presentation.video.serializers.validate_video_media_file")
    @patch("app.infrastructure.tasks.task_gateway.current_app.send_task")
    def test_upload_after_deleting_video_within_limit(self, mock_task, mock_validate_video):
        """Test video upload after deleting a video to free up space"""
        mock_validate_video.return_value = {
            "format": {"format_name": "mp4", "duration": "60.0"},
            "streams": [{"codec_type": "video", "codec_name": "h264"}],
        }
        user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
            video_limit=2,
        )
        self.client.force_authenticate(user=user)

        # Upload 2 videos
        for i in range(2):
            url = reverse("video-list")
            data = {
                "file": self._create_video_file(),
                "title": f"Test Video {i}",
                "description": "Test Description",
            }
            response = self.client.post(url, data, format="multipart")
            self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        # Delete one video
        video = Video.objects.filter(user=user).first()
        video.delete()
        self.assertEqual(Video.objects.filter(user=user).count(), 1)

        # Now upload should succeed
        url = reverse("video-list")
        data = {
            "file": self._create_video_file(),
            "title": "Test Video 3",
            "description": "Test Description",
        }
        response = self.client.post(url, data, format="multipart")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Video.objects.filter(user=user).count(), 2)
