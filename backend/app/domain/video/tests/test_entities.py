"""Unit tests for video domain entities."""

from unittest import TestCase

from app.domain.video.entities import (
    TagEntity,
    VideoEntity,
    VideoGroupEntity,
    VideoGroupMemberEntity,
)
from app.domain.video.exceptions import (
    GroupVideoOrderMismatch,
    ShareLinkNotActive,
    SomeVideosNotFound,
    TagNotAttachedToVideo,
    VideoAlreadyInGroup,
    VideoNotInGroup,
)


class VideoEntityTests(TestCase):
    def test_plan_tag_attachment_skips_attached_and_duplicates(self):
        video = VideoEntity(
            id=1,
            user_id=1,
            title="video",
            status="completed",
            tags=[TagEntity(id=10, user_id=1, name="t1", color="#111111")],
        )

        ids_to_add, skipped_count = video.plan_tag_attachment([10, 11, 11, 12])

        self.assertEqual(ids_to_add, [11, 12])
        self.assertEqual(skipped_count, 2)

    def test_assert_has_tag_raises_when_not_attached(self):
        video = VideoEntity(
            id=1,
            user_id=1,
            title="video",
            status="completed",
            tags=[TagEntity(id=10, user_id=1, name="t1", color="#111111")],
        )

        with self.assertRaises(TagNotAttachedToVideo):
            video.assert_has_tag(999)


class VideoGroupEntityTests(TestCase):
    def test_plan_bulk_add_skips_existing_and_duplicates(self):
        group = VideoGroupEntity(
            id=1,
            user_id=1,
            name="group",
            members=[VideoGroupMemberEntity(id=10, group_id=1, video_id=100, order=0)],
        )

        ids_to_add, skipped_count = group.plan_bulk_add([100, 101, 101, 102])

        self.assertEqual(ids_to_add, [101, 102])
        self.assertEqual(skipped_count, 2)

    def test_assert_reorder_matches_members_raises_when_ids_differ(self):
        group = VideoGroupEntity(
            id=1,
            user_id=1,
            name="group",
            members=[VideoGroupMemberEntity(id=10, group_id=1, video_id=100, order=0)],
        )

        with self.assertRaises(GroupVideoOrderMismatch):
            group.assert_reorder_matches_members([999])

    def test_plan_bulk_add_with_existing_raises_when_video_missing(self):
        group = VideoGroupEntity(
            id=1,
            user_id=1,
            name="group",
            members=[],
        )

        with self.assertRaises(SomeVideosNotFound):
            group.plan_bulk_add_with_existing(
                requested_video_ids=[100, 101],
                existing_video_ids={100},
            )

    def test_plan_bulk_add_with_existing_returns_ids_and_skipped(self):
        group = VideoGroupEntity(
            id=1,
            user_id=1,
            name="group",
            members=[VideoGroupMemberEntity(id=10, group_id=1, video_id=100, order=0)],
        )

        ids_to_add, skipped_count = group.plan_bulk_add_with_existing(
            requested_video_ids=[100, 101, 101, 102],
            existing_video_ids={100, 101, 102},
        )

        self.assertEqual(ids_to_add, [101, 102])
        self.assertEqual(skipped_count, 2)

    def test_assert_share_link_active_raises_when_inactive(self):
        group = VideoGroupEntity(id=1, user_id=1, name="group", share_slug=None)

        with self.assertRaises(ShareLinkNotActive):
            group.assert_share_link_active()

    def test_assert_can_add_video_raises_when_already_member(self):
        group = VideoGroupEntity(
            id=1,
            user_id=1,
            name="group",
            members=[VideoGroupMemberEntity(id=10, group_id=1, video_id=100, order=0)],
        )

        with self.assertRaises(VideoAlreadyInGroup):
            group.assert_can_add_video(100)

    def test_assert_contains_video_raises_when_not_member(self):
        group = VideoGroupEntity(
            id=1,
            user_id=1,
            name="group",
            members=[VideoGroupMemberEntity(id=10, group_id=1, video_id=100, order=0)],
        )

        with self.assertRaises(VideoNotInGroup):
            group.assert_contains_video(999)
