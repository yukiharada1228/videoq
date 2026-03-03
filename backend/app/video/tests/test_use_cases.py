from unittest.mock import Mock

from rest_framework.test import APITestCase

from app.video.use_cases import (AddTagsToVideoCommand, AddTagsToVideoUseCase,
                                 AddVideosToGroupCommand,
                                 AddVideosToGroupUseCase,
                                 AddVideoToGroupCommand,
                                 AddVideoToGroupUseCase,
                                 CreateShareLinkCommand,
                                 CreateShareLinkUseCase, CreateTagCommand,
                                 CreateTagUseCase, CreateVideoGroupCommand,
                                 CreateVideoGroupUseCase,
                                 DeleteShareLinkCommand,
                                 DeleteShareLinkUseCase, DeleteTagCommand,
                                 DeleteTagUseCase, DeleteVideoCommand,
                                 DeleteVideoGroupCommand,
                                 DeleteVideoGroupUseCase, DeleteVideoUseCase,
                                 GetSharedGroupQuery, GetSharedGroupUseCase,
                                 RemoveTagFromVideoCommand,
                                 RemoveTagFromVideoUseCase,
                                 RemoveVideoFromGroupCommand,
                                 RemoveVideoFromGroupUseCase,
                                 ReorderVideosInGroupCommand,
                                 ReorderVideosInGroupUseCase, UpdateTagCommand,
                                 UpdateTagUseCase, UpdateVideoCommand,
                                 UpdateVideoGroupCommand,
                                 UpdateVideoGroupUseCase, UpdateVideoUseCase,
                                 UploadVideoCommand, UploadVideoUseCase)


def _make_user(id=1):
    return type("UserObj", (), {"id": id})()


def _make_video(id=1, title="Test"):
    return type("VideoObj", (), {"id": id, "title": title})()


def _make_group(id=1, share_token=None):
    return type("GroupObj", (), {"id": id, "pk": id, "share_token": share_token})()


def _make_tag(id=1, name="tag"):
    return type("TagObj", (), {"id": id, "pk": id, "name": name})()


class UploadVideoUseCaseTests(APITestCase):
    def test_execute_creates_video(self):
        user = _make_user()
        video = _make_video(id=17)
        actor_loader = Mock(return_value=user)
        upload_limit_checker = Mock()
        video_creator = Mock(return_value=video)

        result = UploadVideoUseCase(
            actor_loader=actor_loader,
            upload_limit_checker=upload_limit_checker,
            video_creator=video_creator,
        ).execute(UploadVideoCommand(actor_id=1, validated_data={"title": "Demo"}))

        self.assertEqual(result.video_id, 17)
        upload_limit_checker.assert_called_once_with(user=user)
        video_creator.assert_called_once_with(
            user=user, validated_data={"title": "Demo"}
        )

    def test_execute_raises_when_limit_exceeded(self):
        actor_loader = Mock(return_value=_make_user())
        upload_limit_checker = Mock(side_effect=ValueError("limit reached"))
        video_creator = Mock()

        with self.assertRaises(ValueError):
            UploadVideoUseCase(
                actor_loader=actor_loader,
                upload_limit_checker=upload_limit_checker,
                video_creator=video_creator,
            ).execute(UploadVideoCommand(actor_id=1, validated_data={}))

        video_creator.assert_not_called()


class UpdateVideoUseCaseTests(APITestCase):
    def test_execute_updates_video(self):
        user = _make_user()
        video = _make_video(id=5, title="Old")
        updated_video = _make_video(id=5, title="New")
        actor_loader = Mock(return_value=user)
        owned_video_loader = Mock(return_value=video)
        video_updater = Mock(return_value=updated_video)
        video_title_vector_updater = Mock()

        result = UpdateVideoUseCase(
            actor_loader=actor_loader,
            owned_video_loader=owned_video_loader,
            video_updater=video_updater,
            video_title_vector_updater=video_title_vector_updater,
        ).execute(
            UpdateVideoCommand(actor_id=1, video_id=5, validated_data={"title": "New"})
        )

        self.assertEqual(result.id, 5)
        video_title_vector_updater.assert_called_once_with(5, "New")

    def test_execute_raises_when_not_found(self):
        actor_loader = Mock(return_value=_make_user())
        owned_video_loader = Mock(return_value=None)

        with self.assertRaises(LookupError):
            UpdateVideoUseCase(
                actor_loader=actor_loader,
                owned_video_loader=owned_video_loader,
                video_updater=Mock(),
                video_title_vector_updater=Mock(),
            ).execute(UpdateVideoCommand(actor_id=1, video_id=999, validated_data={}))


class DeleteVideoUseCaseTests(APITestCase):
    def test_execute_deletes_video(self):
        user = _make_user()
        video = _make_video()
        actor_loader = Mock(return_value=user)
        owned_video_loader = Mock(return_value=video)
        video_deleter = Mock()

        DeleteVideoUseCase(
            actor_loader=actor_loader,
            owned_video_loader=owned_video_loader,
            video_deleter=video_deleter,
        ).execute(DeleteVideoCommand(actor_id=1, video_id=1))

        video_deleter.assert_called_once_with(video=video)

    def test_execute_raises_when_not_found(self):
        actor_loader = Mock(return_value=_make_user())
        owned_video_loader = Mock(return_value=None)

        with self.assertRaises(LookupError):
            DeleteVideoUseCase(
                actor_loader=actor_loader,
                owned_video_loader=owned_video_loader,
                video_deleter=Mock(),
            ).execute(DeleteVideoCommand(actor_id=1, video_id=999))


class AddVideoToGroupUseCaseTests(APITestCase):
    def test_execute_returns_member_id(self):
        user = _make_user()
        group = _make_group()
        video = _make_video()
        member = type("Member", (), {"id": 42})()

        result = AddVideoToGroupUseCase(
            actor_loader=Mock(return_value=user),
            owned_group_loader=Mock(return_value=group),
            owned_video_loader=Mock(return_value=video),
            group_member_adder=Mock(return_value=member),
        ).execute(AddVideoToGroupCommand(actor_id=1, group_id=1, video_id=2))

        self.assertEqual(result.member_id, 42)

    def test_execute_raises_when_group_not_found(self):
        with self.assertRaises(LookupError):
            AddVideoToGroupUseCase(
                actor_loader=Mock(return_value=_make_user()),
                owned_group_loader=Mock(return_value=None),
                owned_video_loader=Mock(),
                group_member_adder=Mock(),
            ).execute(AddVideoToGroupCommand(actor_id=1, group_id=999, video_id=1))

    def test_execute_raises_when_already_added(self):
        with self.assertRaises(ValueError):
            AddVideoToGroupUseCase(
                actor_loader=Mock(return_value=_make_user()),
                owned_group_loader=Mock(return_value=_make_group()),
                owned_video_loader=Mock(return_value=_make_video()),
                group_member_adder=Mock(return_value=None),
            ).execute(AddVideoToGroupCommand(actor_id=1, group_id=1, video_id=1))


class AddVideosToGroupUseCaseTests(APITestCase):
    def test_execute_returns_counts(self):
        user = _make_user()
        group = _make_group()
        videos = [_make_video(id=10), _make_video(id=20)]

        result = AddVideosToGroupUseCase(
            actor_loader=Mock(return_value=user),
            owned_group_loader=Mock(return_value=group),
            owned_videos_loader=Mock(return_value=videos),
            group_members_adder=Mock(
                return_value={"added_count": 2, "skipped_count": 0}
            ),
        ).execute(AddVideosToGroupCommand(actor_id=1, group_id=1, video_ids=[10, 20]))

        self.assertEqual(result.added_count, 2)
        self.assertEqual(result.skipped_count, 0)

    def test_execute_raises_when_some_videos_not_found(self):
        with self.assertRaises(LookupError):
            AddVideosToGroupUseCase(
                actor_loader=Mock(return_value=_make_user()),
                owned_group_loader=Mock(return_value=_make_group()),
                owned_videos_loader=Mock(return_value=[_make_video(id=10)]),
                group_members_adder=Mock(),
            ).execute(
                AddVideosToGroupCommand(actor_id=1, group_id=1, video_ids=[10, 20])
            )


class ReorderVideosInGroupUseCaseTests(APITestCase):
    def test_execute_reorders(self):
        group_reorderer = Mock()

        ReorderVideosInGroupUseCase(
            actor_loader=Mock(return_value=_make_user()),
            owned_group_loader=Mock(return_value=_make_group()),
            group_reorderer=group_reorderer,
        ).execute(ReorderVideosInGroupCommand(actor_id=1, group_id=1, video_ids=[2, 1]))

        group_reorderer.assert_called_once()


class RemoveVideoFromGroupUseCaseTests(APITestCase):
    def test_execute_removes_member(self):
        group_member_remover = Mock()

        RemoveVideoFromGroupUseCase(
            actor_loader=Mock(return_value=_make_user()),
            owned_group_loader=Mock(return_value=_make_group()),
            owned_video_loader=Mock(return_value=_make_video()),
            group_member_remover=group_member_remover,
        ).execute(RemoveVideoFromGroupCommand(actor_id=1, group_id=1, video_id=1))

        group_member_remover.assert_called_once()

    def test_execute_raises_when_group_not_found(self):
        with self.assertRaises(LookupError):
            RemoveVideoFromGroupUseCase(
                actor_loader=Mock(return_value=_make_user()),
                owned_group_loader=Mock(return_value=None),
                owned_video_loader=Mock(),
                group_member_remover=Mock(),
            ).execute(RemoveVideoFromGroupCommand(actor_id=1, group_id=999, video_id=1))


class CreateShareLinkUseCaseTests(APITestCase):
    def test_execute_generates_token(self):
        share_token_saver = Mock()

        result = CreateShareLinkUseCase(
            actor_loader=Mock(return_value=_make_user()),
            owned_group_loader=Mock(return_value=_make_group()),
            share_token_saver=share_token_saver,
        ).execute(CreateShareLinkCommand(actor_id=1, group_id=1))

        self.assertIsNotNone(result.share_token)
        share_token_saver.assert_called_once()


class DeleteShareLinkUseCaseTests(APITestCase):
    def test_execute_clears_token(self):
        share_token_saver = Mock()

        DeleteShareLinkUseCase(
            actor_loader=Mock(return_value=_make_user()),
            owned_group_loader=Mock(return_value=_make_group(share_token="abc")),
            share_token_saver=share_token_saver,
        ).execute(DeleteShareLinkCommand(actor_id=1, group_id=1))

        share_token_saver.assert_called_once()

    def test_execute_raises_when_no_token(self):
        with self.assertRaises(LookupError):
            DeleteShareLinkUseCase(
                actor_loader=Mock(return_value=_make_user()),
                owned_group_loader=Mock(return_value=_make_group(share_token=None)),
                share_token_saver=Mock(),
            ).execute(DeleteShareLinkCommand(actor_id=1, group_id=1))


class GetSharedGroupUseCaseTests(APITestCase):
    def test_execute_returns_group(self):
        group = _make_group()
        shared_group_loader = Mock(return_value=group)

        result = GetSharedGroupUseCase(
            shared_group_loader=shared_group_loader,
        ).execute(GetSharedGroupQuery(share_token="abc"))

        self.assertEqual(result.id, 1)
        shared_group_loader.assert_called_once_with(share_token="abc")


class CreateVideoGroupUseCaseTests(APITestCase):
    def test_execute_creates_group(self):
        user = _make_user()
        group = _make_group()
        group_creator = Mock(return_value=group)

        result = CreateVideoGroupUseCase(
            actor_loader=Mock(return_value=user),
            group_creator=group_creator,
        ).execute(CreateVideoGroupCommand(actor_id=1, validated_data={"name": "G1"}))

        self.assertEqual(result.pk, 1)
        group_creator.assert_called_once_with(user=user, validated_data={"name": "G1"})


class UpdateVideoGroupUseCaseTests(APITestCase):
    def test_execute_updates_group(self):
        user = _make_user()
        group = _make_group()
        updated_group = _make_group()
        group_updater = Mock(return_value=updated_group)

        UpdateVideoGroupUseCase(
            actor_loader=Mock(return_value=user),
            owned_group_loader=Mock(return_value=group),
            group_updater=group_updater,
        ).execute(
            UpdateVideoGroupCommand(
                actor_id=1, group_id=1, validated_data={"name": "Updated"}
            )
        )

        group_updater.assert_called_once_with(
            group=group, validated_data={"name": "Updated"}
        )

    def test_execute_raises_when_not_found(self):
        with self.assertRaises(LookupError):
            UpdateVideoGroupUseCase(
                actor_loader=Mock(return_value=_make_user()),
                owned_group_loader=Mock(return_value=None),
                group_updater=Mock(),
            ).execute(
                UpdateVideoGroupCommand(actor_id=1, group_id=999, validated_data={})
            )


class DeleteVideoGroupUseCaseTests(APITestCase):
    def test_execute_deletes_group(self):
        group = _make_group()
        group_deleter = Mock()

        DeleteVideoGroupUseCase(
            actor_loader=Mock(return_value=_make_user()),
            owned_group_loader=Mock(return_value=group),
            group_deleter=group_deleter,
        ).execute(DeleteVideoGroupCommand(actor_id=1, group_id=1))

        group_deleter.assert_called_once_with(group=group)


class AddTagsToVideoUseCaseTests(APITestCase):
    def test_execute_returns_counts(self):
        user = _make_user()
        video = _make_video()
        tags = [_make_tag(id=1), _make_tag(id=2)]

        result = AddTagsToVideoUseCase(
            actor_loader=Mock(return_value=user),
            owned_video_loader=Mock(return_value=video),
            owned_tags_loader=Mock(return_value=tags),
            video_tags_adder=Mock(return_value={"added_count": 2, "skipped_count": 0}),
        ).execute(AddTagsToVideoCommand(actor_id=1, video_id=1, tag_ids=[1, 2]))

        self.assertEqual(result.added_count, 2)
        self.assertEqual(result.skipped_count, 0)

    def test_execute_raises_when_video_not_found(self):
        with self.assertRaises(LookupError):
            AddTagsToVideoUseCase(
                actor_loader=Mock(return_value=_make_user()),
                owned_video_loader=Mock(return_value=None),
                owned_tags_loader=Mock(),
                video_tags_adder=Mock(),
            ).execute(AddTagsToVideoCommand(actor_id=1, video_id=999, tag_ids=[1]))


class RemoveTagFromVideoUseCaseTests(APITestCase):
    def test_execute_removes_tag(self):
        video_tag_remover = Mock()

        RemoveTagFromVideoUseCase(
            actor_loader=Mock(return_value=_make_user()),
            owned_video_loader=Mock(return_value=_make_video()),
            owned_tag_loader=Mock(return_value=_make_tag()),
            video_tag_remover=video_tag_remover,
        ).execute(RemoveTagFromVideoCommand(actor_id=1, video_id=1, tag_id=1))

        video_tag_remover.assert_called_once()

    def test_execute_raises_when_tag_not_found(self):
        with self.assertRaises(LookupError):
            RemoveTagFromVideoUseCase(
                actor_loader=Mock(return_value=_make_user()),
                owned_video_loader=Mock(return_value=_make_video()),
                owned_tag_loader=Mock(return_value=None),
                video_tag_remover=Mock(),
            ).execute(RemoveTagFromVideoCommand(actor_id=1, video_id=1, tag_id=999))


class CreateTagUseCaseTests(APITestCase):
    def test_execute_creates_tag(self):
        user = _make_user()
        tag = _make_tag()
        tag_creator = Mock(return_value=tag)

        result = CreateTagUseCase(
            actor_loader=Mock(return_value=user),
            tag_creator=tag_creator,
        ).execute(
            CreateTagCommand(
                actor_id=1, validated_data={"name": "tag", "color": "#000000"}
            )
        )

        self.assertEqual(result.pk, 1)
        tag_creator.assert_called_once_with(
            user=user, validated_data={"name": "tag", "color": "#000000"}
        )


class UpdateTagUseCaseTests(APITestCase):
    def test_execute_updates_tag(self):
        tag = _make_tag()
        tag_updater = Mock(return_value=tag)

        UpdateTagUseCase(
            actor_loader=Mock(return_value=_make_user()),
            owned_tag_loader=Mock(return_value=tag),
            tag_updater=tag_updater,
        ).execute(
            UpdateTagCommand(actor_id=1, tag_id=1, validated_data={"name": "updated"})
        )

        tag_updater.assert_called_once_with(tag=tag, validated_data={"name": "updated"})

    def test_execute_raises_when_not_found(self):
        with self.assertRaises(LookupError):
            UpdateTagUseCase(
                actor_loader=Mock(return_value=_make_user()),
                owned_tag_loader=Mock(return_value=None),
                tag_updater=Mock(),
            ).execute(UpdateTagCommand(actor_id=1, tag_id=999, validated_data={}))


class DeleteTagUseCaseTests(APITestCase):
    def test_execute_deletes_tag(self):
        tag = _make_tag()
        tag_deleter = Mock()

        DeleteTagUseCase(
            actor_loader=Mock(return_value=_make_user()),
            owned_tag_loader=Mock(return_value=tag),
            tag_deleter=tag_deleter,
        ).execute(DeleteTagCommand(actor_id=1, tag_id=1))

        tag_deleter.assert_called_once_with(tag=tag)

    def test_execute_raises_when_not_found(self):
        with self.assertRaises(LookupError):
            DeleteTagUseCase(
                actor_loader=Mock(return_value=_make_user()),
                owned_tag_loader=Mock(return_value=None),
                tag_deleter=Mock(),
            ).execute(DeleteTagCommand(actor_id=1, tag_id=999))
