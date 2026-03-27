"""Unit tests for DeleteAccountDataUseCase — subscription cancellation on account deletion."""

from typing import Optional
from unittest import TestCase
from unittest.mock import MagicMock

from app.domain.billing.entities import PlanType, SubscriptionEntity
from app.domain.billing.ports import (
    BillingGateway,
    SubscriptionEventData,
    SubscriptionRepository,
    WebhookEvent,
)
from app.domain.auth.gateways import UserDataDeletionGateway
from app.use_cases.auth.delete_account_data import DeleteAccountDataUseCase


def _make_subscription(**kwargs) -> SubscriptionEntity:
    defaults = {
        "user_id": 1,
        "plan": PlanType.LITE,
        "stripe_customer_id": "cus_test",
        "stripe_subscription_id": "sub_test",
        "stripe_status": "active",
        "current_period_end": None,
        "cancel_at_period_end": False,
        "used_storage_bytes": 0,
        "used_processing_seconds": 0,
        "used_ai_answers": 0,
        "usage_period_start": None,
        "custom_storage_gb": None,
        "custom_processing_minutes": None,
        "custom_ai_answers": None,
        "unlimited_processing_minutes": False,
        "unlimited_ai_answers": False,
    }
    defaults.update(kwargs)
    return SubscriptionEntity(**defaults)  # type: ignore[arg-type]


class _StubSubscriptionRepo(SubscriptionRepository):
    def __init__(self, entity: Optional[SubscriptionEntity]):
        self._entity = entity
        self.saved: Optional[SubscriptionEntity] = None

    def get_or_create(self, user_id: int) -> SubscriptionEntity:
        assert self._entity is not None
        return self._entity

    def get_by_user_id(self, user_id: int) -> Optional[SubscriptionEntity]:
        return self._entity

    def get_by_stripe_customer_id(self, customer_id: str) -> Optional[SubscriptionEntity]:
        return self._entity

    def save(self, entity: SubscriptionEntity) -> SubscriptionEntity:
        self.saved = entity
        return entity

    def create_stripe_customer(self, user_id: int, customer_id: str) -> SubscriptionEntity:
        assert self._entity is not None
        return self._entity

    def clear_stripe_customer(self, user_id: int) -> None:
        pass

    def get_or_create_stripe_customer(self, user_id: int, create_fn) -> tuple:
        assert self._entity is not None
        if not self._entity.stripe_customer_id:
            self._entity.stripe_customer_id = create_fn()
        return self._entity.stripe_customer_id, self._entity

    def reset_monthly_usage(self, user_id: int, period_start) -> None:
        pass

    def maybe_reset_monthly_usage(self, user_id: int) -> None:
        pass

    def check_and_reserve_storage(self, user_id: int, additional_bytes: int) -> None:
        pass

    def increment_storage_bytes(self, user_id: int, bytes_delta: int) -> None:
        pass

    def increment_processing_seconds(self, user_id: int, seconds: int) -> None:
        pass

    def increment_ai_answers(self, user_id: int) -> None:
        pass

    def clear_over_quota_if_within_limit(self, user_id: int) -> None:
        pass


class _StubBillingGateway(BillingGateway):
    def __init__(self):
        self.cancelled: list[str] = []

    def get_or_create_customer(self, user_id, email, username) -> str:
        return "cus_test"

    def create_checkout_session(self, customer_id, price_id, success_url, cancel_url, user_id, plan):
        return MagicMock(url="https://checkout.test")

    def update_subscription(self, subscription_id, price_id) -> None:
        pass

    def create_billing_portal(self, customer_id, return_url):
        return MagicMock(url="https://portal.test")

    def verify_webhook(self, payload, sig_header, secret) -> WebhookEvent:
        return WebhookEvent(
            type="",
            data_object=SubscriptionEventData(
                id="",
                customer="",
                status="",
                cancel_at_period_end=False,
                current_period_end=None,
                price_id=None,
            ),
        )

    def cancel_subscription(self, subscription_id: str) -> None:
        self.cancelled.append(subscription_id)


def _make_deletion_gateway() -> UserDataDeletionGateway:
    gw = MagicMock(spec=UserDataDeletionGateway)
    return gw


class CancelSubscriptionOnDeleteTests(TestCase):
    def test_cancels_stripe_subscription_when_active(self):
        """アクティブなサブスクリプションがある場合、アカウント削除時にStripeをキャンセルしDBを更新する"""
        entity = _make_subscription(stripe_subscription_id="sub_abc")
        billing_gw = _StubBillingGateway()
        repo = _StubSubscriptionRepo(entity)
        use_case = DeleteAccountDataUseCase(
            user_data_deletion_gateway=_make_deletion_gateway(),
            subscription_repo=repo,
            billing_gateway=billing_gw,
        )

        use_case.execute(user_id=1)

        self.assertEqual(billing_gw.cancelled, ["sub_abc"])
        self.assertIsNotNone(repo.saved)
        self.assertIsNone(repo.saved.stripe_subscription_id)
        self.assertEqual(repo.saved.stripe_status, "canceled")

    def test_idempotent_on_retry_after_successful_stripe_cancel(self):
        """Stripeキャンセル成功後にDB更新済みの場合、リトライ時はStripeを再度呼ばない"""
        # stripe_subscription_id がすでにNone（前回のキャンセルでDB更新済み）
        entity = _make_subscription(plan=PlanType.FREE, stripe_subscription_id=None)
        billing_gw = _StubBillingGateway()
        use_case = DeleteAccountDataUseCase(
            user_data_deletion_gateway=_make_deletion_gateway(),
            subscription_repo=_StubSubscriptionRepo(entity),
            billing_gateway=billing_gw,
        )

        use_case.execute(user_id=1)

        self.assertEqual(billing_gw.cancelled, [])

    def test_skips_cancel_when_no_subscription_id(self):
        """stripe_subscription_idがNullの場合はキャンセルしない（Freeプラン等）"""
        entity = _make_subscription(plan=PlanType.FREE, stripe_subscription_id=None)
        billing_gw = _StubBillingGateway()
        use_case = DeleteAccountDataUseCase(
            user_data_deletion_gateway=_make_deletion_gateway(),
            subscription_repo=_StubSubscriptionRepo(entity),
            billing_gateway=billing_gw,
        )

        use_case.execute(user_id=1)

        self.assertEqual(billing_gw.cancelled, [])

    def test_skips_cancel_when_no_subscription_record(self):
        """サブスクリプションレコード自体がない場合はキャンセルしない"""
        billing_gw = _StubBillingGateway()
        use_case = DeleteAccountDataUseCase(
            user_data_deletion_gateway=_make_deletion_gateway(),
            subscription_repo=_StubSubscriptionRepo(None),
            billing_gateway=billing_gw,
        )

        use_case.execute(user_id=1)

        self.assertEqual(billing_gw.cancelled, [])

    def test_skips_cancel_when_billing_not_configured(self):
        """billing_gateway/subscription_repoがNoneの場合（billing無効環境）はキャンセルしない"""
        use_case = DeleteAccountDataUseCase(
            user_data_deletion_gateway=_make_deletion_gateway(),
        )

        use_case.execute(user_id=1)  # エラーなく完了すること

    def test_deletes_data_before_stripe_cancel(self):
        """データ削除（R2含む）が完了した後にStripeをキャンセルする"""
        entity = _make_subscription(stripe_subscription_id="sub_abc")
        billing_gw = _StubBillingGateway()
        deletion_gw = _make_deletion_gateway()
        call_order = []
        deletion_gw.delete_all_videos_for_user.side_effect = lambda uid: call_order.append("videos")
        deletion_gw.delete_chat_history_for_user.side_effect = lambda uid: call_order.append("chat")
        deletion_gw.delete_video_groups_for_user.side_effect = lambda uid: call_order.append("groups")
        deletion_gw.delete_tags_for_user.side_effect = lambda uid: call_order.append("tags")
        original_cancel = billing_gw.cancel_subscription
        def cancel_with_order(sub_id):
            call_order.append("stripe")
            original_cancel(sub_id)
        billing_gw.cancel_subscription = cancel_with_order

        use_case = DeleteAccountDataUseCase(
            user_data_deletion_gateway=deletion_gw,
            subscription_repo=_StubSubscriptionRepo(entity),
            billing_gateway=billing_gw,
        )

        use_case.execute(user_id=1)

        self.assertEqual(call_order, ["videos", "chat", "groups", "tags", "stripe"])

    def test_stripe_cancel_failure_propagates_after_data_deleted(self):
        """Stripeキャンセル失敗時はデータ削除済みの状態でエラーが伝播する"""
        entity = _make_subscription(stripe_subscription_id="sub_fail")
        billing_gw = MagicMock(spec=BillingGateway)
        billing_gw.cancel_subscription.side_effect = Exception("Stripe error")

        deletion_gw = _make_deletion_gateway()
        use_case = DeleteAccountDataUseCase(
            user_data_deletion_gateway=deletion_gw,
            subscription_repo=_StubSubscriptionRepo(entity),
            billing_gateway=billing_gw,
        )

        with self.assertRaises(Exception):
            use_case.execute(user_id=1)

        deletion_gw.delete_all_videos_for_user.assert_called_once()
        deletion_gw.delete_chat_history_for_user.assert_called_once()
        deletion_gw.delete_video_groups_for_user.assert_called_once()
        deletion_gw.delete_tags_for_user.assert_called_once()

    def test_all_data_deletion_methods_called(self):
        """サブスクリプションなしでも全データ削除メソッドが呼ばれる"""
        deletion_gw = _make_deletion_gateway()
        use_case = DeleteAccountDataUseCase(
            user_data_deletion_gateway=deletion_gw,
        )

        use_case.execute(user_id=42)

        deletion_gw.delete_all_videos_for_user.assert_called_once_with(42)
        deletion_gw.delete_chat_history_for_user.assert_called_once_with(42)
        deletion_gw.delete_video_groups_for_user.assert_called_once_with(42)
        deletion_gw.delete_tags_for_user.assert_called_once_with(42)


class BestEffortDeletionTests(TestCase):
    """ベストエフォート方式: 途中のステップが失敗しても残りが実行される"""

    def test_continues_after_videos_deletion_failure(self):
        """動画削除が失敗してもチャット/グループ/タグ削除が続行される"""
        deletion_gw = _make_deletion_gateway()
        deletion_gw.delete_all_videos_for_user.side_effect = Exception("R2 error")

        use_case = DeleteAccountDataUseCase(user_data_deletion_gateway=deletion_gw)
        use_case.execute(user_id=1)

        deletion_gw.delete_chat_history_for_user.assert_called_once_with(1)
        deletion_gw.delete_video_groups_for_user.assert_called_once_with(1)
        deletion_gw.delete_tags_for_user.assert_called_once_with(1)

    def test_continues_after_chat_deletion_failure(self):
        """チャット履歴削除が失敗してもグループ/タグ削除が続行される"""
        deletion_gw = _make_deletion_gateway()
        deletion_gw.delete_chat_history_for_user.side_effect = Exception("DB error")

        use_case = DeleteAccountDataUseCase(user_data_deletion_gateway=deletion_gw)
        use_case.execute(user_id=1)

        deletion_gw.delete_video_groups_for_user.assert_called_once_with(1)
        deletion_gw.delete_tags_for_user.assert_called_once_with(1)

    def test_continues_after_groups_deletion_failure(self):
        """グループ削除が失敗してもタグ削除が続行される"""
        deletion_gw = _make_deletion_gateway()
        deletion_gw.delete_video_groups_for_user.side_effect = Exception("DB error")

        use_case = DeleteAccountDataUseCase(user_data_deletion_gateway=deletion_gw)
        use_case.execute(user_id=1)

        deletion_gw.delete_tags_for_user.assert_called_once_with(1)

    def test_stripe_cancel_runs_even_if_data_step_fails(self):
        """データ削除ステップが失敗してもStripeキャンセルが実行される"""
        entity = _make_subscription(stripe_subscription_id="sub_abc")
        billing_gw = _StubBillingGateway()
        deletion_gw = _make_deletion_gateway()
        deletion_gw.delete_all_videos_for_user.side_effect = Exception("R2 error")

        use_case = DeleteAccountDataUseCase(
            user_data_deletion_gateway=deletion_gw,
            subscription_repo=_StubSubscriptionRepo(entity),
            billing_gateway=billing_gw,
        )
        use_case.execute(user_id=1)

        self.assertEqual(billing_gw.cancelled, ["sub_abc"])

    def test_data_step_failure_is_logged(self):
        """失敗したステップがERRORレベルでログに記録される"""
        deletion_gw = _make_deletion_gateway()
        deletion_gw.delete_all_videos_for_user.side_effect = Exception("R2 error")

        use_case = DeleteAccountDataUseCase(user_data_deletion_gateway=deletion_gw)

        with self.assertLogs("app.use_cases.auth.delete_account_data", level="ERROR") as cm:
            use_case.execute(user_id=1)

        self.assertTrue(
            any("delete_all_videos_for_user" in msg for msg in cm.output),
            f"Expected delete_all_videos_for_user in logs, got: {cm.output}",
        )

    def test_multiple_step_failures_all_logged(self):
        """複数ステップが失敗した場合、すべてERRORログに記録される"""
        deletion_gw = _make_deletion_gateway()
        deletion_gw.delete_all_videos_for_user.side_effect = Exception("R2 error")
        deletion_gw.delete_chat_history_for_user.side_effect = Exception("Chat error")

        use_case = DeleteAccountDataUseCase(user_data_deletion_gateway=deletion_gw)

        with self.assertLogs("app.use_cases.auth.delete_account_data", level="ERROR") as cm:
            use_case.execute(user_id=1)

        errors_logged = sum(1 for msg in cm.output if "ERROR" in msg)
        self.assertGreaterEqual(errors_logged, 2)
