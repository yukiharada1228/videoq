from django.shortcuts import get_object_or_404
from django.urls import reverse_lazy
from django.views.generic import (
    TemplateView,
    CreateView,
    DeleteView,
    DetailView,
    ListView,
    UpdateView,
)
from django.views import View
from django.http import JsonResponse, HttpResponse, StreamingHttpResponse
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator
from .forms import (
    SignUpForm,
    activate_user,
    VideoUploadForm,
    VideoEditForm,
    VideoGroupForm,
    OpenAIKeyForm,
)
from django.contrib.auth.mixins import LoginRequiredMixin
from django.contrib.auth.views import LoginView as AuthLoginView
from .models import Video, VideoGroup, VideoGroupMember
from .tasks import (
    process_video,
)
from app.opensearch_service import OpenSearchService
import json
from django.contrib import messages
from django.views.generic.edit import FormView
from django.shortcuts import redirect
from django.conf import settings
from cryptography.fernet import Fernet
import base64
import hashlib
from app.crypto_utils import encrypt_api_key, decrypt_api_key
import secrets


def health_check(request):
    """ヘルスチェック用エンドポイント"""
    return HttpResponse("OK", status=200)


class HomeView(LoginRequiredMixin, TemplateView):
    template_name = "app/home.html"

    def get_context_data(self, **kwargs):

        context = super().get_context_data(**kwargs)
        # ユーザーの動画グループを取得
        video_groups = VideoGroup.objects.filter(user=self.request.user).order_by(
            "-created_at"
        )
        context["video_groups"] = video_groups

        # 最近の動画（最新5件）
        recent_videos = Video.objects.filter(user=self.request.user).order_by(
            "-uploaded_at"
        )[:5]
        context["recent_videos"] = recent_videos

        # 統計情報
        context["total_videos"] = Video.objects.filter(user=self.request.user).count()
        context["completed_videos"] = Video.objects.filter(
            user=self.request.user, status="completed"
        ).count()
        context["total_groups"] = video_groups.count()

        return context


class VideoUploadView(LoginRequiredMixin, CreateView):
    form_class = VideoUploadForm
    template_name = "app/upload_video.html"
    success_url = reverse_lazy("app:home")

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        return context

    def form_valid(self, form):
        form.instance.user = self.request.user
        response = super().form_valid(form)
        # Trigger the background task
        process_video.delay(self.object.id)
        return response


class VideoDetailView(LoginRequiredMixin, DetailView):
    model = Video
    template_name = "app/video_detail.html"
    context_object_name = "video"

    def get_queryset(self):
        # ユーザーが所有する動画のみ表示
        return Video.objects.filter(user=self.request.user)

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        video = self.get_object()

        # URLパラメータから時間を取得
        jump_time = self.request.GET.get("time")
        if jump_time:
            try:
                context["jump_time"] = float(jump_time)
            except ValueError:
                context["jump_time"] = None
        else:
            context["jump_time"] = None

        # VideoFeature/VideoChunk依存のcontext生成は削除
        # 字幕・features・chunks等はPineconeから取得する設計に統一
        return context


class VideoEditView(LoginRequiredMixin, UpdateView):
    """動画編集ビュー"""

    model = Video
    form_class = VideoEditForm
    template_name = "app/video_edit.html"

    def get_queryset(self):
        # ユーザーが所有する動画のみ編集可能
        return Video.objects.filter(user=self.request.user)

    def get_success_url(self):
        return reverse_lazy("app:video_detail", kwargs={"pk": self.object.pk})


class BaseVideoGroupChatView(View):
    """動画グループチャット機能のベースクラス"""

    def validate_query(self, data):
        """クエリの検証"""
        query = data.get("query", "").strip()
        max_results = data.get("max_results", 5)

        if not query:
            return (
                None,
                None,
                JsonResponse({"error": "検索クエリを入力してください"}, status=400),
            )

        return query, max_results, None

    def get_api_key(self, user):
        """APIキーの取得と検証"""
        if not user.encrypted_openai_api_key:
            return None, JsonResponse(
                {
                    "error": "OpenAI APIキーが登録されていません。設定画面から登録してください。"
                },
                status=400,
            )
        try:
            api_key = decrypt_api_key(user.encrypted_openai_api_key)
            return api_key, None
        except Exception:
            return None, JsonResponse(
                {"error": "APIキーの復号に失敗しました。再登録してください。"},
                status=400,
            )

    def perform_search(self, search_service, group, query, max_results):
        """検索の実行"""
        try:
            return (
                search_service.generate_group_rag_answer(group, query, max_results),
                None,
            )
        except Exception as e:
            print(f"Group Vector error: {e}")
            return None, JsonResponse(
                {"error": "検索中にエラーが発生しました"}, status=500
            )


@method_decorator(csrf_exempt, name="dispatch")
class VideoGroupChatView(LoginRequiredMixin, BaseVideoGroupChatView):
    """動画グループ用のチャット検索API"""

    def post(self, request, group_id):
        try:
            data = json.loads(request.body)

            # クエリの検証
            query, max_results, error_response = self.validate_query(data)
            if error_response:
                return error_response

            # グループの存在確認
            try:
                group = VideoGroup.objects.get(id=group_id, user=request.user)
            except VideoGroup.DoesNotExist:
                return JsonResponse(
                    {"error": "動画グループが見つかりません"},
                    status=404,
                )

            # APIキーの取得
            api_key, error_response = self.get_api_key(request.user)
            if error_response:
                return error_response

            # 検索の実行
            search_service = OpenSearchService(
                openai_api_key=api_key, user_id=request.user.id
            )
            results, error_response = self.perform_search(
                search_service, group, query, max_results
            )
            if error_response:
                return error_response

            return JsonResponse({"success": True, "results": results, "query": query})

        except json.JSONDecodeError:
            return JsonResponse({"error": "無効なJSONデータです"}, status=400)
        except Exception as e:
            print(f"Group chat search error: {e}")
            return JsonResponse(
                {"error": f"検索中にエラーが発生しました: {str(e)}"}, status=500
            )


@method_decorator(csrf_exempt, name="dispatch")
class VideoGroupChatStreamView(LoginRequiredMixin, View):
    """動画グループ用のストリーミングチャット検索API（SSE対応）"""

    def post(self, request, group_id):
        try:
            data = json.loads(request.body)
            query = data.get("query", "").strip()
            max_results = data.get("max_results", 5)

            if not query:
                return JsonResponse(
                    {"error": "検索クエリを入力してください"}, status=400
                )

            # グループの存在確認とAPIキー取得
            try:
                group = VideoGroup.objects.get(id=group_id, user=request.user)
            except VideoGroup.DoesNotExist:
                return JsonResponse(
                    {"error": "動画グループが見つかりません"},
                    status=404,
                )

            # ユーザーごとのAPIキーを取得
            user = request.user
            if not user.encrypted_openai_api_key:
                return JsonResponse(
                    {
                        "error": "OpenAI APIキーが登録されていません。設定画面から登録してください。"
                    },
                    status=400,
                )
            try:
                api_key = decrypt_api_key(user.encrypted_openai_api_key)
            except Exception:
                return JsonResponse(
                    {"error": "APIキーの復号に失敗しました。再登録してください。"},
                    status=400,
                )

            def generate_stream():
                try:
                    # OpenSearch検索サービスを使用
                    search_service = OpenSearchService(
                        openai_api_key=api_key, user_id=user.id
                    )
                    # ストリーミングメソッドを使用
                    for chunk in search_service.generate_group_rag_answer_stream(
                        group, query, max_results
                    ):
                        if chunk["type"] == "content":
                            yield f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"
                        elif chunk["type"] == "complete":
                            yield f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"
                            break
                        elif chunk["type"] == "error":
                            yield f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"
                            break
                except Exception as e:
                    error_chunk = {
                        "type": "error",
                        "message": f"ストリーミング中にエラーが発生しました: {str(e)}",
                    }
                    yield f"data: {json.dumps(error_chunk, ensure_ascii=False)}\n\n"
                finally:
                    # ストリーム終了
                    yield "data: [DONE]\n\n"

            response = StreamingHttpResponse(
                generate_stream(),
                content_type="text/event-stream",
                headers={
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive",
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Headers": "Cache-Control",
                },
            )
            return response

        except json.JSONDecodeError:
            return JsonResponse({"error": "無効なJSONデータです"}, status=400)
        except Exception as e:
            print(f"Group chat stream error: {e}")
            return JsonResponse(
                {"error": f"ストリーミング中にエラーが発生しました: {str(e)}"},
                status=500,
            )


class VideoDeleteView(LoginRequiredMixin, DeleteView):
    model = Video
    template_name = "app/delete_video.html"
    success_url = reverse_lazy("app:home")

    def get_queryset(self):
        # ユーザーが所有する動画のみ削除可能
        return Video.objects.filter(user=self.request.user)

    def delete(self, request, *args, **kwargs):
        video = self.get_object()
        # Videoモデルのdeleteメソッドで完全削除（Pinecone + S3 + DB）
        return super().delete(request, *args, **kwargs)


class SignUpView(CreateView):
    form_class = SignUpForm
    success_url = reverse_lazy("app:signup_done")  # ログインURLは後で設定
    template_name = "app/signup.html"

    def get_context_data(self, **kwargs):
        import markdown
        import os

        context = super().get_context_data(**kwargs)
        terms_md_path = os.path.join(
            settings.BASE_DIR, "app", "templates", "app", "terms.md"
        )
        privacy_md_path = os.path.join(
            settings.BASE_DIR, "app", "templates", "app", "privacy.md"
        )
        with open(terms_md_path, encoding="utf-8") as f:
            terms_md = f.read()
        with open(privacy_md_path, encoding="utf-8") as f:
            privacy_md = f.read()
        context["terms_html"] = markdown.markdown(terms_md)
        context["privacy_html"] = markdown.markdown(privacy_md)
        return context

    def form_invalid(self, form):
        return super().form_invalid(form)


class SignUpDoneView(TemplateView):
    template_name = "app/signup_done.html"


class ActivateView(TemplateView):
    template_name = "app/activate.html"

    def get(self, request, uidb64, token, *args, **kwargs):
        result = activate_user(uidb64, token)
        context = self.get_context_data(result=result)
        return self.render_to_response(context)


class VideoGroupListView(LoginRequiredMixin, ListView):
    """動画グループ一覧表示"""

    model = VideoGroup
    template_name = "app/video_group_list.html"
    context_object_name = "video_groups"

    def get_queryset(self):
        return VideoGroup.objects.filter(user=self.request.user)

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        # video_countプロパティは自動的に計算されるため、手動で設定する必要はありません
        return context


class VideoListView(LoginRequiredMixin, ListView):
    """動画一覧表示"""

    model = Video
    template_name = "app/video_list.html"
    context_object_name = "videos"
    paginate_by = 12  # 1ページあたり12件表示

    def get_queryset(self):
        # ユーザーが所有する動画のみ表示、アップロード日時で降順ソート
        return Video.objects.filter(user=self.request.user).order_by("-uploaded_at")

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        # 統計情報を追加
        context["total_videos"] = Video.objects.filter(user=self.request.user).count()
        context["completed_videos"] = Video.objects.filter(
            user=self.request.user, status="completed"
        ).count()
        context["pending_videos"] = Video.objects.filter(
            user=self.request.user, status="pending"
        ).count()
        context["processing_videos"] = Video.objects.filter(
            user=self.request.user, status="processing"
        ).count()
        context["error_videos"] = Video.objects.filter(
            user=self.request.user, status="error"
        ).count()
        return context


class VideoGroupCreateView(LoginRequiredMixin, CreateView):
    """動画グループ作成"""

    model = VideoGroup
    form_class = VideoGroupForm
    template_name = "app/video_group_create.html"
    success_url = reverse_lazy("app:video_group_list")

    def form_valid(self, form):
        form.instance.user = self.request.user
        return super().form_valid(form)


class BaseVideoGroupDetailView(DetailView):
    """動画グループ詳細表示のベースクラス"""

    model = VideoGroup
    context_object_name = "group"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        group = self.get_object()
        completed_videos = group.completed_videos.order_by("title")
        context["completed_videos"] = completed_videos
        context["video_count"] = completed_videos.count()
        context["group_id"] = group.id
        return context


class VideoGroupDetailView(LoginRequiredMixin, BaseVideoGroupDetailView):
    """動画グループ詳細表示（認証ユーザー用）"""

    template_name = "app/video_group_detail.html"

    def get_queryset(self):
        return VideoGroup.objects.filter(user=self.request.user)

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        # 共有URL（絶対パス）をcontextに追加
        if self.get_object().share_token:
            from django.urls import reverse

            share_url = reverse(
                "app:share_video_group", args=[self.get_object().share_token]
            )
            context["share_absolute_url"] = self.request.build_absolute_uri(share_url)
        else:
            context["share_absolute_url"] = ""
        # 追加可能な動画
        all_user_videos = Video.objects.filter(
            user=self.request.user, status="completed"
        )
        group_video_ids = set(context["completed_videos"].values_list("id", flat=True))
        available_videos = [
            video for video in all_user_videos if video.id not in group_video_ids
        ]
        context["available_videos"] = available_videos
        return context


class VideoGroupAddVideoView(LoginRequiredMixin, View):
    """動画グループに動画を追加"""

    def post(self, request, group_id):
        try:
            group = get_object_or_404(VideoGroup, id=group_id, user=request.user)
            video_id = request.POST.get("video_id")

            if not video_id:
                return JsonResponse({"error": "動画IDが指定されていません"}, status=400)

            video = get_object_or_404(
                Video, id=video_id, user=request.user, status="completed"
            )

            # 既にグループに追加されているかチェック
            if VideoGroupMember.objects.filter(group=group, video=video).exists():
                return JsonResponse(
                    {"error": "この動画は既にグループに追加されています"}, status=400
                )

            # グループに動画を追加
            VideoGroupMember.objects.create(group=group, video=video)

            return JsonResponse(
                {
                    "success": True,
                    "message": f"動画「{video.title}」をグループ「{group.name}」に追加しました",
                }
            )

        except Exception as e:
            return JsonResponse({"error": str(e)}, status=500)


class VideoGroupRemoveVideoView(LoginRequiredMixin, View):
    """動画グループから動画を削除"""

    def post(self, request, group_id, video_id):
        try:
            group = get_object_or_404(VideoGroup, id=group_id, user=request.user)
            video = get_object_or_404(Video, id=video_id, user=request.user)

            # グループから動画を削除
            VideoGroupMember.objects.filter(group=group, video=video).delete()

            return JsonResponse(
                {
                    "success": True,
                    "message": f"動画「{video.title}」をグループ「{group.name}」から削除しました",
                }
            )

        except Exception as e:
            return JsonResponse({"error": str(e)}, status=500)


class VideoGroupDeleteView(LoginRequiredMixin, DeleteView):
    model = VideoGroup
    template_name = "app/delete_video_group.html"
    success_url = reverse_lazy("app:video_group_list")

    def get_queryset(self):
        # ユーザーが所有するグループのみ削除可能
        return VideoGroup.objects.filter(user=self.request.user)


# 暗号化用
def get_fernet():
    # SECRET_KEYを32バイトにハッシュ化してFernet鍵に
    key = hashlib.sha256(settings.SECRET_KEY.encode()).digest()
    fernet_key = base64.urlsafe_b64encode(key)
    return Fernet(fernet_key)


def encrypt_api_key(api_key: str) -> str:
    f = get_fernet()
    return f.encrypt(api_key.encode()).decode()


def decrypt_api_key(encrypted: str) -> str:
    f = get_fernet()
    return f.decrypt(encrypted.encode()).decode()


class OpenAIKeyUpdateView(LoginRequiredMixin, FormView):
    template_name = "app/openai_key_form.html"
    form_class = OpenAIKeyForm
    success_url = "/"  # マイページ等にリダイレクト推奨

    def get_initial(self):
        initial = super().get_initial()
        user = self.request.user
        if user.encrypted_openai_api_key:
            try:
                initial["api_key"] = decrypt_api_key(user.encrypted_openai_api_key)
            except Exception:
                initial["api_key"] = ""
        return initial

    def form_valid(self, form):
        api_key = form.cleaned_data["api_key"]
        user = self.request.user
        user.encrypted_openai_api_key = encrypt_api_key(api_key)
        user.save()
        messages.success(self.request, "OpenAI APIキーを保存しました。")
        return redirect(self.get_success_url())


class ShareVideoGroupView(BaseVideoGroupDetailView):
    """共有用URLから動画グループを閲覧（閲覧専用）"""

    template_name = "app/share_video_group_detail.html"
    slug_field = "share_token"
    slug_url_kwarg = "share_token"

    def get_queryset(self):
        # share_tokenが設定されているグループのみ
        return VideoGroup.objects.exclude(share_token__isnull=True)

    def get(self, request, *args, **kwargs):
        return super().get(request, *args, **kwargs)


class VideoGroupShareToggleView(LoginRequiredMixin, View):
    """動画グループの共有URL発行・無効化"""

    def post(self, request, pk):
        group = get_object_or_404(VideoGroup, pk=pk, user=request.user)
        action = request.POST.get("action")
        if action == "enable":
            # トークン生成
            group.share_token = secrets.token_urlsafe(32)
            group.save()
            return JsonResponse(
                {
                    "success": True,
                    "share_url": request.build_absolute_uri(
                        f"/share/group/{group.share_token}/"
                    ),
                }
            )
        elif action == "disable":
            group.share_token = None
            group.save()
            return JsonResponse({"success": True})
        return JsonResponse(
            {"success": False, "error": "不正なアクションです"}, status=400
        )


@method_decorator(csrf_exempt, name="dispatch")
class ShareVideoGroupChatView(BaseVideoGroupChatView):
    """共有用動画グループチャットAPI（認証不要、共有元ユーザーのAPIキーを利用）"""

    def post(self, request, share_token):
        try:
            data = json.loads(request.body)

            # クエリの検証
            query, max_results, error_response = self.validate_query(data)
            if error_response:
                return error_response

            # グループ特定
            try:
                group = VideoGroup.objects.get(share_token=share_token)
            except VideoGroup.DoesNotExist:
                return JsonResponse(
                    {"error": "動画グループが見つかりません"}, status=404
                )

            # 共有元ユーザーのAPIキーを取得
            user = group.user
            if not user.encrypted_openai_api_key:
                return JsonResponse(
                    {"error": "OpenAI APIキーが登録されていません。"}, status=400
                )
            try:
                api_key = decrypt_api_key(user.encrypted_openai_api_key)
            except Exception:
                return JsonResponse(
                    {"error": "APIキーの復号に失敗しました。"}, status=400
                )

            # OpenSearch検索サービスを使用
            try:
                search_service = OpenSearchService(
                    openai_api_key=api_key, user_id=user.id
                )
                results = search_service.generate_group_rag_answer(
                    group, query, max_results
                )
            except Exception as e:
                return JsonResponse({"error": str(e)}, status=500)

            return JsonResponse({"success": True, "results": results})
        except Exception as e:
            return JsonResponse({"error": str(e)}, status=500)


@method_decorator(csrf_exempt, name="dispatch")
class ShareVideoGroupChatStreamView(View):
    """共有用動画グループストリーミングチャットAPI（SSE対応）"""

    def post(self, request, share_token):
        try:
            data = json.loads(request.body)
            query = data.get("query", "").strip()
            max_results = data.get("max_results", 5)

            if not query:
                return JsonResponse(
                    {"error": "検索クエリを入力してください"}, status=400
                )

            # グループ特定
            try:
                group = VideoGroup.objects.get(share_token=share_token)
            except VideoGroup.DoesNotExist:
                return JsonResponse(
                    {"error": "動画グループが見つかりません"}, status=404
                )

            # 共有元ユーザーのAPIキーを取得
            user = group.user
            if not user.encrypted_openai_api_key:
                return JsonResponse(
                    {"error": "OpenAI APIキーが登録されていません。"}, status=400
                )
            try:
                api_key = decrypt_api_key(user.encrypted_openai_api_key)
            except Exception:
                return JsonResponse(
                    {"error": "APIキーの復号に失敗しました。"}, status=400
                )

            def generate_stream():
                try:
                    # OpenSearch検索サービスを使用
                    search_service = OpenSearchService(
                        openai_api_key=api_key, user_id=group.user.id
                    )
                    # ストリーミングメソッドを使用
                    for chunk in search_service.generate_group_rag_answer_stream(
                        group, query, max_results
                    ):
                        if chunk["type"] == "content":
                            yield f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"
                        elif chunk["type"] == "complete":
                            yield f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"
                            break
                        elif chunk["type"] == "error":
                            yield f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"
                            break
                except Exception as e:
                    error_chunk = {
                        "type": "error",
                        "message": f"ストリーミング中にエラーが発生しました: {str(e)}",
                    }
                    yield f"data: {json.dumps(error_chunk, ensure_ascii=False)}\n\n"
                finally:
                    # ストリーム終了
                    yield "data: [DONE]\n\n"

            response = StreamingHttpResponse(
                generate_stream(),
                content_type="text/event-stream",
                headers={
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive",
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Headers": "Cache-Control",
                },
            )
            return response

        except json.JSONDecodeError:
            return JsonResponse({"error": "無効なJSONデータです"}, status=400)
        except Exception as e:
            print(f"Share group chat stream error: {e}")
            return JsonResponse(
                {"error": f"ストリーミング中にエラーが発生しました: {str(e)}"},
                status=500,
            )


class CommercialDisclosureView(TemplateView):
    """特定商取引法に基づく表記ページ"""

    template_name = "app/commercial_disclosure.html"


class LoginView(AuthLoginView):
    """カスタムログインビュー"""

    template_name = "app/login.html"


class TermsView(TemplateView):
    template_name = "app/terms.html"


class PrivacyView(TemplateView):
    template_name = "app/privacy.html"
