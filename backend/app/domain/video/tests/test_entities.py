"""Unit tests for video domain entities."""

from unittest import TestCase

from app.domain.video.entities import VideoEntity
from app.domain.video.exceptions import VideoLimitExceeded


class VideoEntityTests(TestCase):
    def test_ensure_upload_within_limit_raises_when_limit_reached(self):
        with self.assertRaises(VideoLimitExceeded):
            VideoEntity.ensure_upload_within_limit(current_count=3, video_limit=3)

    def test_ensure_upload_within_limit_allows_unlimited(self):
        VideoEntity.ensure_upload_within_limit(current_count=100, video_limit=None)
