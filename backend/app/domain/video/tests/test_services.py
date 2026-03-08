"""Unit tests for video domain services."""

from unittest import TestCase

from app.domain.video.entities import VideoGroupEntity, VideoGroupMemberEntity
from app.domain.video.exceptions import InvalidVideoStatusTransition
from app.domain.video.exceptions import InvalidTagColor, InvalidTagName
from app.domain.video.exceptions import SomeVideosNotFound
from app.domain.video.exceptions import VideoAlreadyInGroup, VideoNotInGroup, GroupVideoOrderMismatch
from app.domain.video.services import TagPolicy, VideoGroupMembershipService, VideoTranscriptionLifecycle
from app.domain.video.status import VideoStatus


class VideoTranscriptionLifecycleTests(TestCase):
    def test_plan_start_allows_pending_to_processing(self):
        from_status, to_status = VideoTranscriptionLifecycle.plan_start("pending")

        self.assertEqual(from_status, VideoStatus.PENDING)
        self.assertEqual(to_status, VideoStatus.PROCESSING)

    def test_plan_start_rejects_processing_to_processing(self):
        with self.assertRaises(InvalidVideoStatusTransition):
            VideoTranscriptionLifecycle.plan_start("processing")

    def test_plan_success_returns_processing_to_indexing(self):
        from_status, to_status = VideoTranscriptionLifecycle.plan_success()

        self.assertEqual(from_status, VideoStatus.PROCESSING)
        self.assertEqual(to_status, VideoStatus.INDEXING)

    def test_plan_failure_returns_processing_to_error(self):
        from_status, to_status = VideoTranscriptionLifecycle.plan_failure()

        self.assertEqual(from_status, VideoStatus.PROCESSING)
        self.assertEqual(to_status, VideoStatus.ERROR)


class VideoGroupMembershipServiceTests(TestCase):
    def test_ensure_can_add_video_raises_for_existing_member(self):
        group = VideoGroupEntity(
            id=1,
            user_id=10,
            name="group",
            members=[VideoGroupMemberEntity(id=1, group_id=1, video_id=10, order=0)],
        )

        with self.assertRaises(VideoAlreadyInGroup):
            VideoGroupMembershipService.ensure_can_add_video(group=group, video_id=10)

    def test_ensure_contains_video_raises_for_missing_member(self):
        group = VideoGroupEntity(id=1, user_id=10, name="group", members=[])

        with self.assertRaises(VideoNotInGroup):
            VideoGroupMembershipService.ensure_contains_video(group=group, video_id=10)

    def test_ensure_reorder_matches_members_raises_for_mismatch(self):
        group = VideoGroupEntity(
            id=1,
            user_id=10,
            name="group",
            members=[VideoGroupMemberEntity(id=1, group_id=1, video_id=10, order=0)],
        )

        with self.assertRaises(GroupVideoOrderMismatch):
            VideoGroupMembershipService.ensure_reorder_matches_members(
                group=group,
                requested_video_ids=[11],
            )

    def test_plan_bulk_add_raises_when_any_video_is_missing(self):
        group = VideoGroupEntity(id=1, user_id=10, name="group", members=[])

        with self.assertRaises(SomeVideosNotFound):
            VideoGroupMembershipService.plan_bulk_add(
                group=group,
                requested_video_ids=[10, 20],
                existing_video_ids={10},
            )

    def test_plan_bulk_add_returns_ids_to_add_and_skipped(self):
        group = VideoGroupEntity(
            id=1,
            user_id=10,
            name="group",
            members=[VideoGroupMemberEntity(id=1, group_id=1, video_id=10, order=0)],
        )

        ids_to_add, skipped_count = VideoGroupMembershipService.plan_bulk_add(
            group=group,
            requested_video_ids=[10, 11, 11, 12],
            existing_video_ids={10, 11, 12},
        )

        self.assertEqual(ids_to_add, [11, 12])
        self.assertEqual(skipped_count, 2)


class TagPolicyTests(TestCase):
    def test_normalize_name_trims_spaces(self):
        self.assertEqual(TagPolicy.normalize_name("  urgent  "), "urgent")

    def test_normalize_name_rejects_blank(self):
        with self.assertRaises(InvalidTagName):
            TagPolicy.normalize_name("   ")

    def test_validate_color_accepts_hex(self):
        self.assertEqual(TagPolicy.validate_color("#Ab12F0"), "#Ab12F0")

    def test_validate_color_rejects_invalid_format(self):
        with self.assertRaises(InvalidTagColor):
            TagPolicy.validate_color("red")
