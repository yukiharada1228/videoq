"""
Abstract interface for managing database transactions.
Allows use cases to enforce atomic boundaries without importing Django.
"""

from abc import ABC, abstractmethod
from typing import Callable


class TransactionPort(ABC):
    @abstractmethod
    def atomic(self):
        """Context manager for atomic transactions. Usage: with self.tx.atomic(): ..."""
        ...

    @abstractmethod
    def on_commit(self, fn: Callable[[], None]) -> None:
        """Register a callback to run after the current transaction commits."""
        ...
