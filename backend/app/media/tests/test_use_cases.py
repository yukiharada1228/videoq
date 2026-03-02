from unittest.mock import Mock

from rest_framework.test import APITestCase

from app.media.use_cases import GetProtectedMediaQuery, GetProtectedMediaUseCase


class GetProtectedMediaUseCaseTests(APITestCase):
    def test_execute_resolves_and_authorizes(self):
        video = object()
        protected_media_getter = Mock(return_value=("/tmp/video.mp4", video))

        result = GetProtectedMediaUseCase(
            protected_media_getter=protected_media_getter,
        ).execute(
            GetProtectedMediaQuery(
                path="video.mp4",
                actor_id=1,
                share_group="group",
            )
        )

        self.assertEqual(result.file_path, "/tmp/video.mp4")
        self.assertIs(result.video, video)
        protected_media_getter.assert_called_once()
