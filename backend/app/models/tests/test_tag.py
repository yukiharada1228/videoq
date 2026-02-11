"""
Tests for Tag and VideoTag models
"""

from django.contrib.auth import get_user_model
from django.db import IntegrityError
from django.test import TestCase

from app.models import Tag, Video, VideoTag

User = get_user_model()


class TagModelTests(TestCase):
    """Tests for Tag model"""

    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
        )

    def test_create_tag(self):
        """Test creating a tag"""
        tag = Tag.objects.create(
            user=self.user,
            name="Important",
            color="#FF0000",
        )

        self.assertEqual(tag.name, "Important")
        self.assertEqual(tag.color, "#FF0000")
        self.assertEqual(tag.user, self.user)

    def test_default_color(self):
        """Test that default color is set"""
        tag = Tag.objects.create(
            user=self.user,
            name="Test Tag",
        )

        self.assertEqual(tag.color, "#3B82F6")

    def test_created_at_is_auto_set(self):
        """Test that created_at is automatically set"""
        tag = Tag.objects.create(
            user=self.user,
            name="Test Tag",
        )

        self.assertIsNotNone(tag.created_at)

    def test_unique_together_user_name(self):
        """Test that tag name is unique per user"""
        Tag.objects.create(user=self.user, name="Important")

        with self.assertRaises(IntegrityError):
            Tag.objects.create(user=self.user, name="Important")

    def test_same_name_different_users(self):
        """Test that different users can have tags with same name"""
        user2 = User.objects.create_user(
            username="user2",
            email="user2@example.com",
            password="testpass123",
        )

        Tag.objects.create(user=self.user, name="Important")
        Tag.objects.create(user=user2, name="Important")

        self.assertEqual(Tag.objects.filter(name="Important").count(), 2)

    def test_str_representation(self):
        """Test string representation of tag"""
        tag = Tag.objects.create(
            user=self.user,
            name="Important",
        )

        self.assertEqual(str(tag), "Important (by testuser)")

    def test_ordering_by_name(self):
        """Test that tags are ordered by name"""
        Tag.objects.create(user=self.user, name="Zebra")
        Tag.objects.create(user=self.user, name="Apple")
        Tag.objects.create(user=self.user, name="Mango")

        tags = list(Tag.objects.all())

        self.assertEqual(tags[0].name, "Apple")
        self.assertEqual(tags[1].name, "Mango")
        self.assertEqual(tags[2].name, "Zebra")

    def test_cascade_delete_on_user(self):
        """Test that tags are deleted when user is deleted"""
        tag = Tag.objects.create(user=self.user, name="Important")
        tag_id = tag.id

        self.user.delete()

        self.assertFalse(Tag.objects.filter(id=tag_id).exists())


class VideoTagModelTests(TestCase):
    """Tests for VideoTag model"""

    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
        )
        self.video = Video.objects.create(
            user=self.user,
            title="Test Video",
        )
        self.tag = Tag.objects.create(
            user=self.user,
            name="Important",
        )

    def test_add_tag_to_video(self):
        """Test adding a tag to a video"""
        video_tag = VideoTag.objects.create(
            video=self.video,
            tag=self.tag,
        )

        self.assertEqual(video_tag.video, self.video)
        self.assertEqual(video_tag.tag, self.tag)

    def test_added_at_is_auto_set(self):
        """Test that added_at is automatically set"""
        video_tag = VideoTag.objects.create(
            video=self.video,
            tag=self.tag,
        )

        self.assertIsNotNone(video_tag.added_at)

    def test_unique_together_video_tag(self):
        """Test that same tag can't be added twice to same video"""
        VideoTag.objects.create(video=self.video, tag=self.tag)

        with self.assertRaises(IntegrityError):
            VideoTag.objects.create(video=self.video, tag=self.tag)

    def test_video_can_have_multiple_tags(self):
        """Test that video can have multiple tags"""
        tag2 = Tag.objects.create(user=self.user, name="Urgent")

        VideoTag.objects.create(video=self.video, tag=self.tag)
        VideoTag.objects.create(video=self.video, tag=tag2)

        self.assertEqual(VideoTag.objects.filter(video=self.video).count(), 2)

    def test_tag_can_be_on_multiple_videos(self):
        """Test that tag can be on multiple videos"""
        video2 = Video.objects.create(user=self.user, title="Video 2")

        VideoTag.objects.create(video=self.video, tag=self.tag)
        VideoTag.objects.create(video=video2, tag=self.tag)

        self.assertEqual(VideoTag.objects.filter(tag=self.tag).count(), 2)

    def test_str_representation(self):
        """Test string representation of video tag"""
        video_tag = VideoTag.objects.create(
            video=self.video,
            tag=self.tag,
        )

        self.assertEqual(str(video_tag), "Important on Test Video")

    def test_cascade_delete_on_video(self):
        """Test that video tags are deleted when video is deleted"""
        VideoTag.objects.create(video=self.video, tag=self.tag)

        self.video.delete()

        self.assertEqual(VideoTag.objects.count(), 0)

    def test_cascade_delete_on_tag(self):
        """Test that video tags are deleted when tag is deleted"""
        VideoTag.objects.create(video=self.video, tag=self.tag)

        self.tag.delete()

        self.assertEqual(VideoTag.objects.count(), 0)
