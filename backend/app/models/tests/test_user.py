"""
Tests for User model
"""

from django.contrib.auth import get_user_model
from django.db import IntegrityError
from django.test import TestCase
from django.utils import timezone

from app.models import ChatLog, UsageRecord, Video, VideoGroup
from app.models.subscription import PLAN_LIMITS, PlanType, Subscription

User = get_user_model()


class UserModelTests(TestCase):
    """Tests for User model"""

    def test_create_user_with_required_fields(self):
        """Test creating a user with required fields"""
        user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
        )

        self.assertEqual(user.username, "testuser")
        self.assertEqual(user.email, "test@example.com")
        self.assertTrue(user.check_password("testpass123"))

    def test_email_is_unique(self):
        """Test that email must be unique"""
        User.objects.create_user(
            username="user1",
            email="test@example.com",
            password="testpass123",
        )

        with self.assertRaises(IntegrityError):
            User.objects.create_user(
                username="user2",
                email="test@example.com",
                password="testpass123",
            )

    def test_user_inherits_from_abstract_user(self):
        """Test that User inherits all AbstractUser functionality"""
        user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
        )

        # Test AbstractUser fields
        self.assertTrue(hasattr(user, "first_name"))
        self.assertTrue(hasattr(user, "last_name"))
        self.assertTrue(hasattr(user, "is_staff"))
        self.assertTrue(hasattr(user, "is_active"))
        self.assertTrue(hasattr(user, "date_joined"))


class UserUsagePropertyTests(TestCase):
    """Tests for usage limit properties on User model"""

    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
        )

    def test_processing_minutes_limit_free_no_subscription(self):
        """Free user without subscription gets default limit"""
        self.assertEqual(self.user.processing_minutes_limit, 5)

    def test_processing_minutes_limit_with_subscription(self):
        """User with standard subscription gets standard limit"""
        Subscription.objects.update_or_create(
            user=self.user, defaults={"plan": PlanType.STANDARD}
        )
        # Clear cached subscription
        if hasattr(self.user, "_subscription_cache"):
            del self.user._subscription_cache
        self.user.refresh_from_db()
        self.assertEqual(
            self.user.processing_minutes_limit,
            PLAN_LIMITS[PlanType.STANDARD]["processing_minutes"],
        )

    def test_processing_minutes_used_no_records(self):
        """No usage records means 0 processing minutes used"""
        self.assertEqual(self.user.processing_minutes_used, 0)

    def test_processing_minutes_used_with_records(self):
        """Processing minutes should sum UsageRecord amounts in current period"""
        UsageRecord.objects.create(
            user=self.user,
            resource="processing_minutes",
            amount=2.0,
        )
        UsageRecord.objects.create(
            user=self.user,
            resource="processing_minutes",
            amount=3.0,
        )
        # 2 + 3 = 5 minutes
        self.assertAlmostEqual(self.user.processing_minutes_used, 5.0)

    def test_processing_minutes_used_persists_after_video_deletion(self):
        """Processing minutes should persist even after the source video is deleted"""
        video = Video.objects.create(
            user=self.user,
            title="Video 1",
            duration_seconds=120.0,
        )
        UsageRecord.objects.create(
            user=self.user,
            resource="processing_minutes",
            amount=2.0,
            video=video,
        )
        video.delete()
        self.assertAlmostEqual(self.user.processing_minutes_used, 2.0)

    def test_ai_answers_limit_free_no_subscription(self):
        """Free user without subscription gets default limit"""
        self.assertEqual(self.user.ai_answers_limit, 300)

    def test_ai_answers_limit_with_subscription(self):
        """User with standard subscription gets standard limit"""
        Subscription.objects.update_or_create(
            user=self.user, defaults={"plan": PlanType.STANDARD}
        )
        if hasattr(self.user, "_subscription_cache"):
            del self.user._subscription_cache
        self.user.refresh_from_db()
        self.assertEqual(
            self.user.ai_answers_limit,
            PLAN_LIMITS[PlanType.STANDARD]["ai_answers"],
        )

    def test_ai_answers_used_no_records(self):
        """No usage records means 0 ai answers used"""
        self.assertEqual(self.user.ai_answers_used, 0)

    def test_ai_answers_used_counts_usage_records(self):
        """AI answers used should count UsageRecords in current period"""
        UsageRecord.objects.create(
            user=self.user, resource="ai_answers", amount=1
        )
        UsageRecord.objects.create(
            user=self.user, resource="ai_answers", amount=1
        )
        UsageRecord.objects.create(
            user=self.user, resource="ai_answers", amount=1
        )
        self.assertEqual(self.user.ai_answers_used, 3)

    def test_ai_answers_used_only_counts_own_records(self):
        """AI answers used should only count the user's own usage records"""
        other_user = User.objects.create_user(
            username="other", email="other@example.com", password="pass123"
        )
        UsageRecord.objects.create(
            user=other_user, resource="ai_answers", amount=1
        )
        self.assertEqual(self.user.ai_answers_used, 0)

    def test_ai_answers_used_persists_after_group_deletion(self):
        """AI answers used should persist even after the source group is deleted"""
        group = VideoGroup.objects.create(
            user=self.user, name="Test Group", description="Test"
        )
        ChatLog.objects.create(
            user=self.user, group=group, question="Q1", answer="A1"
        )
        UsageRecord.objects.create(
            user=self.user, resource="ai_answers", amount=1
        )
        group.delete()  # CASCADE deletes ChatLog, but UsageRecord remains
        self.assertEqual(self.user.ai_answers_used, 1)
