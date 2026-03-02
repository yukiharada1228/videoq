from app.chat.use_cases import (GetChatAnalyticsQuery, GetPopularScenesQuery,
                                SendChatMessageCommand,
                                UpdateChatFeedbackCommand)


def _extract_request_locale(accept_language: str):
    return (
        (accept_language.split(",")[0].split(";")[0].strip() if accept_language else "")
        or None
    )


class SendChatMessageAdapter:
    def __init__(
        self,
        *,
        actor_loader,
        video_group_loader,
        llm_loader,
        rag_chat_service_factory,
        chat_response_payload_builder,
    ):
        self._actor_loader = actor_loader
        self._video_group_loader = video_group_loader
        self._llm_loader = llm_loader
        self._rag_chat_service_factory = rag_chat_service_factory
        self._chat_response_payload_builder = chat_response_payload_builder

    def __call__(self, command: SendChatMessageCommand):
        is_shared = command.share_token is not None
        if is_shared:
            if not command.group_id:
                raise ValueError("Group ID not specified")
            try:
                group = self._video_group_loader(
                    command.group_id,
                    share_token=command.share_token,
                )
            except Exception as exc:
                raise LookupError("Shared group not found") from exc
            user = group.user
        else:
            if command.actor_id is None:
                raise ValueError("Authenticated user not found")
            user = self._actor_loader(command.actor_id)
            group = None

        if not command.messages:
            raise ValueError("Messages are empty")

        llm = self._llm_loader(user)

        if command.group_id is not None and not is_shared:
            try:
                group = self._video_group_loader(command.group_id, user_id=user.id)
            except Exception as exc:
                raise LookupError("Specified group not found") from exc

        service = self._rag_chat_service_factory(user=user, llm=llm)
        result = service.run(
            messages=command.messages,
            group=group if command.group_id is not None else None,
            locale=_extract_request_locale(command.accept_language),
        )
        return self._chat_response_payload_builder(
            result,
            command.group_id,
            group,
            user,
            is_shared,
        )


class UpdateChatFeedbackAdapter:
    def __init__(self, *, actor_loader, chat_feedback_updater):
        self._actor_loader = actor_loader
        self._chat_feedback_updater = chat_feedback_updater

    def __call__(self, command: UpdateChatFeedbackCommand):
        request_user = (
            self._actor_loader(command.actor_id)
            if command.actor_id is not None
            else None
        )
        return self._chat_feedback_updater(
            chat_log_id=command.chat_log_id,
            feedback=command.feedback,
            request_user=request_user,
            share_token=command.share_token,
        )


class GetPopularScenesAdapter:
    def __init__(self, *, video_group_loader, popular_scenes_builder):
        self._video_group_loader = video_group_loader
        self._popular_scenes_builder = popular_scenes_builder

    def __call__(self, query: GetPopularScenesQuery):
        try:
            if query.share_token:
                group = self._video_group_loader(query.group_id, share_token=query.share_token)
            else:
                group = self._video_group_loader(query.group_id, user_id=query.actor_id)
        except Exception as exc:
            raise LookupError("Specified group not found") from exc
        return self._popular_scenes_builder(group, limit=query.limit)


class GetChatAnalyticsAdapter:
    def __init__(self, *, video_group_loader, chat_analytics_builder):
        self._video_group_loader = video_group_loader
        self._chat_analytics_builder = chat_analytics_builder

    def __call__(self, query: GetChatAnalyticsQuery):
        try:
            group = self._video_group_loader(query.group_id, user_id=query.actor_id)
        except Exception as exc:
            raise LookupError("Specified group not found") from exc
        return self._chat_analytics_builder(group)
