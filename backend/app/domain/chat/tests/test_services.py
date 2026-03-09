"""Unit tests for chat domain services."""

from unittest import TestCase

from app.domain.chat.services import (
    ChatRequestPolicy,
    GroupContextNotFound,
    InvalidSendMessageRequest,
    OwnerUserResolutionError,
    build_group_lookup_params,
    member_video_id_set,
    require_group_context,
    resolve_owner_user_id,
    validate_feedback_value,
    validate_send_message_preconditions,
)
from app.domain.chat.entities import VideoGroupContextEntity, VideoGroupMemberRef
from app.domain.chat.exceptions import InvalidFeedbackValue


class ChatDomainServicesTests(TestCase):
    def test_validate_feedback_value_accepts_normalized_values(self):
        validate_feedback_value("good")
        validate_feedback_value("bad")
        validate_feedback_value(None)

    def test_validate_feedback_value_rejects_invalid_value(self):
        with self.assertRaises(InvalidFeedbackValue):
            validate_feedback_value("excellent")

    def test_chat_request_policy_validates_non_empty_messages(self):
        policy = ChatRequestPolicy(
            is_shared=False,
            authenticated_user_id=5,
            share_token=None,
            group_id=None,
        )

        with self.assertRaises(InvalidSendMessageRequest):
            policy.validate_send_message_preconditions(messages_count=0)

    def test_chat_request_policy_resolves_owner_for_shared_request(self):
        policy = ChatRequestPolicy(
            is_shared=True,
            authenticated_user_id=None,
            share_token="token",
            group_id=1,
        )

        owner = policy.resolve_owner_user_id(group_user_id=42)
        self.assertEqual(owner, 42)

    def test_chat_request_policy_builds_lookup_params(self):
        shared = ChatRequestPolicy(
            is_shared=True,
            authenticated_user_id=5,
            share_token="token",
            group_id=1,
        )
        self.assertEqual(shared.build_group_lookup_params(), {"share_token": "token"})

        private = ChatRequestPolicy(
            is_shared=False,
            authenticated_user_id=5,
            share_token="token",
            group_id=1,
        )
        self.assertEqual(private.build_group_lookup_params(), {"user_id": 5})

    def test_validate_send_message_preconditions_rejects_empty_messages(self):
        with self.assertRaises(InvalidSendMessageRequest):
            validate_send_message_preconditions(messages_count=0, is_shared=False, group_id=None)

    def test_validate_send_message_preconditions_rejects_shared_without_group(self):
        with self.assertRaises(InvalidSendMessageRequest):
            validate_send_message_preconditions(messages_count=1, is_shared=True, group_id=None)

    def test_resolve_owner_user_id_shared_uses_group_owner(self):
        owner = resolve_owner_user_id(
            is_shared=True,
            authenticated_user_id=None,
            group_user_id=42,
        )
        self.assertEqual(owner, 42)

    def test_resolve_owner_user_id_requires_auth_when_non_shared(self):
        with self.assertRaises(OwnerUserResolutionError):
            resolve_owner_user_id(
                is_shared=False,
                authenticated_user_id=None,
                group_user_id=None,
            )

    def test_build_group_lookup_params_prefers_share_token_for_shared_flow(self):
        params = build_group_lookup_params(
            is_shared=True,
            authenticated_user_id=5,
            share_token="token",
        )
        self.assertEqual(params, {"share_token": "token"})

    def test_build_group_lookup_params_uses_user_for_non_shared_flow(self):
        params = build_group_lookup_params(
            is_shared=False,
            authenticated_user_id=5,
            share_token="token",
        )
        self.assertEqual(params, {"user_id": 5})

    def test_require_group_context_raises_when_missing(self):
        with self.assertRaises(GroupContextNotFound):
            require_group_context(None)

    def test_member_video_id_set_returns_ids_from_group_members(self):
        group = VideoGroupContextEntity(
            id=1,
            user_id=1,
            name="g",
            members=[VideoGroupMemberRef(video_id=10), VideoGroupMemberRef(video_id=11)],
        )
        self.assertEqual(member_video_id_set(group), {10, 11})
