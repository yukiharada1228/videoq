"""Unit tests for video DTO mapper helpers."""

from unittest import TestCase

from app.domain.video.entities import TagEntity, VideoEntity
from app.use_cases.video.dto import TagResponseDTO
from app.use_cases.video.file_url import to_video_response_dto


class FileUrlMappingTests(TestCase):
    def test_to_video_response_dto_maps_tags_to_use_case_dto(self):
        video = VideoEntity(
            id=1,
            user_id=10,
            title="Video",
            status="completed",
            file_key="videos/a.mp4",
            tags=[
                TagEntity(id=100, user_id=10, name="Tag1", color="#111111"),
                TagEntity(id=101, user_id=10, name="Tag2", color="#222222"),
            ],
        )

        dto = to_video_response_dto(video)

        self.assertEqual(dto.file_key, "videos/a.mp4")
        self.assertEqual(len(dto.tags), 2)
        self.assertIsInstance(dto.tags[0], TagResponseDTO)
        self.assertEqual(dto.tags[0].id, 100)
        self.assertEqual(dto.tags[0].name, "Tag1")
