"""
Use case: Return the most frequently referenced scenes from a group's chat logs.
"""

from typing import List, Optional

from app.domain.chat.repositories import ChatRepository, VideoGroupQueryRepository
from app.domain.chat.services import aggregate_scenes, filter_group_scenes
from app.domain.video.ports import FileUrlResolver
from app.domain.video.repositories import VideoRepository
from app.use_cases.chat.dto import PopularSceneDTO
from app.use_cases.shared.exceptions import ResourceNotFound


class GetPopularScenesUseCase:
    """Aggregate and rank scenes referenced across a group's chat history."""

    def __init__(
        self,
        chat_repo: ChatRepository,
        group_query_repo: VideoGroupQueryRepository,
        video_repo: VideoRepository,
        file_url_resolver: Optional[FileUrlResolver] = None,
    ):
        self.chat_repo = chat_repo
        self.group_query_repo = group_query_repo
        self.video_repo = video_repo
        self.file_url_resolver = file_url_resolver

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
        group = self.group_query_repo.get_with_members(
            group_id=group_id,
            user_id=user_id,
            share_token=share_token,
        )
        if group is None:
            raise ResourceNotFound("Group")

        chat_logs = self.chat_repo.get_logs_values_for_group(group.id)
        scene_counter, scene_info, scene_questions = aggregate_scenes(chat_logs)

        valid_video_ids = {member.video_id for member in group.members}
        top_scenes = filter_group_scenes(scene_counter, valid_video_ids, limit)

        video_ids = [key[0] for key, _ in top_scenes]
        file_key_map = self.video_repo.get_file_keys_for_ids(video_ids, group.user_id)

        def _resolve(file_key):
            if not file_key:
                return None
            if self.file_url_resolver:
                return self.file_url_resolver.resolve(file_key)
            return None

        return [
            PopularSceneDTO(
                video_id=scene_info[key]["video_id"],
                title=scene_info[key]["title"],
                start_time=scene_info[key]["start_time"],
                end_time=scene_info[key]["end_time"],
                reference_count=count,
                file_url=_resolve(file_key_map.get(key[0])),
                questions=scene_questions.get(key, []),
            )
            for key, count in top_scenes
        ]
