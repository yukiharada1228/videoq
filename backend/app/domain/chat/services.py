"""
Domain services for the chat domain.
Pure business logic: scene aggregation and filtering.
Keyword extraction has been moved to infrastructure (app.infrastructure.chat.keyword_extractor)
and injected via the KeywordExtractor port (app.domain.chat.ports.KeywordExtractor).
"""

from collections import Counter
from dataclasses import dataclass
from typing import TYPE_CHECKING, Dict, List, Optional, Tuple

from app.domain.chat.value_objects import ChatSceneLog

if TYPE_CHECKING:
    from app.domain.chat.entities import VideoGroupContextEntity


class InvalidSendMessageRequest(Exception):
    """Raised when send-message input preconditions are invalid."""


class OwnerUserResolutionError(Exception):
    """Raised when an owner user cannot be resolved for the chat request."""


class GroupContextNotFound(Exception):
    """Raised when the target video group cannot be resolved for a request."""


@dataclass(frozen=True)
class ChatRequestPolicy:
    """Domain policy object for shared/authenticated chat access rules."""

    is_shared: bool
    authenticated_user_id: Optional[int]
    share_token: Optional[str]
    group_id: Optional[int]

    def validate_send_message_preconditions(self, *, messages_count: int) -> None:
        if messages_count == 0:
            raise InvalidSendMessageRequest("Messages are empty.")
        if self.is_shared and self.group_id is None:
            raise InvalidSendMessageRequest("Group ID not specified.")

    def resolve_owner_user_id(self, *, group_user_id: Optional[int]) -> int:
        owner_user_id = (
            group_user_id
            if self.is_shared and group_user_id is not None
            else self.authenticated_user_id
        )
        if owner_user_id is None:
            raise OwnerUserResolutionError("Authentication is required to send messages.")
        return owner_user_id

    def build_group_lookup_params(self) -> Dict[str, Optional[int | str]]:
        if self.is_shared and self.share_token:
            return {"share_token": self.share_token}
        return {"user_id": self.authenticated_user_id}


def validate_send_message_preconditions(
    *, messages_count: int, is_shared: bool, group_id: Optional[int]
) -> None:
    ChatRequestPolicy(
        is_shared=is_shared,
        authenticated_user_id=None,
        share_token=None,
        group_id=group_id,
    ).validate_send_message_preconditions(messages_count=messages_count)


def resolve_owner_user_id(
    *,
    is_shared: bool,
    authenticated_user_id: Optional[int],
    group_user_id: Optional[int],
) -> int:
    return ChatRequestPolicy(
        is_shared=is_shared,
        authenticated_user_id=authenticated_user_id,
        share_token=None,
        group_id=None,
    ).resolve_owner_user_id(group_user_id=group_user_id)


def build_group_lookup_params(
    *,
    is_shared: bool,
    authenticated_user_id: Optional[int],
    share_token: Optional[str],
) -> Dict[str, Optional[int | str]]:
    return ChatRequestPolicy(
        is_shared=is_shared,
        authenticated_user_id=authenticated_user_id,
        share_token=share_token,
        group_id=None,
    ).build_group_lookup_params()


def require_group_context(
    group: Optional["VideoGroupContextEntity"],
) -> "VideoGroupContextEntity":
    if group is None:
        raise GroupContextNotFound("Group")
    return group


def member_video_id_set(group: "VideoGroupContextEntity") -> set[int]:
    return {member.video_id for member in group.members}


def aggregate_scenes(
    chat_logs: List[ChatSceneLog],
) -> Tuple[Counter, Dict, Dict]:
    """
    Aggregate scene references from chat logs.

    Returns:
        (scene_counter, scene_info, scene_questions)
    """
    scene_counter: Counter = Counter()
    scene_info: Dict = {}
    scene_questions: Dict = {}

    for log in chat_logs:
        question = log.question
        if not log.related_videos:
            continue
        for rv in log.related_videos:
            video_id = rv.video_id
            start_time = rv.start_time
            if not video_id or not start_time:
                continue

            key = (video_id, start_time)
            scene_counter[key] += 1

            if key not in scene_info:
                scene_info[key] = {
                    "video_id": rv.video_id,
                    "title": rv.title,
                    "start_time": rv.start_time,
                    "end_time": rv.end_time or rv.start_time,
                }

            if question:
                if key not in scene_questions:
                    scene_questions[key] = []
                if (
                    len(scene_questions[key]) < 3
                    and question not in scene_questions[key]
                ):
                    scene_questions[key].append(question)

    return scene_counter, scene_info, scene_questions


def filter_group_scenes(
    scene_counter: Counter,
    valid_video_ids: set,
    limit: Optional[int] = None,
) -> List[Tuple]:
    """Keep only scenes that belong to videos in valid_video_ids."""
    scenes = [
        (key, count)
        for key, count in scene_counter.most_common()
        if key[0] in valid_video_ids
    ]
    return scenes[:limit] if limit is not None else scenes
