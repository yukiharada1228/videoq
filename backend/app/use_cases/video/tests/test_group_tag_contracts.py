"""Unit tests for explicit group/tag boundary contracts in video use cases."""

from unittest import TestCase

from app.domain.video.entities import TagEntity, VideoEntity, VideoGroupEntity, VideoGroupMemberEntity
from app.domain.video.exceptions import (
    SomeTagsNotFound,
    TagNotAttachedToVideo,
    VideoAlreadyInGroup as DomainVideoAlreadyInGroup,
    VideoNotInGroup as DomainVideoNotInGroup,
)
from app.use_cases.video.create_group_with_detail import CreateVideoGroupWithDetailUseCase
from app.use_cases.video.create_group import CreateVideoGroupUseCase
from app.use_cases.video.create_tag import CreateTagUseCase
from app.use_cases.video.dto import CreateGroupInput, CreateTagInput, UpdateGroupInput, UpdateTagInput
from app.use_cases.video.exceptions import ResourceNotFound, VideoAlreadyInGroup, VideoNotInGroup
from app.use_cases.video.manage_groups import AddVideoToGroupUseCase, RemoveVideoFromGroupUseCase
from app.use_cases.video.manage_tags import AddTagsToVideoUseCase, RemoveTagFromVideoUseCase
from app.use_cases.video.update_group import UpdateVideoGroupUseCase
from app.use_cases.video.update_group_with_detail import UpdateVideoGroupWithDetailUseCase
from app.use_cases.video.update_tag import UpdateTagUseCase
from app.use_cases.video.update_tag_with_detail import UpdateTagWithDetailUseCase


class _FakeVideoRepo:
    def __init__(self, video):
        self.video = video

    def get_by_id(self, video_id: int, user_id: int):
        if self.video and self.video.id == video_id and self.video.user_id == user_id:
            return self.video
        return None


class _FakeGroupRepo:
    def __init__(self, group):
        self.group = group
        self.create_called = False
        self.update_called = False

    def get_by_id(self, group_id: int, user_id: int, include_videos: bool = False):
        if self.group and self.group.id == group_id and self.group.user_id == user_id:
            return self.group
        return None

    def add_video(self, group, video):
        raise DomainVideoAlreadyInGroup()

    def remove_video(self, group, video):
        raise DomainVideoNotInGroup()

    def create(self, user_id: int, params):
        self.create_called = True
        return self.group

    def update(self, group, params):
        self.update_called = True
        return group


class _FakeTagRepo:
    def __init__(self, tag):
        self.tag = tag
        self.update_called = False

    def get_by_id(self, tag_id: int, user_id: int):
        if self.tag and self.tag.id == tag_id and self.tag.user_id == user_id:
            return self.tag
        return None

    def add_tags_to_video(self, video, tag_ids):
        raise SomeTagsNotFound()

    def remove_tag_from_video(self, video, tag):
        raise TagNotAttachedToVideo()

    def update(self, tag, params):
        self.update_called = True
        return tag

    def create(self, user_id: int, params):
        return self.tag

    def get_with_videos(self, tag_id: int, user_id: int):
        return self.get_by_id(tag_id, user_id)


class GroupTagContractsUseCaseTests(TestCase):
    def setUp(self):
        self.user_id = 7
        self.video = VideoEntity(id=10, user_id=self.user_id, title="v", status="completed")
        self.group = VideoGroupEntity(
            id=20,
            user_id=self.user_id,
            name="g",
            members=[VideoGroupMemberEntity(id=1, group_id=20, video_id=10, order=0, video=self.video)],
            video_count=1,
        )
        self.tag = TagEntity(id=30, user_id=self.user_id, name="t", color="#111111")

    def test_add_video_to_group_raises_explicit_business_exception(self):
        use_case = AddVideoToGroupUseCase(_FakeVideoRepo(self.video), _FakeGroupRepo(self.group))
        with self.assertRaises(VideoAlreadyInGroup):
            use_case.execute(self.group.id, self.video.id, self.user_id)

    def test_remove_video_from_group_raises_explicit_business_exception(self):
        use_case = RemoveVideoFromGroupUseCase(_FakeVideoRepo(self.video), _FakeGroupRepo(self.group))
        with self.assertRaises(VideoNotInGroup):
            use_case.execute(self.group.id, self.video.id, self.user_id)

    def test_add_tags_maps_some_tags_not_found_to_resource_not_found(self):
        use_case = AddTagsToVideoUseCase(_FakeVideoRepo(self.video), _FakeTagRepo(self.tag))
        with self.assertRaises(ResourceNotFound):
            use_case.execute(self.video.id, [1, 2], self.user_id)

    def test_remove_tag_maps_not_attached_to_resource_not_found(self):
        use_case = RemoveTagFromVideoUseCase(_FakeVideoRepo(self.video), _FakeTagRepo(self.tag))
        with self.assertRaises(ResourceNotFound):
            use_case.execute(self.video.id, self.tag.id, self.user_id)

    def test_create_group_with_detail_returns_detail_dto(self):
        repo = _FakeGroupRepo(self.group)
        use_case = CreateVideoGroupWithDetailUseCase(repo)
        result = use_case.execute(self.user_id, CreateGroupInput(name="group", description=""))
        self.assertEqual(result.id, self.group.id)
        self.assertTrue(repo.create_called)

    def test_update_group_with_detail_returns_detail_dto(self):
        repo = _FakeGroupRepo(self.group)
        use_case = UpdateVideoGroupWithDetailUseCase(repo)
        result = use_case.execute(
            self.group.id,
            self.user_id,
            UpdateGroupInput(name="updated", description="desc"),
        )
        self.assertEqual(result.id, self.group.id)
        self.assertTrue(repo.update_called)

    def test_update_tag_with_detail_returns_detail_dto(self):
        repo = _FakeTagRepo(self.tag)
        use_case = UpdateTagWithDetailUseCase(repo)
        result = use_case.execute(
            self.tag.id,
            self.user_id,
            UpdateTagInput(name="updated", color="#222222"),
        )
        self.assertEqual(result.id, self.tag.id)
        self.assertTrue(repo.update_called)

    def test_create_group_returns_list_response_dto(self):
        repo = _FakeGroupRepo(self.group)
        use_case = CreateVideoGroupUseCase(repo)
        result = use_case.execute(self.user_id, CreateGroupInput(name="group", description=""))
        self.assertEqual(result.id, self.group.id)
        self.assertEqual(result.name, self.group.name)
        self.assertTrue(repo.create_called)

    def test_update_group_returns_list_response_dto(self):
        repo = _FakeGroupRepo(self.group)
        use_case = UpdateVideoGroupUseCase(repo)
        result = use_case.execute(
            self.group.id,
            self.user_id,
            UpdateGroupInput(name="updated", description="desc"),
        )
        self.assertEqual(result.id, self.group.id)
        self.assertEqual(result.name, self.group.name)
        self.assertTrue(repo.update_called)

    def test_create_tag_returns_tag_response_dto(self):
        repo = _FakeTagRepo(self.tag)
        use_case = CreateTagUseCase(repo)
        result = use_case.execute(
            self.user_id,
            CreateTagInput(name="tag", color="#111111"),
        )
        self.assertEqual(result.id, self.tag.id)
        self.assertEqual(result.name, self.tag.name)

    def test_update_tag_returns_tag_response_dto(self):
        repo = _FakeTagRepo(self.tag)
        use_case = UpdateTagUseCase(repo)
        result = use_case.execute(
            self.tag.id,
            self.user_id,
            UpdateTagInput(name="updated", color="#222222"),
        )
        self.assertEqual(result.id, self.tag.id)
        self.assertEqual(result.name, self.tag.name)
        self.assertTrue(repo.update_called)
