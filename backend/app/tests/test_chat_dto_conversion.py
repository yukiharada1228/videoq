"""Tests for chat DTO conversion helpers."""

import unittest

from app.domain.chat.dtos import ChatMessageDTO, RelatedVideoDTO
from app.use_cases.chat.send_message import SendMessageUseCase


class ChatDTOConversionTests(unittest.TestCase):
    def test_chat_message_dict_to_dto(self):
        raw = {"role": "user", "content": "hello"}
        dto = ChatMessageDTO.from_dict(raw)
        self.assertEqual(dto.role, "user")
        self.assertEqual(dto.content, "hello")
        self.assertEqual(dto.to_dict(), raw)

    def test_related_video_dict_to_dto(self):
        raw = {
            "video_id": "10",
            "title": "Intro",
            "start_time": "00:00:05",
            "end_time": "00:00:15",
        }
        dto = RelatedVideoDTO.from_dict(raw)
        self.assertEqual(dto.video_id, "10")
        self.assertEqual(dto.title, "Intro")
        self.assertEqual(dto.start_time, "00:00:05")
        self.assertEqual(dto.end_time, "00:00:15")
        self.assertEqual(dto.to_dict(), raw)

    def test_use_case_related_video_normalization(self):
        dto = RelatedVideoDTO(
            video_id="42",
            title="Clip",
            start_time="00:01:00",
            end_time="00:01:20",
        )
        normalized = SendMessageUseCase._related_videos_to_dicts(
            [dto, {"video_id": "99", "title": "Raw", "start_time": None, "end_time": None}]
        )
        self.assertEqual(
            normalized,
            [
                {
                    "video_id": "42",
                    "title": "Clip",
                    "start_time": "00:01:00",
                    "end_time": "00:01:20",
                },
                {"video_id": "99", "title": "Raw", "start_time": None, "end_time": None},
            ],
        )


if __name__ == "__main__":
    unittest.main()
