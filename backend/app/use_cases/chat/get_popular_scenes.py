"""
Use case: Return the most frequently referenced scenes from a group's chat logs.
"""

from typing import List, Optional

from app.domain.chat.ports import SceneVideoInfoProvider
from app.domain.chat.repositories import ChatRepository, VideoGroupQueryRepository
from app.domain.chat.services import (
    GroupContextNotFound as _DomainGroupContextNotFound,
    aggregate_scenes,
    filter_group_scenes,
    member_video_id_set,
    require_group_context,
)
from app.use_cases.chat.dto import PopularSceneDTO
from app.use_cases.shared.exceptions import ResourceNotFound


class GetPopularScenesUseCase:
    """Aggregate and rank scenes referenced across a group's chat history."""

    def __init__(
        self,
        chat_repo: ChatRepository,
        group_query_repo: VideoGroupQueryRepository,
        scene_video_info_provider: SceneVideoInfoProvider,
    ):
        self.chat_repo = chat_repo
        self.group_query_repo = group_query_repo
        self.scene_video_info_provider = scene_video_info_provider

    def execute(
        self,
        group_id: int,
        limit: int = 20,
        user_id: Optional[int] = None,
        share_token: Optional[str] = None,
    ) -> List[PopularSceneDTO]:
        """
        Returns:
            List of PopularSceneDTO sorted by reference count.

        Raises:
            ResourceNotFound: If the group does not exist.
        """
        try:
            group = require_group_context(
                self.group_query_repo.get_with_members(
                    group_id=group_id,
                    user_id=user_id,
                    share_token=share_token,
                )
            )
        except _DomainGroupContextNotFound:
            raise ResourceNotFound("Group")

        chat_logs = self.chat_repo.get_logs_values_for_group(group.id)
        scene_counter, scene_info, scene_questions = aggregate_scenes(chat_logs)

        valid_video_ids = member_video_id_set(group)
        top_scenes = filter_group_scenes(scene_counter, valid_video_ids, limit)

        video_ids = [key[0] for key, _ in top_scenes]
        file_url_map = self.scene_video_info_provider.get_file_urls_for_ids(
            video_ids=video_ids, user_id=group.user_id
        )

        return [
            PopularSceneDTO(
                video_id=scene_info[key]["video_id"],
                title=scene_info[key]["title"],
                start_time=scene_info[key]["start_time"],
                end_time=scene_info[key]["end_time"],
                reference_count=count,
                file_url=file_url_map.get(key[0]),
                questions=scene_questions.get(key, []),
            )
            for key, count in top_scenes
        ]
