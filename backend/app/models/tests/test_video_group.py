"""
Tests for VideoGroup and VideoGroupMember models
"""

from django.contrib.auth import get_user_model
from django.db import IntegrityError
from django.test import TestCase

from app.models import Video, VideoGroup, VideoGroupMember

User = get_user_model()


class VideoGroupModelTests(TestCase):
    """Tests for VideoGroup model"""

    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
            video_limit=None,
        )

    def test_create_video_group(self):
        """Test creating a video group"""
        group = VideoGroup.objects.create(
            user=self.user,
            name="Test Group",
            description="Test Description",
        )

        self.assertEqual(group.name, "Test Group")
        self.assertEqual(group.description, "Test Description")
        self.assertEqual(group.user, self.user)

    def test_description_is_optional(self):
        """Test that description is optional"""
        group = VideoGroup.objects.create(
            user=self.user,
            name="Test Group",
        )

        self.assertEqual(group.description, "")

    def test_share_token_is_optional(self):
        """Test that share_token is optional"""
        group = VideoGroup.objects.create(
            user=self.user,
            name="Test Group",
        )

        self.assertIsNone(group.share_token)

    def test_share_token_is_unique(self):
        """Test that share_token must be unique"""
        VideoGroup.objects.create(
            user=self.user,
            name="Group 1",
            share_token="unique-token-123",
        )

        with self.assertRaises(IntegrityError):
            VideoGroup.objects.create(
                user=self.user,
                name="Group 2",
                share_token="unique-token-123",
            )

    def test_created_at_is_auto_set(self):
        """Test that created_at is automatically set"""
        group = VideoGroup.objects.create(
            user=self.user,
            name="Test Group",
        )

        self.assertIsNotNone(group.created_at)

    def test_updated_at_is_auto_updated(self):
        """Test that updated_at is automatically updated"""
        group = VideoGroup.objects.create(
            user=self.user,
            name="Test Group",
        )

        original_updated_at = group.updated_at

        group.name = "Updated Name"
        group.save()

        self.assertNotEqual(group.updated_at, original_updated_at)

    def test_str_representation(self):
        """Test string representation of video group"""
        group = VideoGroup.objects.create(
            user=self.user,
            name="My Group",
        )

        self.assertEqual(str(group), "My Group (by testuser)")

    def test_ordering_by_created_at_desc(self):
        """Test that groups are ordered by created_at descending"""
        group1 = VideoGroup.objects.create(user=self.user, name="Group 1")
        group2 = VideoGroup.objects.create(user=self.user, name="Group 2")
        group3 = VideoGroup.objects.create(user=self.user, name="Group 3")

        groups = list(VideoGroup.objects.all())

        # Most recently created should be first
        self.assertEqual(groups[0], group3)
        self.assertEqual(groups[1], group2)
        self.assertEqual(groups[2], group1)

    def test_cascade_delete_on_user(self):
        """Test that groups are deleted when user is deleted"""
        group = VideoGroup.objects.create(
            user=self.user,
            name="Test Group",
        )
        group_id = group.id

        self.user.delete()

        self.assertFalse(VideoGroup.objects.filter(id=group_id).exists())


class VideoGroupMemberModelTests(TestCase):
    """Tests for VideoGroupMember model"""

    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
            video_limit=None,
        )
        self.group = VideoGroup.objects.create(
            user=self.user,
            name="Test Group",
        )
        self.video = Video.objects.create(
            user=self.user,
            title="Test Video",
        )

    def test_add_video_to_group(self):
        """Test adding a video to a group"""
        member = VideoGroupMember.objects.create(
            group=self.group,
            video=self.video,
            order=0,
        )

        self.assertEqual(member.group, self.group)
        self.assertEqual(member.video, self.video)
        self.assertEqual(member.order, 0)

    def test_default_order_is_zero(self):
        """Test that default order is 0"""
        member = VideoGroupMember.objects.create(
            group=self.group,
            video=self.video,
        )

        self.assertEqual(member.order, 0)

    def test_added_at_is_auto_set(self):
        """Test that added_at is automatically set"""
        member = VideoGroupMember.objects.create(
            group=self.group,
            video=self.video,
        )

        self.assertIsNotNone(member.added_at)

    def test_unique_together_constraint(self):
        """Test that same video can't be added twice to same group"""
        VideoGroupMember.objects.create(
            group=self.group,
            video=self.video,
        )

        with self.assertRaises(IntegrityError):
            VideoGroupMember.objects.create(
                group=self.group,
                video=self.video,
            )

    def test_video_can_be_in_multiple_groups(self):
        """Test that video can be added to multiple groups"""
        group2 = VideoGroup.objects.create(
            user=self.user,
            name="Another Group",
        )

        VideoGroupMember.objects.create(group=self.group, video=self.video)
        VideoGroupMember.objects.create(group=group2, video=self.video)

        self.assertEqual(VideoGroupMember.objects.filter(video=self.video).count(), 2)

    def test_str_representation(self):
        """Test string representation of video group member"""
        member = VideoGroupMember.objects.create(
            group=self.group,
            video=self.video,
        )

        self.assertEqual(str(member), "Test Video in Test Group")

    def test_ordering_by_order_then_added_at(self):
        """Test that members are ordered by order, then added_at"""
        video2 = Video.objects.create(user=self.user, title="Video 2")
        video3 = Video.objects.create(user=self.user, title="Video 3")

        member3 = VideoGroupMember.objects.create(
            group=self.group, video=video3, order=0
        )
        member1 = VideoGroupMember.objects.create(
            group=self.group, video=self.video, order=1
        )
        member2 = VideoGroupMember.objects.create(
            group=self.group, video=video2, order=0
        )

        members = list(VideoGroupMember.objects.filter(group=self.group))

        # Same order should be sorted by added_at
        self.assertEqual(members[0], member3)  # order 0, earlier
        self.assertEqual(members[1], member2)  # order 0, later
        self.assertEqual(members[2], member1)  # order 1

    def test_cascade_delete_on_group(self):
        """Test that members are deleted when group is deleted"""
        VideoGroupMember.objects.create(group=self.group, video=self.video)

        self.group.delete()

        self.assertEqual(VideoGroupMember.objects.count(), 0)

    def test_cascade_delete_on_video(self):
        """Test that members are deleted when video is deleted"""
        VideoGroupMember.objects.create(group=self.group, video=self.video)

        self.video.delete()

        self.assertEqual(VideoGroupMember.objects.count(), 0)
