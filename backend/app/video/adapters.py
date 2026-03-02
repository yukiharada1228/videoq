from app.video.use_cases import (AddTagsToVideoCommand, AddVideoToGroupCommand,
                                 AddVideosToGroupCommand, CreateShareLinkCommand,
                                 DeleteShareLinkCommand, ReorderVideosInGroupCommand,
                                 UploadVideoCommand)


class UploadVideoAdapter:
    def __init__(self, *, user, video_creator):
        self._user = user
        self._video_creator = video_creator

    def __call__(self, command: UploadVideoCommand):
        return self._video_creator(
            user=self._user,
            validated_data=command.validated_data,
        )


class AddVideoToGroupAdapter:
    def __init__(
        self,
        *,
        user,
        group_model,
        video_model,
        owned_resource_loader,
        group_member_adder,
    ):
        self._user = user
        self._group_model = group_model
        self._video_model = video_model
        self._owned_resource_loader = owned_resource_loader
        self._group_member_adder = group_member_adder

    def __call__(self, command: AddVideoToGroupCommand):
        group = self._owned_resource_loader(self._user, self._group_model, command.group_id)
        if not group:
            raise LookupError("Group not found")
        video = self._owned_resource_loader(self._user, self._video_model, command.video_id)
        if not video:
            raise LookupError("Video not found")
        member = self._group_member_adder(group, video)
        if member is None:
            raise ValueError("This video is already added to the group")
        return member


class AddVideosToGroupAdapter:
    def __init__(
        self,
        *,
        user,
        group_model,
        video_model,
        owned_resource_loader,
        owned_resources_loader,
        group_members_adder,
    ):
        self._user = user
        self._group_model = group_model
        self._video_model = video_model
        self._owned_resource_loader = owned_resource_loader
        self._owned_resources_loader = owned_resources_loader
        self._group_members_adder = group_members_adder

    def __call__(self, command: AddVideosToGroupCommand):
        group = self._owned_resource_loader(self._user, self._group_model, command.group_id)
        if not group:
            raise LookupError("Group not found")
        if not command.video_ids:
            raise ValueError("Video ID not specified")
        videos = self._owned_resources_loader(self._user, self._video_model, command.video_ids)
        if len(videos) != len(command.video_ids):
            raise LookupError("Some videos not found")
        return self._group_members_adder(group, videos, command.video_ids)


class ReorderVideosInGroupAdapter:
    def __init__(self, *, user, group_model, owned_resource_loader, group_reorderer):
        self._user = user
        self._group_model = group_model
        self._owned_resource_loader = owned_resource_loader
        self._group_reorderer = group_reorderer

    def __call__(self, command: ReorderVideosInGroupCommand):
        group = self._owned_resource_loader(self._user, self._group_model, command.group_id)
        if not group:
            raise LookupError("Group not found")
        self._group_reorderer(group, command.video_ids)


class CreateShareLinkAdapter:
    def __init__(
        self,
        *,
        user,
        group_model,
        owned_resource_loader,
        token_generator,
        share_token_updater,
    ):
        self._user = user
        self._group_model = group_model
        self._owned_resource_loader = owned_resource_loader
        self._token_generator = token_generator
        self._share_token_updater = share_token_updater

    def __call__(self, command: CreateShareLinkCommand):
        group = self._owned_resource_loader(self._user, self._group_model, command.group_id)
        if not group:
            raise LookupError("Group not found")
        share_token = self._token_generator(32)
        self._share_token_updater(group, share_token)
        return share_token


class DeleteShareLinkAdapter:
    def __init__(self, *, user, group_model, owned_resource_loader, share_token_updater):
        self._user = user
        self._group_model = group_model
        self._owned_resource_loader = owned_resource_loader
        self._share_token_updater = share_token_updater

    def __call__(self, command: DeleteShareLinkCommand):
        group = self._owned_resource_loader(self._user, self._group_model, command.group_id)
        if not group:
            raise LookupError("Group not found")
        if not group.share_token:
            raise LookupError("Share link is not configured")
        self._share_token_updater(group, None)


class AddTagsToVideoAdapter:
    def __init__(
        self,
        *,
        user,
        video_model,
        tag_model,
        owned_resource_loader,
        owned_resources_loader,
        video_tags_adder,
    ):
        self._user = user
        self._video_model = video_model
        self._tag_model = tag_model
        self._owned_resource_loader = owned_resource_loader
        self._owned_resources_loader = owned_resources_loader
        self._video_tags_adder = video_tags_adder

    def __call__(self, command: AddTagsToVideoCommand):
        video = self._owned_resource_loader(self._user, self._video_model, command.video_id)
        if not video:
            raise LookupError("Video not found")
        if not command.tag_ids:
            raise ValueError("Tag IDs not specified")
        tags = self._owned_resources_loader(self._user, self._tag_model, command.tag_ids)
        if len(tags) != len(command.tag_ids):
            raise LookupError("Some tags not found")
        return self._video_tags_adder(video, tags, command.tag_ids)
