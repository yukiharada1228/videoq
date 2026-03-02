from typing import Protocol


class OwnedResourceLoader(Protocol):
    def __call__(
        self,
        user,
        model_class,
        resource_id,
        select_related_fields=None,
    ): ...


class OwnedResourcesLoader(Protocol):
    def __call__(self, user, model_class, resource_ids): ...


class VideoCreator(Protocol):
    def __call__(self, command): ...


class GroupMemberAdder(Protocol):
    def __call__(self, command): ...


class GroupMembersAdder(Protocol):
    def __call__(self, command): ...


class GroupReorderer(Protocol):
    def __call__(self, command): ...


class ShareTokenUpdater(Protocol):
    def __call__(self, command): ...


class TokenGenerator(Protocol):
    def __call__(self, nbytes: int = 32) -> str: ...


class VideoTagsAdder(Protocol):
    def __call__(self, command): ...
