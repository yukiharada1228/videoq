from typing import Protocol


class ActorLoader(Protocol):
    """Load a user (actor) by primary key.

    Shared across all modules to avoid duplicating this protocol.
    """

    def __call__(self, actor_id: int): ...
