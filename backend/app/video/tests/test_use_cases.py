from unittest.mock import Mock

from rest_framework.test import APITestCase

from app.video.use_cases import (AddTagsToVideoCommand,
                                 AddTagsToVideoUseCase,
                                 AddVideoToGroupCommand,
                                 AddVideoToGroupUseCase,
                                 AddVideosToGroupCommand,
                                 AddVideosToGroupUseCase,
                                 CreateShareLinkCommand,
                                 CreateShareLinkUseCase,
                                 UploadVideoCommand, UploadVideoUseCase)

class UploadVideoUseCaseTests(APITestCase):
    def test_execute_delegates_to_creator(self):
        video_creator = Mock(return_value=type("VideoObj", (), {"id": 17})())

        result = UploadVideoUseCase(video_creator=video_creator).execute(
            UploadVideoCommand(actor_id=1, validated_data={"title": "Demo"})
        )

        self.assertEqual(result.video_id, 17)
        video_creator.assert_called_once_with(
            UploadVideoCommand(actor_id=1, validated_data={"title": "Demo"})
        )


class AddVideoToGroupUseCaseTests(APITestCase):
    def test_execute_returns_member_id(self):
        member = type("Member", (), {"id": 42})()
        adder = Mock(return_value=member)

        result = AddVideoToGroupUseCase(
            group_member_adder=adder,
        ).execute(AddVideoToGroupCommand(actor_id=1, group_id=1, video_id=2))

        self.assertEqual(result.member_id, 42)
        adder.assert_called_once_with(
            AddVideoToGroupCommand(actor_id=1, group_id=1, video_id=2)
        )


class AddVideosToGroupUseCaseTests(APITestCase):
    def test_execute_returns_counts(self):
        group_members_adder = Mock(return_value={"added_count": 2, "skipped_count": 0})

        result = AddVideosToGroupUseCase(
            group_members_adder=group_members_adder,
        ).execute(AddVideosToGroupCommand(actor_id=1, group_id=1, video_ids=[10, 20]))

        self.assertEqual(result.added_count, 2)
        self.assertEqual(result.skipped_count, 0)


class CreateShareLinkUseCaseTests(APITestCase):
    def test_execute_generates_and_saves_token(self):
        share_token_updater = Mock(return_value="share-token")

        result = CreateShareLinkUseCase(
            share_token_updater=share_token_updater,
        ).execute(CreateShareLinkCommand(actor_id=1, group_id=1))

        self.assertEqual(result.share_token, "share-token")
        share_token_updater.assert_called_once_with(
            CreateShareLinkCommand(actor_id=1, group_id=1)
        )


class AddTagsToVideoUseCaseTests(APITestCase):
    def test_execute_returns_counts(self):
        video_tags_adder = Mock(return_value={"added_count": 1, "skipped_count": 0})

        result = AddTagsToVideoUseCase(
            video_tags_adder=video_tags_adder,
        ).execute(AddTagsToVideoCommand(actor_id=1, video_id=1, tag_ids=[99]))

        self.assertEqual(result.added_count, 1)
        self.assertEqual(result.skipped_count, 0)
