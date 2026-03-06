"""Unit tests for video status transition rules."""

from unittest import TestCase

from app.domain.video.exceptions import InvalidVideoStatusTransition
from app.domain.video.status import VideoStatus


class VideoStatusTests(TestCase):
    def test_pending_can_transition_to_processing(self):
        VideoStatus.PENDING.assert_transition_to(VideoStatus.PROCESSING)

    def test_processing_can_transition_to_completed(self):
        VideoStatus.PROCESSING.assert_transition_to(VideoStatus.COMPLETED)

    def test_processing_can_transition_to_error(self):
        VideoStatus.PROCESSING.assert_transition_to(VideoStatus.ERROR)

    def test_completed_can_transition_to_processing(self):
        VideoStatus.COMPLETED.assert_transition_to(VideoStatus.PROCESSING)

    def test_error_can_transition_to_processing(self):
        VideoStatus.ERROR.assert_transition_to(VideoStatus.PROCESSING)

    def test_pending_cannot_transition_to_completed(self):
        with self.assertRaises(InvalidVideoStatusTransition):
            VideoStatus.PENDING.assert_transition_to(VideoStatus.COMPLETED)

