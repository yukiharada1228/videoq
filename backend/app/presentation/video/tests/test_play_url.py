"""API tests for video play URL endpoints."""

from django.apps import apps
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

User = get_user_model()
Video = apps.get_model("app", "Video")
VideoGroup = apps.get_model("app", "VideoGroup")
VideoGroupMember = apps.get_model("app", "VideoGroupMember")


class VideoListNoFileUrlTests(APITestCase):
    """動画一覧レスポンスに署名付きURLが含まれないことを確認する。"""

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
            title="Test Video",
            status="completed",
            file="videos/test/test.mp4",
        )

    def test_video_list_does_not_include_file_url(self):
        """動画一覧の各アイテムに file フィールドが存在しない。"""
        url = reverse("video-list")
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreater(len(response.data["results"]), 0)
        for item in response.data["results"]:
            self.assertNotIn("file", item)


class VideoGroupDetailNoFileUrlTests(APITestCase):
    """グループ詳細レスポンスの動画に署名付きURLが含まれないことを確認する。"""

    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.group = VideoGroup.objects.create(user=self.user, name="Test Group")
        self.video = Video.objects.create(
            user=self.user,
            title="Test Video",
            status="completed",
            file="videos/test/test.mp4",
        )
        VideoGroupMember.objects.create(group=self.group, video=self.video, order=0)

    def test_group_detail_videos_do_not_include_file_url(self):
        """グループ詳細の videos 配列の各アイテムに file フィールドが存在しない。"""
        url = reverse("video-group-detail", kwargs={"pk": self.group.pk})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreater(len(response.data["videos"]), 0)
        for item in response.data["videos"]:
            self.assertNotIn("file", item)

    def test_shared_group_videos_do_not_include_file_url(self):
        """共有グループの videos 配列の各アイテムに file フィールドが存在しない。"""
        self.group.share_slug = "test-share"
        self.group.save(update_fields=["share_slug"])
        url = reverse("get-shared-group", kwargs={"share_slug": "test-share"})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        for item in response.data["videos"]:
            self.assertNotIn("file", item)


class VideoPlayUrlViewTests(APITestCase):
    """GET /api/videos/<id>/play-url/ の認証付き再生URL取得テスト。"""

    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
        )
        self.other_user = User.objects.create_user(
            username="otheruser",
            email="other@example.com",
            password="testpass123",
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.video = Video.objects.create(
            user=self.user,
            title="Test Video",
            status="completed",
            file="videos/test/test.mp4",
        )

    def test_returns_file_url_for_owned_video(self):
        """自分の動画の再生URLを取得できる。"""
        url = reverse("video-play-url", kwargs={"pk": self.video.pk})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("file_url", response.data)
        self.assertIsNotNone(response.data["file_url"])
        self.assertIn("videos/test/test.mp4", response.data["file_url"])

    def test_returns_null_file_url_for_youtube_video(self):
        """YouTube動画（fileなし）はfile_urlがnullで返る。"""
        youtube_video = Video.objects.create(
            user=self.user,
            title="YouTube Video",
            status="completed",
            source_type="youtube",
        )
        url = reverse("video-play-url", kwargs={"pk": youtube_video.pk})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("file_url", response.data)
        self.assertIsNone(response.data["file_url"])

    def test_returns_404_for_nonexistent_video(self):
        """存在しない動画IDは404を返す。"""
        url = reverse("video-play-url", kwargs={"pk": 99999})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_returns_404_for_other_users_video(self):
        """他ユーザーの動画は404を返す。"""
        other_video = Video.objects.create(
            user=self.other_user,
            title="Other Video",
            status="completed",
            file="videos/other/test.mp4",
        )
        url = reverse("video-play-url", kwargs={"pk": other_video.pk})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_returns_401_for_unauthenticated(self):
        """未認証は401を返す。"""
        self.client.force_authenticate(user=None)
        url = reverse("video-play-url", kwargs={"pk": self.video.pk})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class SharedVideoPlayUrlViewTests(APITestCase):
    """GET /api/videos/groups/share/<slug>/videos/<video_id>/play-url/ のテスト。"""

    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
        )
        self.client = APIClient()
        self.group = VideoGroup.objects.create(
            user=self.user, name="Test Group", share_slug="test-share"
        )
        self.video = Video.objects.create(
            user=self.user,
            title="Test Video",
            status="completed",
            file="videos/test/test.mp4",
        )
        VideoGroupMember.objects.create(group=self.group, video=self.video, order=0)

    def test_returns_file_url_for_video_in_shared_group(self):
        """共有グループ内の動画の再生URLを認証なしで取得できる。"""
        url = reverse(
            "shared-video-play-url",
            kwargs={"share_slug": "test-share", "video_id": self.video.pk},
        )
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("file_url", response.data)
        self.assertIsNotNone(response.data["file_url"])
        self.assertIn("videos/test/test.mp4", response.data["file_url"])

    def test_returns_404_for_invalid_slug(self):
        """無効なslugは404を返す。"""
        url = reverse(
            "shared-video-play-url",
            kwargs={"share_slug": "invalid-slug", "video_id": self.video.pk},
        )
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_returns_404_for_video_not_in_group(self):
        """グループに存在しない動画IDは404を返す。"""
        url = reverse(
            "shared-video-play-url",
            kwargs={"share_slug": "test-share", "video_id": 99999},
        )
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_accessible_without_authentication(self):
        """認証なしでもアクセスできる（公開エンドポイント）。"""
        self.client.force_authenticate(user=None)
        url = reverse(
            "shared-video-play-url",
            kwargs={"share_slug": "test-share", "video_id": self.video.pk},
        )
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
