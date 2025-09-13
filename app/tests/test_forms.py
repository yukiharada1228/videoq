from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.http import QueryDict
from django.test import TestCase, override_settings

from app.forms import SignUpForm, VideoEditForm, VideoUploadForm


@override_settings(
    DEBUG=True,
    BASIC_AUTH_ENABLED=False,
    USE_S3=False,
    SECRET_KEY="test_secret",
    VIDEO_UPLOAD_MAX_SIZE_MB=1,  # Set small to verify size validation
    DATABASES={"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": ":memory:"}},
)
class FormTests(TestCase):
    def setUp(self):
        self.User = get_user_model()
        self.user = self.User.objects.create_user(
            username="bob", email="b@example.com", password="pass"
        )

    def test_signup_form_unique_validation(self):
        form = SignUpForm(
            data={
                "username": "bob",
                "email": "b@example.com",
                "password1": "pass12345!",
                "password2": "pass12345!",
                "agree_terms": True,
            }
        )
        self.assertFalse(form.is_valid())

    def test_video_upload_form_validation_and_save(self):
        # Small mock file
        file = SimpleUploadedFile("movie.mp4", b"0" * 1000, content_type="video/mp4")
        data = QueryDict(mutable=True)
        data["title"] = "Title"
        data["description"] = "Description"
        data["new_tags_input"] = "Physics, Final Exam"
        data.setlist("existing_tags", [])
        form = VideoUploadForm(data=data, files={"file": file}, user=self.user)
        self.assertTrue(form.is_valid(), form.errors)
        # Pre-process equivalent to view (upload_to references user)
        form.instance.user = self.user
        video = form.save()
        self.assertEqual(video.tags.count(), 2)

    def test_video_edit_form_add_new_tag(self):
        from app.models import Video

        video = Video.objects.create(
            user=self.user,
            file=SimpleUploadedFile("a.mp4", b"data", content_type="video/mp4"),
            title="t",
            description="d",
            status="completed",
        )
        data = QueryDict(mutable=True)
        data["title"] = "t2"
        data["description"] = "d2"
        data["new_tags_input"] = "Math"
        data.setlist("existing_tags", [])
        form = VideoEditForm(data=data, instance=video, user=self.user)
        self.assertTrue(form.is_valid(), form.errors)
        video2 = form.save()
        self.assertEqual(video2.tags.count(), 1)
