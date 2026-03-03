"""Service functions that contain real business logic beyond simple repository calls.

Thin wrappers around repository functions have been removed.
Use Case factories now inject repository functions directly via ports.
"""

from app.chat import repositories


def create_chat_response_payload(result, group_id, group, user, is_shared):
    """Build chat response data and persist chat history when grouped."""
    response_data = {
        "role": "assistant",
        "content": result.llm_response.content,
    }

    if group_id is not None and result.related_videos:
        response_data["related_videos"] = result.related_videos

    if group_id is not None and group is not None:
        chat_log = repositories.create_chat_log(
            user=(group.user if is_shared else user),
            group=group,
            question=result.query_text,
            answer=result.llm_response.content,
            related_videos=result.related_videos or [],
            is_shared_origin=is_shared,
        )
        response_data["chat_log_id"] = chat_log.id
        response_data["feedback"] = chat_log.feedback

    return response_data


def update_chat_feedback(*, chat_log_id, feedback, request_user=None, share_token=None):
    """Validate access and update chat feedback."""
    chat_log = repositories.get_chat_log_with_group(chat_log_id=chat_log_id)
    if not chat_log:
        raise LookupError("Specified chat history not found")

    if share_token:
        if chat_log.group.share_token != share_token:
            raise PermissionError("Share token mismatch")
    else:
        if request_user is None or chat_log.group.user_id != request_user.id:
            raise PermissionError("No permission to access this history")

    return repositories.save_chat_feedback(chat_log=chat_log, feedback=feedback)
