"""
Use case: Extract keywords from chat questions for a group.
"""

from typing import List

from app.domain.chat.ports import KeywordExtractor
from app.domain.chat.repositories import ChatRepository, VideoGroupQueryRepository
from app.domain.chat.services import (
    GroupContextNotFound as _DomainGroupContextNotFound,
    require_group_context,
)
from app.use_cases.chat.dto import KeywordCountDTO
from app.use_cases.shared.exceptions import ResourceNotFound


class GetChatKeywordsUseCase:
    """Extract top keywords from chat questions for a group."""

    def __init__(
        self,
        chat_repo: ChatRepository,
        group_query_repo: VideoGroupQueryRepository,
        keyword_extractor: KeywordExtractor,
    ):
        self.chat_repo = chat_repo
        self.group_query_repo = group_query_repo
        self.keyword_extractor = keyword_extractor

    def execute(self, group_id: int, user_id: int) -> List[KeywordCountDTO]:
        """
        Returns:
            List of KeywordCountDTO sorted by frequency.

        Raises:
            ResourceNotFound: If the group does not exist.
        """
        try:
            require_group_context(
                self.group_query_repo.get_with_members(group_id=group_id, user_id=user_id)
            )
        except _DomainGroupContextNotFound:
            raise ResourceNotFound("Group")

        questions = self.chat_repo.get_questions_for_group(group_id)
        keywords = self.keyword_extractor.extract(questions)

        return [
            KeywordCountDTO(word=item.word, count=item.count)
            for item in keywords
        ]
