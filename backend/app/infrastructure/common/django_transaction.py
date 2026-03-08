"""Django-backed implementation of TransactionPort."""

from contextlib import contextmanager
from typing import Callable

from django.db import transaction as django_transaction

from app.domain.shared.transaction import TransactionPort


class DjangoTransactionPort(TransactionPort):
    """Wraps Django's transaction module to satisfy the domain TransactionPort."""

    @contextmanager
    def atomic(self):
        with django_transaction.atomic():
            yield

    def on_commit(self, fn: Callable[[], None]) -> None:
        django_transaction.on_commit(fn)
