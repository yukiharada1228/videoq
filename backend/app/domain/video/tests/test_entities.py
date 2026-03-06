"""Unit tests for video domain entities."""

from unittest import TestCase

from app.domain.video.entities import VideoEntity, VideoGroupEntity
from app.domain.video.exceptions import (
    InvalidVideoStatusTransition,
    ShareLinkNotFound,
)


class VideoEntityStatusTransitionTests(TestCase):
    """Tests for VideoEntity status transition methods."""

    def test_start_processing_from_pending(self):
        video = VideoEntity(id=1, user_id=10, title="v", status="pending")
        video.start_processing()
        self.assertEqual(video.status, "processing")
        self.assertEqual(video.error_message, "")

    def test_complete_from_processing(self):
        video = VideoEntity(id=1, user_id=10, title="v", status="processing")
        video.complete()
        self.assertEqual(video.status, "completed")
        self.assertEqual(video.error_message, "")

    def test_fail_from_processing(self):
        video = VideoEntity(id=1, user_id=10, title="v", status="processing")
        video.fail("something broke")
        self.assertEqual(video.status, "error")
        self.assertEqual(video.error_message, "something broke")

    def test_start_processing_from_completed(self):
        video = VideoEntity(id=1, user_id=10, title="v", status="completed")
        video.start_processing()
        self.assertEqual(video.status, "processing")

    def test_start_processing_from_error(self):
        video = VideoEntity(id=1, user_id=10, title="v", status="error")
        video.start_processing()
        self.assertEqual(video.status, "processing")

    def test_cannot_complete_from_pending(self):
        video = VideoEntity(id=1, user_id=10, title="v", status="pending")
        with self.assertRaises(InvalidVideoStatusTransition):
            video.complete()

    def test_cannot_fail_from_pending(self):
        video = VideoEntity(id=1, user_id=10, title="v", status="pending")
        with self.assertRaises(InvalidVideoStatusTransition):
            video.fail("err")


class VideoGroupEntitySharingTests(TestCase):
    """Tests for VideoGroupEntity share link management."""

    def test_enable_sharing(self):
        group = VideoGroupEntity(id=1, user_id=10, name="g")
        self.assertFalse(group.is_shared)
        group.enable_sharing("token-123")
        self.assertTrue(group.is_shared)
        self.assertEqual(group.share_token, "token-123")

    def test_disable_sharing(self):
        group = VideoGroupEntity(id=1, user_id=10, name="g", share_token="tok")
        self.assertTrue(group.is_shared)
        group.disable_sharing()
        self.assertFalse(group.is_shared)
        self.assertIsNone(group.share_token)

    def test_disable_sharing_raises_when_not_shared(self):
        group = VideoGroupEntity(id=1, user_id=10, name="g")
        with self.assertRaises(ShareLinkNotFound):
            group.disable_sharing()

