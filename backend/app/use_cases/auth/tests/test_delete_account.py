"""Unit tests for AccountDeletionUseCase."""

import contextlib
from unittest import TestCase
from unittest.mock import MagicMock

from app.domain.auth.gateways import AccountDeletionGateway, AuthTaskGateway
from app.domain.shared.transaction import TransactionPort
from app.use_cases.auth.delete_account import AccountDeletionUseCase


class _StubTransaction(TransactionPort):
    def atomic(self):
        return contextlib.nullcontext()

    def on_commit(self, fn):
        fn()


class AccountDeletionUseCaseTests(TestCase):
    def _make_use_case(self):
        deletion_gateway = MagicMock(spec=AccountDeletionGateway)
        task_gateway = MagicMock(spec=AuthTaskGateway)
        use_case = AccountDeletionUseCase(
            deletion_gateway=deletion_gateway,
            task_queue=task_gateway,
            tx=_StubTransaction(),
        )
        return use_case, deletion_gateway, task_gateway

    def test_deactivates_user_and_enqueues_deletion(self):
        use_case, deletion_gateway, task_gateway = self._make_use_case()

        use_case.execute(user_id=1, reason="cleanup")

        deletion_gateway.record_deletion_request.assert_called_once_with(1, "cleanup")
        deletion_gateway.deactivate_user.assert_called_once_with(1)
        task_gateway.enqueue_account_deletion.assert_called_once_with(1)

    def test_works_without_reason(self):
        use_case, deletion_gateway, task_gateway = self._make_use_case()

        use_case.execute(user_id=42)

        deletion_gateway.record_deletion_request.assert_called_once_with(42, "")
        deletion_gateway.deactivate_user.assert_called_once_with(42)
        task_gateway.enqueue_account_deletion.assert_called_once_with(42)
