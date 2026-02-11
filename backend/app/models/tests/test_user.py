"""
Tests for User model
"""

from django.contrib.auth import get_user_model
from django.db import IntegrityError
from django.test import TestCase
from django.utils import timezone

from app.models import ChatLog, Video, VideoGroup
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
        self.assertEqual(self.user.processing_minutes_limit, 30)

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

    def test_processing_minutes_used_no_videos(self):
        """No videos means 0 processing minutes used"""
        self.assertEqual(self.user.processing_minutes_used, 0)

    def test_processing_minutes_used_with_videos(self):
        """Processing minutes should sum duration_seconds of current period videos"""
        Video.objects.create(
            user=self.user,
            title="Video 1",
            duration_seconds=120.0,
        )
        Video.objects.create(
            user=self.user,
            title="Video 2",
            duration_seconds=180.0,
        )
        # 120 + 180 = 300 seconds = 5 minutes
        self.assertAlmostEqual(self.user.processing_minutes_used, 5.0)

    def test_processing_minutes_used_ignores_null_duration(self):
        """Videos without duration_seconds should not affect total"""
        Video.objects.create(
            user=self.user,
            title="Video 1",
            duration_seconds=None,
        )
        self.assertEqual(self.user.processing_minutes_used, 0)

    def test_ai_answers_limit_free_no_subscription(self):
        """Free user without subscription gets default limit"""
        self.assertEqual(self.user.ai_answers_limit, 50)

    def test_ai_answers_limit_with_subscription(self):
        """User with business subscription gets business limit"""
        Subscription.objects.update_or_create(
            user=self.user, defaults={"plan": PlanType.BUSINESS}
        )
        if hasattr(self.user, "_subscription_cache"):
            del self.user._subscription_cache
        self.user.refresh_from_db()
        self.assertEqual(
            self.user.ai_answers_limit,
            PLAN_LIMITS[PlanType.BUSINESS]["ai_answers"],
        )

    def test_ai_answers_used_no_chat_logs(self):
        """No chat logs means 0 ai answers used"""
        self.assertEqual(self.user.ai_answers_used, 0)

    def test_ai_answers_used_counts_chat_logs(self):
        """AI answers used should count ChatLog records in current period"""
        group = VideoGroup.objects.create(
            user=self.user, name="Test Group", description="Test"
        )
        ChatLog.objects.create(
            user=self.user, group=group, question="Q1", answer="A1"
        )
        ChatLog.objects.create(
            user=self.user, group=group, question="Q2", answer="A2"
        )
        ChatLog.objects.create(
            user=self.user, group=None, question="Q3", answer="A3"
        )
        self.assertEqual(self.user.ai_answers_used, 3)

    def test_ai_answers_used_only_counts_own_logs(self):
        """AI answers used should only count the user's own chat logs"""
        other_user = User.objects.create_user(
            username="other", email="other@example.com", password="pass123"
        )
        group = VideoGroup.objects.create(
            user=other_user, name="Other Group", description="Test"
        )
        ChatLog.objects.create(
            user=other_user, group=group, question="Q1", answer="A1"
        )
        self.assertEqual(self.user.ai_answers_used, 0)
