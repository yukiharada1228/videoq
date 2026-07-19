"""
Domain services for the chat domain.
"""

from dataclasses import dataclass
from typing import TYPE_CHECKING, Dict, Optional

from app.domain.chat.exceptions import InvalidFeedbackValue

if TYPE_CHECKING:
    from app.domain.chat.entities import VideoGroupContextEntity


class InvalidSendMessageRequest(Exception):
    """Raised when send-message input preconditions are invalid."""


class OwnerUserResolutionError(Exception):
    """Raised when an owner user cannot be resolved for the chat request."""


class GroupContextNotFound(Exception):
    """Raised when the target video group cannot be resolved for a request."""


def validate_feedback_value(feedback: Optional[str]) -> None:
    """Validate allowed feedback values."""
    if feedback not in {None, "good", "bad"}:
        raise InvalidFeedbackValue("feedback must be 'good', 'bad', or null (unspecified)")


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


def require_group_context(
    group: Optional["VideoGroupContextEntity"],
) -> "VideoGroupContextEntity":
    if group is None:
        raise GroupContextNotFound("Group")
    return group


def member_video_id_set(group: "VideoGroupContextEntity") -> set[int]:
    return {member.video_id for member in group.members}
