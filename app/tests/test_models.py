from django.test import TestCase, override_settings
from django.contrib.auth import get_user_model
from app.models import Video, VideoGroup, VideoGroupMember, Tag
from django.core.files.base import ContentFile


@override_settings(
    DEBUG=True,
    BASIC_AUTH_ENABLED=False,
    USE_S3=False,
    SECRET_KEY="test_secret",
    MEDIA_ROOT="/tmp/videoq_test_media",
    DATABASES={"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": ":memory:"}},
)
class ModelTests(TestCase):
    def setUp(self):
        self.User = get_user_model()
        self.user = self.User.objects.create_user(
            username="alice", email="a@example.com", password="pass"
        )

    def _fake_video_file(self):
        content = ContentFile(b"fake video data")
        content.name = "sample.mp4"
        return content

    def test_user_video_limit_default(self):
        # Fix settings.DEFAULT_MAX_VIDEOS_PER_USER to 100
        with self.settings(DEFAULT_MAX_VIDEOS_PER_USER=100):
            self.assertEqual(self.user.get_video_limit(), 100)

    def test_video_crud_and_group_membership(self):
        # Create Tag
        tag = Tag.objects.create(user=self.user, name="Math")

        # Create Video
        video = Video.objects.create(
            user=self.user,
            file=self._fake_video_file(),
            title="Test Video",
            description="Description",
            status="completed",
        )
        video.tags.add(tag)

        # Create Group and add
        group = VideoGroup.objects.create(user=self.user, name="Class", description="")
        member = VideoGroupMember.objects.create(group=group, video=video)

        self.assertEqual(group.video_count, 1)
        self.assertIn(video, group.completed_videos)
        self.assertEqual(str(member), f"{video.title} in {group.name}")

        # Deleting group member should not delete video
        member.delete()
        self.assertEqual(Video.objects.count(), 1)
