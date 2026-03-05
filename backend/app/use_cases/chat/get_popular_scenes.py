"""
Use case: Return the most frequently referenced scenes from a group's chat logs.
"""

from typing import List, Optional

from app.domain.chat.repositories import ChatRepository, VideoGroupQueryRepository
from app.domain.chat.services import aggregate_scenes, filter_group_scenes
from app.domain.video.repositories import VideoRepository
from app.use_cases.shared.exceptions import ResourceNotFound


class GetPopularScenesUseCase:
    """Aggregate and rank scenes referenced across a group's chat history."""

    def __init__(
        self,
        chat_repo: ChatRepository,
        group_query_repo: VideoGroupQueryRepository,
        video_repo: VideoRepository,
    ):
        self.chat_repo = chat_repo
        self.group_query_repo = group_query_repo
        self.video_repo = video_repo

    def execute(
        self,
        group_id: int,
        limit: int = 20,
        user_id: Optional[int] = None,
        share_token: Optional[str] = None,
    ) -> List[dict]:
        """
        Returns:
            List of scene dicts sorted by reference count.

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
        video_file_map = self.video_repo.get_file_urls_for_ids(video_ids, group.user_id)

        return [
            {
                "video_id": scene_info[key]["video_id"],
                "title": scene_info[key]["title"],
                "start_time": scene_info[key]["start_time"],
                "end_time": scene_info[key]["end_time"],
                "reference_count": count,
                "file": video_file_map.get(key[0]),
                "questions": scene_questions.get(key, []),
            }
            for key, count in top_scenes
        ]
