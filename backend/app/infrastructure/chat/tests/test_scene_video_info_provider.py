"""Unit tests for DjangoSceneVideoInfoProvider."""

from unittest import TestCase
from unittest.mock import MagicMock

from app.domain.video.ports import FileUrlResolver
from app.infrastructure.chat.scene_video_info_provider import DjangoSceneVideoInfoProvider


class _StubResolver(FileUrlResolver):
    def resolve(self, file_key: str):
        return f"https://cdn.example.com/{file_key}"


class SceneVideoInfoProviderNoResolverTests(TestCase):
    """Without a resolver all video IDs map to None."""

    def test_returns_none_for_all_ids_when_no_resolver(self):
        video_repo = MagicMock()
        video_repo.get_file_keys_for_ids.return_value = {1: "videos/a.mp4", 2: "videos/b.mp4"}
        provider = DjangoSceneVideoInfoProvider(video_repo=video_repo)

        result = provider.get_file_urls_for_ids([1, 2], user_id=10)

        self.assertEqual(result, {1: None, 2: None})

    def test_returns_none_keys_for_unknown_ids_when_no_resolver(self):
        video_repo = MagicMock()
        video_repo.get_file_keys_for_ids.return_value = {}
        provider = DjangoSceneVideoInfoProvider(video_repo=video_repo)

        result = provider.get_file_urls_for_ids([99], user_id=10)

        self.assertEqual(result, {99: None})


class SceneVideoInfoProviderWithResolverTests(TestCase):
    """With a resolver, file keys are converted to URLs."""

    def test_resolves_file_keys_to_urls(self):
        video_repo = MagicMock()
        video_repo.get_file_keys_for_ids.return_value = {1: "videos/clip.mp4"}
        provider = DjangoSceneVideoInfoProvider(
            video_repo=video_repo,
            file_url_resolver=_StubResolver(),
        )

        result = provider.get_file_urls_for_ids([1], user_id=5)

        self.assertEqual(result[1], "https://cdn.example.com/videos/clip.mp4")

    def test_returns_none_for_missing_file_key(self):
        video_repo = MagicMock()
        video_repo.get_file_keys_for_ids.return_value = {}
        provider = DjangoSceneVideoInfoProvider(
            video_repo=video_repo,
            file_url_resolver=_StubResolver(),
        )

        result = provider.get_file_urls_for_ids([42], user_id=5)

        self.assertIsNone(result[42])

    def test_delegates_to_repo_with_correct_args(self):
        video_repo = MagicMock()
        video_repo.get_file_keys_for_ids.return_value = {}
        provider = DjangoSceneVideoInfoProvider(
            video_repo=video_repo,
            file_url_resolver=_StubResolver(),
        )

        provider.get_file_urls_for_ids([3, 4], user_id=7)

        video_repo.get_file_keys_for_ids.assert_called_once_with([3, 4], 7)
