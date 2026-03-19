"""Tests for SearchRelatedVideosUseCase."""

import unittest

from app.domain.chat.dtos import RelatedVideoDTO
from app.domain.chat.entities import VideoGroupContextEntity, VideoGroupMemberRef
from app.domain.chat.gateways import RagGateway, RagUserNotFoundError
from app.domain.chat.repositories import VideoGroupQueryRepository
from app.use_cases.chat.exceptions import InvalidChatRequestError
from app.use_cases.chat.search_related_videos import SearchRelatedVideosUseCase
from app.use_cases.shared.exceptions import ResourceNotFound


class _StubGroupRepository(VideoGroupQueryRepository):
    def __init__(self, group):
        self.group = group

    def get_with_members(self, group_id: int, user_id=None, share_token=None):
        return self.group


class _StubRagGateway(RagGateway):
    def generate_reply(self, messages, user_id, video_ids=None, locale=None, api_key=None):
        raise NotImplementedError

    def search_related_videos(self, query_text, user_id, video_ids=None, api_key=None):
        return [
            RelatedVideoDTO(
                video_id=video_ids[0],
                title="Video",
                start_time="00:00:10",
                end_time="00:00:20",
            )
        ]


class _RagGatewayUserNotFound(RagGateway):
    def generate_reply(self, messages, user_id, video_ids=None, locale=None, api_key=None):
        raise NotImplementedError

    def search_related_videos(self, query_text, user_id, video_ids=None, api_key=None):
        raise RagUserNotFoundError(f"User not found: {user_id}")


class SearchRelatedVideosUseCaseTests(unittest.TestCase):
    def setUp(self):
        self.group = VideoGroupContextEntity(
            id=10,
            user_id=20,
            name="g",
            members=[VideoGroupMemberRef(video_id=111)],
        )

    def test_execute_raises_when_query_empty(self):
        use_case = SearchRelatedVideosUseCase(
            group_query_repo=_StubGroupRepository(self.group),
            rag_gateway=_StubRagGateway(),
        )

        with self.assertRaises(InvalidChatRequestError) as cm:
            use_case.execute(user_id=20, query_text="   ", group_id=10)

        self.assertEqual(str(cm.exception), "Query text is empty.")

    def test_execute_raises_when_group_not_found(self):
        use_case = SearchRelatedVideosUseCase(
            group_query_repo=_StubGroupRepository(None),
            rag_gateway=_StubRagGateway(),
        )

        with self.assertRaises(ResourceNotFound) as cm:
            use_case.execute(user_id=20, query_text="hello", group_id=10)

        self.assertEqual(str(cm.exception), "Group not found.")

    def test_execute_maps_rag_user_not_found_to_resource_not_found(self):
        use_case = SearchRelatedVideosUseCase(
            group_query_repo=_StubGroupRepository(self.group),
            rag_gateway=_RagGatewayUserNotFound(),
        )

        with self.assertRaises(ResourceNotFound) as cm:
            use_case.execute(user_id=20, query_text="hello", group_id=10)

        self.assertEqual(str(cm.exception), "User not found.")

    def test_execute_returns_related_videos(self):
        use_case = SearchRelatedVideosUseCase(
            group_query_repo=_StubGroupRepository(self.group),
            rag_gateway=_StubRagGateway(),
        )

        result = use_case.execute(user_id=20, query_text="hello", group_id=10)

        self.assertEqual(result.query_text, "hello")
        self.assertEqual(result.related_videos[0].video_id, 111)


if __name__ == "__main__":
    unittest.main()
