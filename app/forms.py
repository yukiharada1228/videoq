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


# サインアップ用フォーム
class SignUpForm(UserCreationForm):
    FORM_CONTROL_CLASS = "form-control"

    email = forms.EmailField(
        label="メールアドレス",
        required=True,
        widget=forms.EmailInput(attrs={"class": FORM_CONTROL_CLASS}),
    )
    username = forms.CharField(
        label="ユーザー名", widget=forms.TextInput(attrs={"class": FORM_CONTROL_CLASS})
    )
    password1 = forms.CharField(
        label="パスワード",
        widget=forms.PasswordInput(attrs={"class": FORM_CONTROL_CLASS}),
    )
    password2 = forms.CharField(
        label="パスワード（確認）",
        widget=forms.PasswordInput(attrs={"class": FORM_CONTROL_CLASS}),
    )
    agree_terms = forms.BooleanField(
        label='<a href="/terms/" target="_blank">利用規約</a>および<a href="/privacy/" target="_blank">プライバシーポリシー</a>に同意する',
        required=True,
        error_messages={
            "required": "利用規約とプライバシーポリシーへの同意が必要です。"
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
            "このユーザー名は既に使用されています。",
        )

    def clean_email(self):
        return self._check_field_exists(
            "email",
            self.cleaned_data.get("email"),
            "このメールアドレスは既に登録されています。",
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
        subject = "VideoQ登録確認"
        message_template = """
ご登録ありがとうございます。
以下URLをクリックして登録を完了してください。

"""
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
    # 新規タグの入力（カンマ区切り）
    new_tags_input = forms.CharField(
        label="新規タグ（カンマ区切り・任意）",
        required=False,
        widget=forms.TextInput(
            attrs={"class": "form-control", "placeholder": "例: 物理, 講義A, 期末対策"}
        ),
        help_text="新しいタグはカンマ , で区切って入力。既存のタグと組み合わせて使用できます。",
    )

    def __init__(self, *args, **kwargs):
        self.user = kwargs.pop("user", None)
        super().__init__(*args, **kwargs)
        self.fields["title"].widget.attrs.setdefault(
            "placeholder", "動画タイトルを入力"
        )
        self.fields["description"].widget.attrs.setdefault(
            "placeholder", "説明（任意）"
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

        # リクエストから既存タグのIDを取得
        existing_tag_ids = self.data.getlist("existing_tags")
        tags = []

        if existing_tag_ids:
            existing_tags = Tag.objects.filter(id__in=existing_tag_ids, user=self.user)
            tags.extend(existing_tags)

        # 新規タグを追加
        new_tag_names = self._parse_new_tag_names()
        if new_tag_names:
            for name in new_tag_names:
                tag, _ = Tag.objects.get_or_create(user=self.user, name=name)
                tags.append(tag)

        video.tags.set(tags)
        return video


# 動画編集用フォーム
class VideoEditForm(forms.ModelForm):
    # 新規タグの入力（カンマ区切り）
    new_tags_input = forms.CharField(
        label="新規タグ（カンマ区切り・任意）",
        required=False,
        widget=forms.TextInput(
            attrs={"class": "form-control", "placeholder": "例: 物理, 講義A, 期末対策"}
        ),
        help_text="新しいタグはカンマ , で区切って入力。既存のタグと組み合わせて使用できます。",
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

        # リクエストから既存タグのIDを取得
        existing_tag_ids = self.data.getlist("existing_tags")
        tags = []

        if existing_tag_ids:
            existing_tags = Tag.objects.filter(id__in=existing_tag_ids, user=self.user)
            tags.extend(existing_tags)

        # 新規タグを追加
        new_tag_names = self._parse_new_tag_names()
        if new_tag_names:
            for name in new_tag_names:
                tag, _ = Tag.objects.get_or_create(user=self.user, name=name)
                tags.append(tag)

        video.tags.set(tags)
        return video


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


# タグ管理用フォーム
class TagForm(forms.ModelForm):
    name = forms.CharField(
        label="タグ名",
        max_length=64,
        widget=forms.TextInput(
            attrs={"class": "form-control", "placeholder": "例: 物理, 講義A, 期末対策"}
        ),
        help_text="タグの名前を入力してください（64文字以内）",
    )
    color = forms.CharField(
        label="タグの色",
        max_length=16,
        required=False,
        widget=forms.TextInput(
            attrs={"class": "form-control", "placeholder": "#ff6b6b または red"}
        ),
        help_text="HEXカラーコード（例: #ff6b6b）または色名（例: red）",
    )

    class Meta:
        model = Tag
        fields = ["name", "color"]
