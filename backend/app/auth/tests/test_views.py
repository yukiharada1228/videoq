"""
Tests for auth views
"""

from django.contrib.auth import get_user_model
from django.contrib.auth.tokens import default_token_generator
from django.core import mail
from django.test import override_settings
from django.urls import reverse
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from rest_framework import status
from rest_framework.test import APITestCase

User = get_user_model()


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class UserSignupViewTests(APITestCase):
    """Tests for UserSignupView"""

    def test_signup_success(self):
        """Test successful user signup"""
        url = reverse("auth-signup")
        data = {
            "username": "newuser",
            "email": "newuser@example.com",
            "password": "SecurePass123",
        }
        response = self.client.post(url, data, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn("detail", response.data)
        self.assertTrue(User.objects.filter(username="newuser").exists())
        self.assertEqual(len(mail.outbox), 1)


class LoginViewTests(APITestCase):
    """Tests for LoginView"""

    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
        )
        self.url = reverse("auth-login")

    def test_login_success(self):
        """Test successful login"""
        data = {"username": "testuser", "password": "testpass123"}
        response = self.client.post(self.url, data, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)
        # Check cookies are set
        self.assertIn("access_token", response.cookies)
        self.assertIn("refresh_token", response.cookies)

    def test_login_invalid_credentials(self):
        """Test login with invalid credentials"""
        data = {"username": "testuser", "password": "wrongpass"}
        response = self.client.post(self.url, data, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class LogoutViewTests(APITestCase):
    """Tests for LogoutView"""

    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
        )
        self.client.force_authenticate(user=self.user)
        self.url = reverse("auth-logout")

    def test_logout_success(self):
        """Test successful logout"""
        response = self.client.post(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Check cookies are deleted
        self.assertEqual(response.cookies.get("access_token").value, "")
        self.assertEqual(response.cookies.get("refresh_token").value, "")


class RefreshViewTests(APITestCase):
    """Tests for RefreshView"""

    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
        )
        self.url = reverse("auth-refresh")

    def test_refresh_with_cookie(self):
        """Test token refresh using cookie"""
        from rest_framework_simplejwt.tokens import RefreshToken

        refresh = RefreshToken.for_user(self.user)
        self.client.cookies["refresh_token"] = str(refresh)

        response = self.client.post(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
        self.assertIn("access_token", response.cookies)

    def test_refresh_with_body(self):
        """Test token refresh using request body"""
        from rest_framework_simplejwt.tokens import RefreshToken

        refresh = RefreshToken.for_user(self.user)
        data = {"refresh": str(refresh)}

        response = self.client.post(self.url, data, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)

    def test_refresh_invalid_token(self):
        """Test token refresh with invalid token"""
        self.client.cookies["refresh_token"] = "invalid-token"

        response = self.client.post(self.url)

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_refresh_with_empty_cookie(self):
        """Test token refresh with empty cookie"""
        self.client.cookies["refresh_token"] = ""

        response = self.client.post(self.url, {"refresh": ""}, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class EmailVerificationViewTests(APITestCase):
    """Tests for EmailVerificationView"""

    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
            is_active=False,
        )
        self.uid = urlsafe_base64_encode(force_bytes(self.user.pk))
        self.token = default_token_generator.make_token(self.user)
        self.url = reverse("auth-email-verification")

    def test_verify_email_success(self):
        """Test successful email verification"""
        data = {"uid": self.uid, "token": self.token}
        response = self.client.post(self.url, data, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertTrue(self.user.is_active)


class PasswordResetRequestViewTests(APITestCase):
    """Tests for PasswordResetRequestView"""

    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
            is_active=True,
        )
        self.url = reverse("auth-password-reset")

    def test_request_reset_success(self):
        """Test successful password reset request"""
        data = {"email": self.user.email}
        response = self.client.post(self.url, data, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(mail.outbox), 1)


class PasswordResetConfirmViewTests(APITestCase):
    """Tests for PasswordResetConfirmView"""

    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="oldpass123",
            is_active=True,
        )
        self.uid = urlsafe_base64_encode(force_bytes(self.user.pk))
        self.token = default_token_generator.make_token(self.user)
        self.url = reverse("auth-password-reset-confirm")

    def test_confirm_reset_success(self):
        """Test successful password reset confirmation"""
        data = {
            "uid": self.uid,
            "token": self.token,
            "new_password": "NewSecurePass123",
        }
        response = self.client.post(self.url, data, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("NewSecurePass123"))


class MeViewTests(APITestCase):
    """Tests for MeView"""

    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
        )
        self.client.force_authenticate(user=self.user)
        self.url = reverse("auth-me")

    def test_get_current_user(self):
        """Test getting current user information"""
        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["username"], "testuser")
        self.assertEqual(response.data["email"], "test@example.com")

    def test_get_current_user_unauthenticated(self):
        """Test getting current user without authentication"""
        self.client.force_authenticate(user=None)
        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class UsageStatsViewTests(APITestCase):
    """Tests for UsageStatsView"""

    def setUp(self):
        from app.models import ChatLog, Video, VideoGroup

        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
            video_limit=50,
        )
        self.client.force_authenticate(user=self.user)
        self.url = reverse("auth-usage-stats")

        # Create test data
        self.video1 = Video.objects.create(
            user=self.user,
            title="Test Video 1",
            description="Test",
            duration_minutes=10.5,
        )
        self.video2 = Video.objects.create(
            user=self.user,
            title="Test Video 2",
            description="Test",
            duration_minutes=5.0,
        )
        # Video from previous month (should not be counted)
        from django.utils import timezone
        from datetime import timedelta

        last_month = timezone.now() - timedelta(days=35)
        self.old_video = Video.objects.create(
            user=self.user,
            title="Old Video",
            description="Test",
            duration_minutes=20.0,
        )
        # Update uploaded_at after creation (since it's auto_now_add)
        Video.objects.filter(pk=self.old_video.pk).update(uploaded_at=last_month)

        self.group = VideoGroup.objects.create(
            user=self.user,
            name="Test Group",
            description="Test",
        )
        self.chat_log1 = ChatLog.objects.create(
            user=self.user,
            group=self.group,
            question="Test question",
            answer="Test answer",
        )
        self.chat_log2 = ChatLog.objects.create(
            user=self.user,
            group=self.group,
            question="Test question 2",
            answer="Test answer 2",
        )

    def test_get_usage_stats_success(self):
        """Test getting usage statistics successfully"""
        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("videos", response.data)
        self.assertIn("whisper_minutes", response.data)
        self.assertIn("chats", response.data)

        # Check video count (all videos, not just this month)
        self.assertEqual(response.data["videos"]["used"], 3)
        self.assertEqual(response.data["videos"]["limit"], 50)

        # Check Whisper minutes (only this month's videos)
        self.assertEqual(response.data["whisper_minutes"]["used"], 15.5)  # 10.5 + 5.0
        self.assertEqual(response.data["whisper_minutes"]["limit"], 1200.0)

        # Check chat count (this month)
        self.assertEqual(response.data["chats"]["used"], 2)
        self.assertEqual(response.data["chats"]["limit"], 3000)

    def test_get_usage_stats_unauthenticated(self):
        """Test getting usage statistics without authentication"""
        self.client.force_authenticate(user=None)
        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_get_usage_stats_empty_data(self):
        """Test getting usage statistics with no data"""
        from app.models import ChatLog, Video

        # Delete all data
        Video.objects.filter(user=self.user).delete()
        ChatLog.objects.filter(user=self.user).delete()

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["videos"]["used"], 0)
        self.assertEqual(response.data["whisper_minutes"]["used"], 0.0)
        self.assertEqual(response.data["chats"]["used"], 0)

    def test_get_usage_stats_with_shared_origin_chat(self):
        """Test getting usage statistics including shared origin chats"""
        from app.models import ChatLog

        # Create another user who will access via share
        other_user = User.objects.create_user(
            username="otheruser",
            email="other@example.com",
            password="testpass123",
        )

        # Create a chat log with is_shared_origin=True (other user accessing via share)
        ChatLog.objects.create(
            user=other_user,  # The user who accessed via share
            group=self.group,  # Group owned by self.user
            question="Shared question",
            answer="Shared answer",
            is_shared_origin=True,
        )

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Should include the shared origin chat (3 total: 2 regular + 1 shared)
        self.assertEqual(response.data["chats"]["used"], 3)

    def test_get_usage_stats_with_null_duration_video(self):
        """Test getting usage statistics with video that has null duration_minutes"""
        from app.models import Video

        # Create a video with null duration_minutes
        Video.objects.create(
            user=self.user,
            title="Video without duration",
            description="Test",
            duration_minutes=None,
        )

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Video count should include all videos (4 total)
        self.assertEqual(response.data["videos"]["used"], 4)
        # Whisper minutes should only count videos with duration_minutes (still 15.5)
        self.assertEqual(response.data["whisper_minutes"]["used"], 15.5)

    def test_get_usage_stats_excludes_other_users_data(self):
        """Test that usage statistics only include current user's data"""
        from app.models import ChatLog, Video, VideoGroup

        # Create another user
        other_user = User.objects.create_user(
            username="otheruser",
            email="other@example.com",
            password="testpass123",
        )

        # Create data for other user
        Video.objects.create(
            user=other_user,
            title="Other User Video",
            description="Test",
            duration_minutes=30.0,
        )
        other_group = VideoGroup.objects.create(
            user=other_user,
            name="Other Group",
            description="Test",
        )
        ChatLog.objects.create(
            user=other_user,
            group=other_group,
            question="Other question",
            answer="Other answer",
        )

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Should only count self.user's data
        self.assertEqual(response.data["videos"]["used"], 3)  # Only self.user's videos
        self.assertEqual(response.data["whisper_minutes"]["used"], 15.5)  # Only self.user's videos
        self.assertEqual(response.data["chats"]["used"], 2)  # Only self.user's chats

    def test_get_usage_stats_with_shared_origin_chat_other_user_group(self):
        """Test that user's own chats are counted even if in other user's group"""
        from app.models import ChatLog, VideoGroup

        # Create another user
        other_user = User.objects.create_user(
            username="otheruser",
            email="other@example.com",
            password="testpass123",
        )

        # Create a group owned by other_user
        other_group = VideoGroup.objects.create(
            user=other_user,
            name="Other User Group",
            description="Test",
        )

        # Create a chat log with is_shared_origin=True but for other user's group
        # This SHOULD be counted for self.user because user=self.user matches
        ChatLog.objects.create(
            user=self.user,  # self.user accessing
            group=other_group,  # But group owned by other_user
            question="Question",
            answer="Answer",
            is_shared_origin=True,
        )

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Should count this chat since user=self.user (3 total: 2 regular + 1 shared)
        self.assertEqual(response.data["chats"]["used"], 3)

    def test_get_usage_stats_excludes_previous_month_chats(self):
        """Test that only current month's chats are counted"""
        from app.models import ChatLog
        from django.utils import timezone
        from datetime import timedelta

        # Create a chat log from previous month
        last_month = timezone.now() - timedelta(days=35)
        ChatLog.objects.create(
            user=self.user,
            group=self.group,
            question="Old question",
            answer="Old answer",
        )
        # Update created_at after creation (since it's auto_now_add)
        ChatLog.objects.filter(
            user=self.user, question="Old question"
        ).update(created_at=last_month)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Should only count this month's chats (2 from setUp, not the old one)
        self.assertEqual(response.data["chats"]["used"], 2)

    def test_get_usage_stats_with_different_video_limit(self):
        """Test getting usage statistics with different video_limit"""
        # Update user's video_limit
        self.user.video_limit = 100
        self.user.save()

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["videos"]["limit"], 100)

    def test_get_usage_stats_whisper_usage_none_aggregate(self):
        """Test Whisper usage when aggregate returns None (no videos this month with duration)"""
        from app.models import Video

        # Delete all videos from this month
        Video.objects.filter(user=self.user).delete()

        # Create a video from this month but with null duration_minutes
        Video.objects.create(
            user=self.user,
            title="Video without duration this month",
            description="Test",
            duration_minutes=None,
        )

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # aggregate should return None, so or 0.0 should be used
        self.assertEqual(response.data["whisper_minutes"]["used"], 0.0)

    def test_get_usage_stats_excludes_previous_month_videos(self):
        """Test that only current month's videos are counted for Whisper usage"""
        from app.models import Video
        from django.utils import timezone
        from datetime import timedelta

        # Create a video from previous month with duration
        last_month = timezone.now() - timedelta(days=35)
        old_video = Video.objects.create(
            user=self.user,
            title="Old Video with Duration",
            description="Test",
            duration_minutes=50.0,
        )
        # Update uploaded_at after creation
        Video.objects.filter(pk=old_video.pk).update(uploaded_at=last_month)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Should only count this month's videos (15.5, not including the old 50.0)
        self.assertEqual(response.data["whisper_minutes"]["used"], 15.5)

    def test_get_usage_stats_response_structure(self):
        """Test that response structure matches UsageStatsResponseSerializer"""
        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Verify response structure
        self.assertIn("videos", response.data)
        self.assertIn("used", response.data["videos"])
        self.assertIn("limit", response.data["videos"])
        self.assertIn("whisper_minutes", response.data)
        self.assertIn("used", response.data["whisper_minutes"])
        self.assertIn("limit", response.data["whisper_minutes"])
        self.assertIn("chats", response.data)
        self.assertIn("used", response.data["chats"])
        self.assertIn("limit", response.data["chats"])

    def test_get_usage_stats_first_day_of_month_calculation(self):
        """Test that first_day_of_month calculation works correctly"""
        from app.models import Video
        from django.utils import timezone

        # Create a video exactly at the start of the current month
        now = timezone.now()
        first_day = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        
        # Create a video at the start of the month
        video_at_start = Video.objects.create(
            user=self.user,
            title="Video at month start",
            description="Test",
            duration_minutes=7.5,
        )
        Video.objects.filter(pk=video_at_start.pk).update(uploaded_at=first_day)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Should include video at the start of the month (15.5 + 7.5 = 23.0)
        self.assertEqual(response.data["whisper_minutes"]["used"], 23.0)
