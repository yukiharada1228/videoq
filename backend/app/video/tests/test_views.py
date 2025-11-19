from unittest.mock import patch

from app.models import Video, VideoGroup, VideoGroupMember
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

User = get_user_model()


class VideoGroupAPITestCase(APITestCase):
    """VideoGroup APIのテスト"""

    def setUp(self):
        """テスト用のデータを準備"""
        self.user = User.objects.create_user(
            username="testuser",
            email="testuser@example.com",
            password="testpass123",
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_create_video_group(self):
        """グループ作成のテスト"""
        url = reverse("video-group-list")
        data = {"name": "Test Group", "description": "Test Description"}
        response = self.client.post(url, data, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(VideoGroup.objects.count(), 1)
        group = VideoGroup.objects.get()
        self.assertEqual(group.name, "Test Group")
        self.assertEqual(group.user, self.user)

    def test_list_video_groups(self):
        """グループ一覧取得のテスト"""
        VideoGroup.objects.create(user=self.user, name="Group 1")
        VideoGroup.objects.create(user=self.user, name="Group 2")

        url = reverse("video-group-list")
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 2)
        # video_countが含まれていることを確認
        self.assertIn("video_count", response.data[0])

    def test_get_video_group_detail(self):
        """グループ詳細取得のテスト"""
        group = VideoGroup.objects.create(user=self.user, name="Test Group")

        url = reverse("video-group-detail", kwargs={"pk": group.pk})
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["name"], "Test Group")
        self.assertIn("video_count", response.data)
        self.assertIn("videos", response.data)

    def test_update_video_group(self):
        """グループ更新のテスト"""
        group = VideoGroup.objects.create(user=self.user, name="Test Group")

        url = reverse("video-group-detail", kwargs={"pk": group.pk})
        data = {"name": "Updated Group", "description": "Updated Description"}
        response = self.client.patch(url, data, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        group.refresh_from_db()
        self.assertEqual(group.name, "Updated Group")
        self.assertEqual(group.description, "Updated Description")

    def test_delete_video_group(self):
        """グループ削除のテスト"""
        group = VideoGroup.objects.create(user=self.user, name="Test Group")

        url = reverse("video-group-detail", kwargs={"pk": group.pk})
        response = self.client.delete(url)

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(VideoGroup.objects.count(), 0)

    def test_404_error_on_invalid_group_id(self):
        """存在しないグループIDで404エラーが返されることを確認"""
        url = reverse("video-group-detail", kwargs={"pk": 99999})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class VideoGroupMemberAPITestCase(APITestCase):
    """VideoGroupMember APIのテスト"""

    def setUp(self):
        """テスト用のデータを準備"""
        self.user = User.objects.create_user(
            username="testuser",
            email="member@example.com",
            password="testpass123",
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

        # テスト用の動画とグループを作成
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
        """動画をグループに追加するテスト"""
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
        """同じ動画を複数回追加しようとした場合のエラーテスト"""
        VideoGroupMember.objects.create(group=self.group, video=self.video)

        url = reverse(
            "add-video-to-group",
            kwargs={"group_id": self.group.pk, "video_id": self.video.pk},
        )
        response = self.client.post(url)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(VideoGroupMember.objects.count(), 1)

    def test_add_multiple_videos_to_group(self):
        """複数の動画を一括追加するテスト"""
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
        """動画をグループから削除するテスト"""
        VideoGroupMember.objects.create(group=self.group, video=self.video)

        url = reverse(
            "remove-video-from-group",
            kwargs={"group_id": self.group.pk, "video_id": self.video.pk},
        )
        response = self.client.delete(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(VideoGroupMember.objects.count(), 0)

    def test_remove_video_from_group_not_member(self):
        """グループに追加されていない動画を削除しようとした場合のエラーテスト"""
        url = reverse(
            "remove-video-from-group",
            kwargs={"group_id": self.group.pk, "video_id": self.video.pk},
        )
        response = self.client.delete(url)

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(VideoGroupMember.objects.count(), 0)

    def test_video_group_detail_with_members(self):
        """動画を含むグループ詳細のテスト"""
        VideoGroupMember.objects.create(group=self.group, video=self.video, order=0)

        url = reverse("video-group-detail", kwargs={"pk": self.group.pk})
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["video_count"], 1)
        self.assertEqual(len(response.data["videos"]), 1)
        self.assertEqual(response.data["videos"][0]["title"], "Test Video")


class VideoGroupPermissionTestCase(APITestCase):
    """VideoGroupの権限制限のテスト"""

    def setUp(self):
        """テスト用のデータを準備"""
        self.user1 = User.objects.create_user(
            username="user1", email="user1@example.com", password="testpass123"
        )
        self.user2 = User.objects.create_user(
            username="user2", email="user2@example.com", password="testpass123"
        )

        # user1のグループを作成
        self.group = VideoGroup.objects.create(
            user=self.user1, name="User1 Group", description="Test Description"
        )

        self.client1 = APIClient()
        self.client1.force_authenticate(user=self.user1)

        self.client2 = APIClient()
        self.client2.force_authenticate(user=self.user2)

    def test_user_can_only_see_own_groups(self):
        """ユーザーは自分のグループのみを確認できる"""
        # user1のグループが1つ
        # user2は別のグループを作成
        VideoGroup.objects.create(user=self.user2, name="User2 Group")

        url = reverse("video-group-list")
        response = self.client1.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["name"], "User1 Group")

    def test_user_cannot_access_other_user_group(self):
        """他のユーザーのグループにアクセスできない"""
        url = reverse("video-group-detail", kwargs={"pk": self.group.pk})
        response = self.client2.get(url)

        # 所有権がないので404を返す
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_user_cannot_delete_other_user_group(self):
        """他のユーザーのグループを削除できない"""
        url = reverse("video-group-detail", kwargs={"pk": self.group.pk})
        response = self.client2.delete(url)

        # 所有権がないので404を返す
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(VideoGroup.objects.count(), 1)


class VideoUploadLimitTestCase(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="limituser",
            email="limituser@example.com",
            password="testpass123",
        )
        self.user.video_limit = 1
        self.user.save(update_fields=["video_limit"])

        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.url = reverse("video-list")

    def _upload_video(self, title="Test Video"):
        file_content = b"dummy video content"
        upload_file = SimpleUploadedFile(
            "test_video.mp4",
            file_content,
            content_type="video/mp4",
        )
        data = {
            "file": upload_file,
            "title": title,
            "description": "Test description",
        }
        return self.client.post(self.url, data, format="multipart")

    def test_video_creation_respects_limit(self):
        first_response = self._upload_video(title="Video 1")
        self.assertEqual(first_response.status_code, status.HTTP_201_CREATED)

        second_response = self._upload_video(title="Video 2")
        self.assertEqual(second_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("detail", second_response.data)
        self.assertEqual(Video.objects.filter(user=self.user).count(), 1)


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

    @patch("app.utils.vector_manager.update_video_title_in_vectors")
    def test_update_video_title_updates_pgvector(self, mock_update):
        """Test that updating video title updates PGVector"""
        url = reverse("video-detail", kwargs={"pk": self.video.pk})
        data = {"title": "Updated Title"}

        response = self.client.patch(url, data, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.video.refresh_from_db()
        self.assertEqual(self.video.title, "Updated Title")
        mock_update.assert_called_once_with(self.video.id, "Updated Title")

    def test_update_video_without_title_change(self):
        """Test that updating video without title change doesn't update PGVector"""
        url = reverse("video-detail", kwargs={"pk": self.video.pk})
        data = {"description": "Updated Description"}

        response = self.client.patch(url, data, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.video.refresh_from_db()
        self.assertEqual(self.video.description, "Updated Description")
        self.assertEqual(self.video.title, "Original Title")

    @patch("app.utils.vector_manager.delete_video_vectors")
    def test_delete_video_deletes_vectors(self, mock_delete):
        """Test that deleting video deletes vectors"""
        url = reverse("video-detail", kwargs={"pk": self.video.pk})
        video_id = self.video.id

        response = self.client.delete(url)

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Video.objects.filter(pk=self.video.pk).exists())
        # delete_video_vectors is called twice: once in destroy() and once in post_delete signal
        self.assertEqual(mock_delete.call_count, 2)
        # Both calls should be with the same video_id
        self.assertEqual(mock_delete.call_args_list[0][0][0], video_id)
        self.assertEqual(mock_delete.call_args_list[1][0][0], video_id)

    @patch("app.utils.vector_manager.delete_video_vectors")
    def test_delete_video_vector_error_handling(self, mock_delete):
        """Test that vector deletion error doesn't prevent video deletion"""
        mock_delete.side_effect = Exception("Vector deletion failed")
        url = reverse("video-detail", kwargs={"pk": self.video.pk})

        response = self.client.delete(url)

        # Video should still be deleted even if vector deletion fails
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Video.objects.filter(pk=self.video.pk).exists())


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


class WhisperUsageLimitTestCase(APITestCase):
    """Tests for Whisper monthly usage limit (1,200 minutes = 20 hours)"""

    def setUp(self):
        self.user = User.objects.create_user(
            username="whisperuser",
            email="whisperuser@example.com",
            password="testpass123",
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.url = reverse("video-list")

    @patch("app.video.serializers.VideoCreateSerializer._get_video_duration_minutes")
    def test_whisper_usage_limit_enforced(self, mock_get_duration):
        """Test that Whisper usage limit is enforced when uploading videos"""
        # Mock _get_video_duration_minutes to return 601 minutes (to exceed limit)
        mock_get_duration.return_value = 601.0  # 601 minutes

        # Create a video with 600 minutes already used this month
        from django.utils import timezone
        from datetime import timedelta

        now = timezone.now()
        first_day_of_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

        # Create a video with 600 minutes duration
        Video.objects.create(
            user=self.user,
            title="Existing Video",
            description="Test",
            status="completed",
            duration_minutes=600.0,
            uploaded_at=first_day_of_month + timedelta(days=1),
        )

        # Try to upload a video that would exceed the limit (600 + 601 = 1201 > 1200)
        file_content = b"dummy video content"
        upload_file = SimpleUploadedFile(
            "test_video.mp4",
            file_content,
            content_type="video/mp4",
        )
        data = {
            "file": upload_file,
            "title": "New Video",
            "description": "Test description",
        }

        response = self.client.post(self.url, data, format="multipart")

        # Should fail with validation error
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("detail", response.data)
        self.assertIn("Monthly Whisper usage limit", str(response.data["detail"]))

        # Video should be deleted
        self.assertFalse(Video.objects.filter(title="New Video").exists())

    @patch("app.video.serializers.VideoCreateSerializer._get_video_duration_minutes")
    def test_whisper_usage_limit_within_limit(self, mock_get_duration):
        """Test that video upload succeeds when within Whisper usage limit"""
        # Mock _get_video_duration_minutes to return 100 minutes
        mock_get_duration.return_value = 100.0  # 100 minutes

        # Create a video with 500 minutes already used this month
        from django.utils import timezone
        from datetime import timedelta

        now = timezone.now()
        first_day_of_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

        Video.objects.create(
            user=self.user,
            title="Existing Video",
            description="Test",
            status="completed",
            duration_minutes=500.0,
            uploaded_at=first_day_of_month + timedelta(days=1),
        )

        # Upload a video with 100 minutes (500 + 100 = 600, which is < 1200)
        file_content = b"dummy video content"
        upload_file = SimpleUploadedFile(
            "test_video.mp4",
            file_content,
            content_type="video/mp4",
        )
        data = {
            "file": upload_file,
            "title": "New Video",
            "description": "Test description",
        }

        response = self.client.post(self.url, data, format="multipart")

        # Should succeed
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    @patch("app.video.serializers.VideoCreateSerializer._get_video_duration_minutes")
    def test_whisper_usage_limit_only_counts_current_month(self, mock_get_duration):
        """Test that only videos from current month are counted"""
        # Mock _get_video_duration_minutes to return 100 minutes
        mock_get_duration.return_value = 100.0  # 100 minutes

        from django.utils import timezone
        from datetime import timedelta

        # Create a video from last month (should not be counted)
        last_month = timezone.now().replace(day=1, hour=0, minute=0, second=0, microsecond=0) - timedelta(days=1)
        last_month_first_day = last_month.replace(day=1)

        Video.objects.create(
            user=self.user,
            title="Last Month Video",
            description="Test",
            status="completed",
            duration_minutes=1200.0,  # This should not count
            uploaded_at=last_month_first_day + timedelta(days=1),
        )

        # Upload a video with 100 minutes (should succeed because last month's video doesn't count)
        file_content = b"dummy video content"
        upload_file = SimpleUploadedFile(
            "test_video.mp4",
            file_content,
            content_type="video/mp4",
        )
        data = {
            "file": upload_file,
            "title": "New Video",
            "description": "Test description",
        }

        response = self.client.post(self.url, data, format="multipart")

        # Should succeed because last month's usage doesn't count
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    @patch("app.video.serializers.VideoCreateSerializer._get_video_duration_minutes")
    def test_get_video_duration_handles_ffprobe_error(self, mock_get_duration):
        """Test that video upload is rejected if duration cannot be determined"""
        # Mock _get_video_duration_minutes to return None (simulating error)
        mock_get_duration.return_value = None

        file_content = b"dummy video content"
        upload_file = SimpleUploadedFile(
            "test_video.mp4",
            file_content,
            content_type="video/mp4",
        )
        data = {
            "file": upload_file,
            "title": "New Video",
            "description": "Test description",
        }

        response = self.client.post(self.url, data, format="multipart")

        # Should fail because we cannot check the Whisper usage limit without duration
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("detail", response.data)
        self.assertIn("Failed to determine video duration", str(response.data["detail"]))
        # Video should be deleted
        self.assertFalse(Video.objects.filter(title="New Video").exists())
