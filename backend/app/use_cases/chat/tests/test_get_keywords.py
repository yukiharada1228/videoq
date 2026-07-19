"""Tests for GetChatKeywordsUseCase."""

import unittest
from typing import List

from app.domain.chat.entities import VideoGroupContextEntity
from app.domain.chat.ports import KeywordExtractor
from app.domain.chat.repositories import ChatRepository, VideoGroupQueryRepository
from app.domain.chat.value_objects import KeywordCount
from app.use_cases.chat.get_keywords import GetChatKeywordsUseCase
from app.use_cases.shared.exceptions import ResourceNotFound


class _StubChatRepository(ChatRepository):
    def __init__(self, questions=None):
        self._questions = questions or []

    def get_questions_for_group(self, group_id: int) -> List[str]:
        return self._questions

    def get_analytics_raw(self, group_id: int):
        raise NotImplementedError

    def get_logs_for_group(self, group_id, ascending=True):
        raise NotImplementedError

    def create_log(self, *args, **kwargs):
        raise NotImplementedError

    def get_log_by_id(self, log_id):
        raise NotImplementedError

    def update_feedback(self, log, feedback):
        raise NotImplementedError


    def delete_logs_for_group(self, group_id):
        raise NotImplementedError


class _StubGroupRepository(VideoGroupQueryRepository):
    def __init__(self, group):
        self._group = group

    def get_with_members(self, group_id, user_id=None, share_token=None):
        return self._group


class _StubKeywordExtractor(KeywordExtractor):
    def __init__(self, result: List[KeywordCount]):
        self._result = result

    def extract(self, questions: List[str], limit: int = 30) -> List[KeywordCount]:
        return self._result


class GetChatKeywordsUseCaseTests(unittest.TestCase):
    def _make_group(self):
        return VideoGroupContextEntity(id=1, user_id=42, name="g1")

    def test_execute_returns_keyword_count_dto_list(self):
        keywords = [KeywordCount(word="python", count=5), KeywordCount(word="flask", count=3)]
        use_case = GetChatKeywordsUseCase(
            chat_repo=_StubChatRepository(questions=["What is python?"]),
            group_query_repo=_StubGroupRepository(self._make_group()),
            keyword_extractor=_StubKeywordExtractor(keywords),
        )

        result = use_case.execute(group_id=1, user_id=42)

        self.assertEqual(len(result), 2)
        self.assertEqual(result[0].word, "python")
        self.assertEqual(result[0].count, 5)
        self.assertEqual(result[1].word, "flask")
        self.assertEqual(result[1].count, 3)

    def test_execute_raises_when_group_not_found(self):
        use_case = GetChatKeywordsUseCase(
            chat_repo=_StubChatRepository(),
            group_query_repo=_StubGroupRepository(None),
            keyword_extractor=_StubKeywordExtractor([]),
        )

        with self.assertRaises(ResourceNotFound):
            use_case.execute(group_id=999, user_id=42)

    def test_execute_returns_empty_list_when_no_questions(self):
        use_case = GetChatKeywordsUseCase(
            chat_repo=_StubChatRepository(questions=[]),
            group_query_repo=_StubGroupRepository(self._make_group()),
            keyword_extractor=_StubKeywordExtractor([]),
        )

        result = use_case.execute(group_id=1, user_id=42)

        self.assertEqual(result, [])

    def test_keyword_extractor_receives_questions_from_repository(self):
        received = []

        class _CapturingExtractor(KeywordExtractor):
            def extract(self, questions, limit=30):
                received.extend(questions)
                return []

        use_case = GetChatKeywordsUseCase(
            chat_repo=_StubChatRepository(questions=["q1", "q2"]),
            group_query_repo=_StubGroupRepository(self._make_group()),
            keyword_extractor=_CapturingExtractor(),
        )

        use_case.execute(group_id=1, user_id=42)

        self.assertEqual(received, ["q1", "q2"])

    def test_get_analytics_raw_is_not_called(self):
        """get_questions_for_group must be used; get_analytics_raw must NOT be called."""
        class _TrackingRepo(_StubChatRepository):
            analytics_raw_called = False

            def get_analytics_raw(self, group_id):
                self.__class__.analytics_raw_called = True
                raise AssertionError("get_analytics_raw should not be called")

        repo = _TrackingRepo(questions=["q"])
        use_case = GetChatKeywordsUseCase(
            chat_repo=repo,
            group_query_repo=_StubGroupRepository(self._make_group()),
            keyword_extractor=_StubKeywordExtractor([]),
        )

        use_case.execute(group_id=1, user_id=42)

        self.assertFalse(_TrackingRepo.analytics_raw_called)
