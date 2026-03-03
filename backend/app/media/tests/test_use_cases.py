from unittest.mock import Mock

from rest_framework.test import APITestCase

from app.media.use_cases import (GetProtectedMediaQuery,
                                 GetProtectedMediaUseCase)


class GetProtectedMediaUseCaseTests(APITestCase):
    def test_execute_resolves_and_authorizes(self):
        video = object()
        user = object()
        media_file_resolver = Mock(return_value=("/tmp/video.mp4", video))
        video_access_authorizer = Mock()
        actor_loader = Mock(return_value=user)

        result = GetProtectedMediaUseCase(
            media_file_resolver=media_file_resolver,
            video_access_authorizer=video_access_authorizer,
            actor_loader=actor_loader,
        ).execute(
            GetProtectedMediaQuery(
                path="video.mp4",
                actor_id=1,
                share_group="group",
            )
        )

        self.assertEqual(result.file_path, "/tmp/video.mp4")
        self.assertIs(result.video, video)
        media_file_resolver.assert_called_once_with("video.mp4")
        actor_loader.assert_called_once_with(1)
        video_access_authorizer.assert_called_once_with(
            video=video,
            request_user=user,
            share_group="group",
        )

    def test_execute_without_actor_id(self):
        video = object()
        media_file_resolver = Mock(return_value=("/tmp/video.mp4", video))
        video_access_authorizer = Mock()
        actor_loader = Mock()

        result = GetProtectedMediaUseCase(
            media_file_resolver=media_file_resolver,
            video_access_authorizer=video_access_authorizer,
            actor_loader=actor_loader,
        ).execute(
            GetProtectedMediaQuery(
                path="video.mp4",
                actor_id=None,
                share_group=None,
            )
        )

        self.assertEqual(result.file_path, "/tmp/video.mp4")
        actor_loader.assert_not_called()
        video_access_authorizer.assert_called_once_with(
            video=video,
            request_user=None,
            share_group=None,
        )
