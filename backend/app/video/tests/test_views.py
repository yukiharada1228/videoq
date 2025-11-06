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
            username="testuser", password="testpass123"
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
            username="testuser", password="testpass123"
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
        self.user1 = User.objects.create_user(username="user1", password="testpass123")
        self.user2 = User.objects.create_user(username="user2", password="testpass123")

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
            username="limituser", password="testpass123"
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
