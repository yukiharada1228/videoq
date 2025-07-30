from django import forms
from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.forms import UserCreationForm
from django.contrib.auth.tokens import default_token_generator
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from django.utils.translation import gettext as _
from .models import Video, VideoGroup
import os

User = get_user_model()


# サインアップ用フォーム
class SignUpForm(UserCreationForm):
    FORM_CONTROL_CLASS = "form-control"

    email = forms.EmailField(
        label=_("Email Address"),
        required=True,
        widget=forms.EmailInput(attrs={"class": FORM_CONTROL_CLASS}),
    )
    username = forms.CharField(
        label=_("Username"), widget=forms.TextInput(attrs={"class": FORM_CONTROL_CLASS})
    )
    password1 = forms.CharField(
        label=_("Password"),
        widget=forms.PasswordInput(attrs={"class": FORM_CONTROL_CLASS}),
    )
    password2 = forms.CharField(
        label=_("Password (Confirm)"),
        widget=forms.PasswordInput(attrs={"class": FORM_CONTROL_CLASS}),
    )
    agree_terms = forms.BooleanField(
        label=_(
            '<a href="/terms/" target="_blank">Terms of Service</a> and <a href="/privacy/" target="_blank">Privacy Policy</a> agreement'
        ),
        required=True,
        error_messages={
            "required": _("You must agree to the Terms of Service and Privacy Policy.")
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
            _("This username is already taken."),
        )

    def clean_email(self):
        return self._check_field_exists(
            "email",
            self.cleaned_data.get("email"),
            _("This email address is already registered."),
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
        subject = _("VideoQ Registration Confirmation")
        message_template = _(
            """
Thank you for registering.
Please click the following URL to complete your registration.

"""
        )
        uid = urlsafe_base64_encode(force_bytes(user.pk))
        token = default_token_generator.make_token(user)
        activate_url = settings.FRONTEND_URL + f"/activate/{uid}/{token}/"
        message = message_template + activate_url
        user.email_user(subject, message)


# アカウント有効化用
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


# 動画アップロード用フォーム
class VideoUploadForm(forms.ModelForm):
    class Meta:
        model = Video
        fields = ["file", "title", "description"]
        widgets = {
            "title": forms.TextInput(attrs={"class": "form-control"}),
            "description": forms.Textarea(attrs={"class": "form-control", "rows": 3}),
        }

    def clean_file(self):
        file = self.cleaned_data.get("file")
        if file:
            # ファイルサイズのチェック（設定から取得）
            max_size_mb = getattr(settings, "VIDEO_UPLOAD_MAX_SIZE_MB", 100)
            max_size_bytes = max_size_mb * 1024 * 1024

            if file.size > max_size_bytes:
                raise forms.ValidationError(
                    f"ファイルサイズは{max_size_mb}MB以下にしてください。"
                )

            # ファイル形式のチェック
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
                raise forms.ValidationError("対応していないファイル形式です。")

        return file


# 動画編集用フォーム
class VideoEditForm(forms.ModelForm):
    class Meta:
        model = Video
        fields = ["title", "description"]
        widgets = {
            "title": forms.TextInput(attrs={"class": "form-control"}),
            "description": forms.Textarea(attrs={"class": "form-control", "rows": 3}),
        }


# 動画グループ作成用フォーム
class VideoGroupForm(forms.ModelForm):
    class Meta:
        model = VideoGroup
        fields = ["name", "description"]


class OpenAIKeyForm(forms.ModelForm):
    api_key = forms.CharField(
        label="OpenAI APIキー",
        required=True,
        widget=forms.PasswordInput(attrs={"class": "form-control"}),
        help_text="あなたのOpenAI APIキーを入力してください。",
    )

    class Meta:
        model = User
        fields = []  # DB保存は手動で行う
