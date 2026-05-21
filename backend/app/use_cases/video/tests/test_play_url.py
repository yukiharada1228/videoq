"""Unit tests for GetVideoPlayUrlUseCase and GetSharedVideoPlayUrlUseCase."""

from unittest import TestCase

from app.domain.video.entities import (
    VideoEntity,
    VideoGroupEntity,
    VideoGroupMemberEntity,
)
from app.use_cases.video.exceptions import ResourceNotFound
from app.use_cases.video.get_play_url import (
    GetSharedVideoPlayUrlUseCase,
    GetVideoPlayUrlUseCase,
)


class _FakeVideoRepo:
    def __init__(self, video=None):
        self._video = video

    def get_by_id(self, video_id, user_id):
        if self._video and self._video.id == video_id and self._video.user_id == user_id:
            return self._video
        return None


class _FakeGroupRepo:
    def __init__(self, group=None):
        self._group = group

    def get_by_share_slug(self, share_slug):
        if self._group and self._group.share_slug == share_slug:
            return self._group
        return None


def _make_video(video_id=1, user_id=10, file_key="videos/user1/test.mp4"):
    return VideoEntity(id=video_id, user_id=user_id, title="T", status="completed", file_key=file_key)


def _make_group_with_video(video_id=1, file_key="videos/test.mp4"):
    video = _make_video(video_id=video_id, user_id=10, file_key=file_key)
    member = VideoGroupMemberEntity(id=1, group_id=5, video_id=video_id, order=0, video=video)
    return VideoGroupEntity(
        id=5,
        user_id=10,
        name="G",
        description="",
        video_count=1,
        share_slug="my-slug",
        members=[member],
    )


class GetVideoPlayUrlUseCaseTests(TestCase):
    def test_returns_file_key_for_owned_video(self):
        video = _make_video(file_key="videos/user1/test.mp4")
        uc = GetVideoPlayUrlUseCase(_FakeVideoRepo(video))
        result = uc.execute(video_id=1, user_id=10)
        self.assertEqual(result, "videos/user1/test.mp4")

    def test_returns_none_for_youtube_video_without_file(self):
        video = _make_video(file_key=None)
        uc = GetVideoPlayUrlUseCase(_FakeVideoRepo(video))
        result = uc.execute(video_id=1, user_id=10)
        self.assertIsNone(result)

    def test_raises_not_found_for_nonexistent_video(self):
        uc = GetVideoPlayUrlUseCase(_FakeVideoRepo(video=None))
        with self.assertRaises(ResourceNotFound):
            uc.execute(video_id=999, user_id=10)

    def test_raises_not_found_for_other_users_video(self):
        video = _make_video()
        uc = GetVideoPlayUrlUseCase(_FakeVideoRepo(video))
        with self.assertRaises(ResourceNotFound):
            uc.execute(video_id=1, user_id=99)


class GetSharedVideoPlayUrlUseCaseTests(TestCase):
    def test_returns_file_key_for_video_in_shared_group(self):
        group = _make_group_with_video(video_id=1, file_key="videos/g/v.mp4")
        uc = GetSharedVideoPlayUrlUseCase(_FakeGroupRepo(group))
        result = uc.execute(share_slug="my-slug", video_id=1)
        self.assertEqual(result, "videos/g/v.mp4")

    def test_returns_none_for_youtube_video_in_shared_group(self):
        group = _make_group_with_video(video_id=1, file_key=None)
        uc = GetSharedVideoPlayUrlUseCase(_FakeGroupRepo(group))
        result = uc.execute(share_slug="my-slug", video_id=1)
        self.assertIsNone(result)

    def test_raises_not_found_for_invalid_slug(self):
        uc = GetSharedVideoPlayUrlUseCase(_FakeGroupRepo(group=None))
        with self.assertRaises(ResourceNotFound):
            uc.execute(share_slug="bad-slug", video_id=1)

    def test_raises_not_found_for_video_not_in_group(self):
        group = _make_group_with_video(video_id=1)
        uc = GetSharedVideoPlayUrlUseCase(_FakeGroupRepo(group))
        with self.assertRaises(ResourceNotFound):
            uc.execute(share_slug="my-slug", video_id=999)
