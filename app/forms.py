from django import forms
from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.forms import UserCreationForm
from django.contrib.auth.tokens import default_token_generator
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from .models import Video, VideoGroup, Tag
import os

User = get_user_model()


# Signup form
class SignUpForm(UserCreationForm):
    FORM_CONTROL_CLASS = "form-control"

    email = forms.EmailField(
        label="Email Address",
        required=True,
        widget=forms.EmailInput(attrs={"class": FORM_CONTROL_CLASS}),
    )
    username = forms.CharField(
        label="Username", widget=forms.TextInput(attrs={"class": FORM_CONTROL_CLASS})
    )
    password1 = forms.CharField(
        label="Password",
        widget=forms.PasswordInput(attrs={"class": FORM_CONTROL_CLASS}),
    )
    password2 = forms.CharField(
        label="Password (Confirm)",
        widget=forms.PasswordInput(attrs={"class": FORM_CONTROL_CLASS}),
    )
    agree_terms = forms.BooleanField(
        label='I agree to the <a href="/terms/" target="_blank">Terms of Service</a> and <a href="/privacy/" target="_blank">Privacy Policy</a>',
        required=True,
        error_messages={
            "required": "Agreement to Terms of Service and Privacy Policy is required."
        },
    )

    class Meta:
        model = User
        fields = ("username", "email", "password1", "password2", "agree_terms")

    def _check_field_exists(self, field_name, value, error_message):
        if User.objects.filter(**{field_name: value}).exists():
            raise forms.ValidationError(error_message, code=f"{field_name}_exists")
        return value

    def clean_username(self):
        return self._check_field_exists(
            "username",
            self.cleaned_data.get("username"),
            "This username is already in use.",
        )

    def clean_email(self):
        return self._check_field_exists(
            "email",
            self.cleaned_data.get("email"),
            "This email address is already registered.",
        )

    def save(self, commit=True):
        user = super().save(commit=False)
        user.email = self.cleaned_data["email"]
        user.is_active = False
        if commit:
            user.save()
            self._send_activation_email(user)
        return user

    def _send_activation_email(self, user):
        subject = "VideoQ Registration Confirmation"
        message_template = """
Thank you for registering.
Please click the URL below to complete your registration.

"""
        uid = urlsafe_base64_encode(force_bytes(user.pk))
        token = default_token_generator.make_token(user)
        activate_url = settings.FRONTEND_URL + f"/activate/{uid}/{token}/"
        message = message_template + activate_url
        user.email_user(subject, message)


# Account activation
def activate_user(uidb64, token):
    try:
        uid = urlsafe_base64_decode(uidb64).decode()
        user = User.objects.get(pk=uid)
    except Exception:
        return False

    if default_token_generator.check_token(user, token):
        user.is_active = True
        user.save()
        return True
    return False


# Video upload form
class VideoUploadForm(forms.ModelForm):
    # New tag input (comma-separated)
    new_tags_input = forms.CharField(
        label="New Tags (comma-separated, optional)",
        required=False,
        widget=forms.TextInput(
            attrs={
                "class": "form-control",
                "placeholder": "e.g., physics, lecture A, final exam",
            }
        ),
        help_text="Enter new tags separated by commas. Can be combined with existing tags.",
    )

    def __init__(self, *args, **kwargs):
        self.user = kwargs.pop("user", None)
        super().__init__(*args, **kwargs)
        self.fields["title"].widget.attrs.setdefault("placeholder", "Enter video title")
        self.fields["description"].widget.attrs.setdefault(
            "placeholder", "Description (optional)"
        )

    class Meta:
        model = Video
        fields = ["file", "title", "description", "new_tags_input"]
        widgets = {
            "title": forms.TextInput(attrs={"class": "form-control"}),
            "description": forms.Textarea(attrs={"class": "form-control", "rows": 3}),
        }

    def clean_file(self):
        file = self.cleaned_data.get("file")
        if file:
            # Check file size (get from settings)
            max_size_mb = getattr(settings, "VIDEO_UPLOAD_MAX_SIZE_MB", 100)
            max_size_bytes = max_size_mb * 1024 * 1024

            if file.size > max_size_bytes:
                raise forms.ValidationError(
                    f"File size must be {max_size_mb}MB or less."
                )

            # Check file format
            allowed_extensions = [
                ".mp4",
                ".avi",
                ".mov",
                ".mkv",
                ".wmv",
                ".flv",
                ".webm",
            ]
            ext = os.path.splitext(file.name)[1].lower()
            if ext not in allowed_extensions:
                raise forms.ValidationError("Unsupported file format.")

        return file

    def _parse_new_tag_names(self) -> list[str]:
        raw = self.cleaned_data.get("new_tags_input", "")
        if not raw:
            return []
        parts = [
            p.strip() for p in raw.replace("\n", ",").replace("，", ",").split(",")
        ]
        seen = set()
        names: list[str] = []
        for p in parts:
            if p and p not in seen:
                seen.add(p)
                names.append(p)
        return names

    def save(self, commit=True):
        from .models import Tag

        video: Video = super().save(commit)
        if not self.user:
            return video

        # Get existing tag IDs from request
        existing_tag_ids = self.data.getlist("existing_tags")
        tags = []

        if existing_tag_ids:
            existing_tags = Tag.objects.filter(id__in=existing_tag_ids, user=self.user)
            tags.extend(existing_tags)

        # Add new tags
        new_tag_names = self._parse_new_tag_names()
        if new_tag_names:
            for name in new_tag_names:
                tag, _ = Tag.objects.get_or_create(user=self.user, name=name)
                tags.append(tag)

        video.tags.set(tags)
        return video


# Video edit form
class VideoEditForm(forms.ModelForm):
    # New tag input (comma-separated)
    new_tags_input = forms.CharField(
        label="New Tags (comma-separated, optional)",
        required=False,
        widget=forms.TextInput(
            attrs={
                "class": "form-control",
                "placeholder": "e.g., physics, lecture A, final exam",
            }
        ),
        help_text="Enter new tags separated by commas. Can be combined with existing tags.",
    )

    def __init__(self, *args, **kwargs):
        self.user = kwargs.pop("user", None)
        super().__init__(*args, **kwargs)

    class Meta:
        model = Video
        fields = ["title", "description", "new_tags_input"]
        widgets = {
            "title": forms.TextInput(attrs={"class": "form-control"}),
            "description": forms.Textarea(attrs={"class": "form-control", "rows": 3}),
        }

    def _parse_new_tag_names(self) -> list[str]:
        raw = self.cleaned_data.get("new_tags_input", "")
        if not raw:
            return []
        parts = [
            p.strip() for p in raw.replace("\n", ",").replace("，", ",").split(",")
        ]
        seen = set()
        names: list[str] = []
        for p in parts:
            if p and p not in seen:
                seen.add(p)
                names.append(p)
        return names

    def save(self, commit=True):
        from .models import Tag

        video: Video = super().save(commit)
        if not self.user:
            return video

        # Get existing tag IDs from request
        existing_tag_ids = self.data.getlist("existing_tags")
        tags = []

        if existing_tag_ids:
            existing_tags = Tag.objects.filter(id__in=existing_tag_ids, user=self.user)
            tags.extend(existing_tags)

        # Add new tags
        new_tag_names = self._parse_new_tag_names()
        if new_tag_names:
            for name in new_tag_names:
                tag, _ = Tag.objects.get_or_create(user=self.user, name=name)
                tags.append(tag)

        video.tags.set(tags)
        return video


# Video group creation form
class VideoGroupForm(forms.ModelForm):
    class Meta:
        model = VideoGroup
        fields = ["name", "description"]


class OpenAIKeyForm(forms.ModelForm):
    api_key = forms.CharField(
        label="OpenAI API Key",
        required=True,
        widget=forms.PasswordInput(attrs={"class": "form-control"}),
        help_text="Enter your OpenAI API key.",
    )

    class Meta:
        model = User
        fields = []  # Manual DB save


# Tag management form
class TagForm(forms.ModelForm):
    name = forms.CharField(
        label="Tag Name",
        max_length=64,
        widget=forms.TextInput(
            attrs={
                "class": "form-control",
                "placeholder": "e.g., physics, lecture A, final exam",
            }
        ),
        help_text="Enter tag name (64 characters or less)",
    )
    color = forms.CharField(
        label="Tag Color",
        max_length=16,
        required=False,
        widget=forms.TextInput(
            attrs={"class": "form-control", "placeholder": "#ff6b6b or red"}
        ),
        help_text="HEX color code (e.g., #ff6b6b) or color name (e.g., red)",
    )

    class Meta:
        model = Tag
        fields = ["name", "color"]
