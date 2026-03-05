"""Shared application exceptions used across multiple use-case contexts."""


class ResourceNotFound(Exception):
    """Raised when a requested resource does not exist."""

    def __init__(self, entity_name: str):
        self.entity_name = entity_name
        super().__init__(f"{entity_name} not found.")


class PermissionDenied(Exception):
    """Raised when the user lacks permission for an action."""
