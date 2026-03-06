"""Scene video info provider adapter for chat use cases."""

from typing import Dict, List, Optional

from app.domain.chat.ports import SceneVideoInfoProvider
from app.domain.video.ports import FileUrlResolver
from app.domain.video.repositories import VideoRepository


class DjangoSceneVideoInfoProvider(SceneVideoInfoProvider):
    """Resolve storage file keys to URLs for a set of videos."""

    def __init__(
        self,
        video_repo: VideoRepository,
        file_url_resolver: Optional[FileUrlResolver] = None,
    ):
        self.video_repo = video_repo
        self.file_url_resolver = file_url_resolver

    def get_file_urls_for_ids(
        self, video_ids: List[int], user_id: int
    ) -> Dict[int, Optional[str]]:
        file_key_map = self.video_repo.get_file_keys_for_ids(video_ids, user_id)
        if not self.file_url_resolver:
            return {video_id: None for video_id in video_ids}

        return {
            video_id: self.file_url_resolver.resolve(file_key_map.get(video_id))
            if file_key_map.get(video_id)
            else None
            for video_id in video_ids
        }
