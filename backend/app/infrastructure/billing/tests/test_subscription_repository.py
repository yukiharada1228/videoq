"""Integration tests for DjangoSubscriptionRepository atomic update methods.

These tests exercise the actual DB layer to verify that increment_* methods
perform atomic writes via F() expressions, preventing Lost Update anomalies.
"""
from django.contrib.auth import get_user_model
from django.test import TestCase

from app.infrastructure.repositories.django_subscription_repository import (
    DjangoSubscriptionRepository,
)
from app.infrastructure.models.subscription import Subscription

User = get_user_model()


def _create_user(username="testuser"):
    return User.objects.create_user(username=username, password="pw")


class IncrementStorageBytesTests(TestCase):
    def setUp(self):
        self.user = _create_user()
        self.repo = DjangoSubscriptionRepository()
        self.repo.get_or_create(self.user.id)

    def test_increments_storage_bytes(self):
        self.repo.increment_storage_bytes(self.user.id, 500)
        obj = Subscription.objects.get(user_id=self.user.id)
        self.assertEqual(obj.used_storage_bytes, 500)

    def test_subtracts_bytes_on_negative_delta(self):
        Subscription.objects.filter(user_id=self.user.id).update(used_storage_bytes=1000)
        self.repo.increment_storage_bytes(self.user.id, -300)
        obj = Subscription.objects.get(user_id=self.user.id)
        self.assertEqual(obj.used_storage_bytes, 700)

    def test_clamps_to_zero_on_over_subtraction(self):
        Subscription.objects.filter(user_id=self.user.id).update(used_storage_bytes=100)
        self.repo.increment_storage_bytes(self.user.id, -500)
        obj = Subscription.objects.get(user_id=self.user.id)
        self.assertEqual(obj.used_storage_bytes, 0)

    def test_sequential_increments_accumulate(self):
        """Simulate two sequential increments that must both be recorded."""
        self.repo.increment_storage_bytes(self.user.id, 500)
        self.repo.increment_storage_bytes(self.user.id, 600)
        obj = Subscription.objects.get(user_id=self.user.id)
        self.assertEqual(obj.used_storage_bytes, 1100)


class IncrementProcessingSecondsTests(TestCase):
    def setUp(self):
        self.user = _create_user()
        self.repo = DjangoSubscriptionRepository()
        self.repo.get_or_create(self.user.id)

    def test_increments_processing_seconds(self):
        self.repo.increment_processing_seconds(self.user.id, 120)
        obj = Subscription.objects.get(user_id=self.user.id)
        self.assertEqual(obj.used_processing_seconds, 120)

    def test_sequential_increments_accumulate(self):
        """Simulate two sequential increments that must both be recorded."""
        self.repo.increment_processing_seconds(self.user.id, 60)
        self.repo.increment_processing_seconds(self.user.id, 90)
        obj = Subscription.objects.get(user_id=self.user.id)
        self.assertEqual(obj.used_processing_seconds, 150)


class IncrementAiAnswersTests(TestCase):
    def setUp(self):
        self.user = _create_user()
        self.repo = DjangoSubscriptionRepository()
        self.repo.get_or_create(self.user.id)

    def test_increments_ai_answers_by_one(self):
        self.repo.increment_ai_answers(self.user.id)
        obj = Subscription.objects.get(user_id=self.user.id)
        self.assertEqual(obj.used_ai_answers, 1)

    def test_sequential_increments_accumulate(self):
        """Simulate two sequential increments that must both be recorded."""
        self.repo.increment_ai_answers(self.user.id)
        self.repo.increment_ai_answers(self.user.id)
        obj = Subscription.objects.get(user_id=self.user.id)
        self.assertEqual(obj.used_ai_answers, 2)
