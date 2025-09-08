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
    TagForm,
)
from django.contrib.auth.mixins import LoginRequiredMixin
from django.contrib.auth.views import LoginView as AuthLoginView
from .models import Video, VideoGroup, VideoGroupMember, Tag, VideoGroupChatLog
from .tasks import (
    process_video,
)
from app.vector_search_factory import VectorSearchFactory
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
from django.contrib.auth.decorators import login_required
from django.http import HttpResponse, Http404
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
import os
import mimetypes
from django.urls import resolve
from django.core.paginator import Paginator
from django.db.models import Sum, Count


def health_check(request):
    """ヘルスチェック用エンドポイント"""
    return HttpResponse("OK", status=200)


class HomeView(LoginRequiredMixin, TemplateView):
    template_name = "app/home.html"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        # ユーザーの動画グループを取得（prefetch_relatedでN+1問題を回避）
        video_groups = (
            VideoGroup.objects.filter(user=self.request.user)
            .prefetch_related("videos")
            .order_by("-created_at")
        )
        context["video_groups"] = video_groups

        # 最近の動画（最新5件）- 表示可能な動画のみ
        recent_videos = (
            Video.get_visible_videos_for_user(self.request.user)
            .prefetch_related("tags")
            .order_by("-uploaded_at")[:5]
        )
        context["recent_videos"] = recent_videos

        # 統計情報（表示可能な動画のみ）
        visible_videos = Video.get_visible_videos_for_user(self.request.user)
        context["total_videos"] = visible_videos.count()
        context["completed_videos"] = visible_videos.filter(status="completed").count()
        context["total_groups"] = video_groups.count()

        # 動画上限/残り本数
        try:
            video_limit = self.request.user.get_video_limit()
        except Exception:
            video_limit = 0
        context["video_limit"] = video_limit
        context["video_remaining"] = max(0, video_limit - context["total_videos"])
        
        # 既存の動画が上限を超えている場合、古い動画を非表示にする
        if context["total_videos"] > video_limit:
            hidden_count = Video.check_and_hide_over_limit_videos(self.request.user)
            if hidden_count > 0:
                messages.info(
                    self.request,
                    f"動画の上限({video_limit}本)を超えていたため、{hidden_count}本の古い動画を非表示にしました。"
                )
                # 統計情報を再取得
                visible_videos = Video.get_visible_videos_for_user(self.request.user)
                context["total_videos"] = visible_videos.count()
                context["completed_videos"] = visible_videos.filter(status="completed").count()
                context["video_remaining"] = max(0, video_limit - context["total_videos"])
        else:
            # 制限が緩和された場合、非表示動画を復活させる
            restored_count = Video.restore_hidden_videos_if_under_limit(self.request.user)
            if restored_count > 0:
                messages.success(
                    self.request,
                    f"動画の上限が緩和されたため、{restored_count}本の動画を復活させました。"
                )
                # 統計情報を再取得
                visible_videos = Video.get_visible_videos_for_user(self.request.user)
                context["total_videos"] = visible_videos.count()
                context["completed_videos"] = visible_videos.filter(status="completed").count()
                context["video_remaining"] = max(0, video_limit - context["total_videos"])

        # API設定状態とオンボーディング情報
        context["api_key_configured"] = bool(self.request.user.encrypted_openai_api_key)
        context["is_new_user"] = (
            context["total_videos"] == 0
            and context["total_groups"] == 0
            and not context["api_key_configured"]
        )

        return context


class VideoUploadView(LoginRequiredMixin, CreateView):
    form_class = VideoUploadForm
    template_name = "app/upload_video.html"
    success_url = reverse_lazy("app:home")

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        # 動画アップロード制限サイズをテンプレートに渡す
        from django.conf import settings

        context["video_upload_max_size_mb"] = getattr(
            settings, "VIDEO_UPLOAD_MAX_SIZE_MB", 100
        )
        # API設定状態をテンプレートに渡す
        context["api_key_configured"] = bool(self.request.user.encrypted_openai_api_key)
        # 既存タグをコンテキストに追加
        context["existing_tags"] = Tag.objects.filter(user=self.request.user).order_by(
            "name"
        )

        # 最近の動画（最新5件）- prefetch_relatedでN+1問題を回避
        context["recent_videos"] = (
            Video.objects.filter(user=self.request.user)
            .prefetch_related("tags")
            .order_by("-uploaded_at")[:5]
        )

        # 動画上限情報
        user = self.request.user
        current_total = Video.get_visible_videos_for_user(user).count()
        max_allowed = user.get_video_limit()
        context["user_video_limit"] = max_allowed
        context["user_video_count"] = current_total
        context["user_video_remaining"] = max(0, max_allowed - current_total)
        
        # 上限を超えている場合の情報
        if current_total > max_allowed:
            context["over_limit"] = True
            context["over_limit_count"] = current_total - max_allowed
        return context

    def get_form_kwargs(self):
        kwargs = super().get_form_kwargs()
        kwargs["user"] = self.request.user
        return kwargs

    def form_valid(self, form):
        user = self.request.user
        max_allowed = user.get_video_limit()
        
        form.instance.user = user
        # 通常の保存を先に実行
        response = super().form_valid(form)
        
        # 保存後に上限チェックを行い、必要に応じて古い動画を非表示にする
        # 新しくアップロードされた動画は除外
        hidden_count = Video.hide_oldest_videos_for_user(user, max_allowed, exclude_video_id=self.object.id)
        
        # 非表示にした動画がある場合はメッセージを表示
        if hidden_count > 0:
            messages.info(
                self.request,
                f"動画の上限({max_allowed}本)を超えたため、{hidden_count}本の古い動画を非表示にしました。"
            )
        else:
            # 制限に余裕がある場合、非表示動画を復活させる
            restored_count = Video.restore_hidden_videos_if_under_limit(user)
            if restored_count > 0:
                messages.success(
                    self.request,
                    f"動画の上限に余裕があるため、{restored_count}本の動画を復活させました。"
                )
        
        # バックグラウンド処理を起動
        process_video.delay(self.object.id)
        # AJAXの場合はJSONで成功を返す（リダイレクトしない）
        if self.request.headers.get("X-Requested-With") == "XMLHttpRequest":
            return JsonResponse({"success": True, "video_id": self.object.id})
        return response

    def form_invalid(self, form):
        # AJAX（XHR）投稿時はバリデーションエラーもJSONで返す
        if self.request.headers.get("X-Requested-With") == "XMLHttpRequest":
            return JsonResponse({"success": False, "errors": form.errors}, status=400)
        return super().form_invalid(form)


class VideoDetailView(LoginRequiredMixin, DetailView):
    model = Video
    template_name = "app/video_detail.html"
    context_object_name = "video"

    def get_queryset(self):
        # ユーザーが所有する動画のみ表示（prefetch_relatedでN+1問題を回避）
        return Video.objects.filter(user=self.request.user).prefetch_related("tags")

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
        # ユーザーが所有する動画のみ編集可能（prefetch_relatedでN+1問題を回避）
        return Video.objects.filter(user=self.request.user).prefetch_related("tags")

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        # 既存タグをコンテキストに追加
        context["existing_tags"] = Tag.objects.filter(user=self.request.user).order_by(
            "name"
        )
        return context

    def get_success_url(self):
        return reverse_lazy("app:video_detail", kwargs={"pk": self.object.pk})

    def get_form_kwargs(self):
        kwargs = super().get_form_kwargs()
        kwargs["user"] = self.request.user
        return kwargs


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
            search_service = VectorSearchFactory.create_search_service(
                user_id=request.user.id, openai_api_key=api_key
            )
            results, error_response = self.perform_search(
                search_service, group, query, max_results
            )
            if error_response:
                return error_response

            # 履歴保存（オーナー）
            try:
                ip = (request.META.get("HTTP_X_FORWARDED_FOR") or "").split(",")[
                    0
                ] or request.META.get("REMOTE_ADDR")
                VideoGroupChatView._create_log_with_quota(
                    group=group,
                    owner=request.user,
                    source="owner",
                    session_id=None,
                    question=query,
                    answer=(
                        results.get("rag_answer", "")
                        if isinstance(results, dict)
                        else ""
                    ),
                    timestamp_results=(
                        results.get("timestamp_results")
                        if isinstance(results, dict)
                        else None
                    ),
                    related_questions=(
                        results.get("related_questions")
                        if isinstance(results, dict)
                        else None
                    ),
                    requester_ip=ip,
                )
            except Exception:
                pass

            return JsonResponse({"success": True, "results": results, "query": query})

        except json.JSONDecodeError:
            return JsonResponse({"error": "無効なJSONデータです"}, status=400)
        except Exception as e:
            print(f"Group chat search error: {e}")
            return JsonResponse(
                {"error": f"検索中にエラーが発生しました: {str(e)}"}, status=500
            )

    @staticmethod
    def _create_log_with_quota(
        *,
        group,
        owner,
        source,
        session_id,
        question,
        answer,
        timestamp_results,
        related_questions,
        requester_ip,
    ):
        # 概算サイズ（バイト）。JSONは文字列長基準の概算でOK
        question_size = len(question.encode("utf-8")) if question else 0
        answer_size = len((answer or "").encode("utf-8"))
        ts_size = (
            len(json.dumps(timestamp_results, ensure_ascii=False).encode("utf-8"))
            if timestamp_results
            else 0
        )
        rq_size = (
            len(json.dumps(related_questions, ensure_ascii=False).encode("utf-8"))
            if related_questions
            else 0
        )
        ip_size = len((requester_ip or "").encode("utf-8"))
        approx_size = (
            question_size + answer_size + ts_size + rq_size + ip_size + 200
        )  # メタデータ分のバッファ

        # クォータ: 1アカウントあたり10MB
        QUOTA_BYTES = 10 * 1024 * 1024
        current_total = (
            VideoGroupChatLog.objects.filter(owner=owner).aggregate(
                total=Sum("approx_size")
            )["total"]
            or 0
        )

        # 古いものから削除して空きを作る
        if current_total + approx_size > QUOTA_BYTES:
            need = (current_total + approx_size) - QUOTA_BYTES
            reclaimed = 0
            old_logs = list(
                VideoGroupChatLog.objects.filter(owner=owner)
                .order_by("created_at")
                .values("id", "approx_size")
            )
            to_delete_ids = []
            for row in old_logs:
                to_delete_ids.append(row["id"])
                reclaimed += row["approx_size"] or 0
                if reclaimed >= need:
                    break
            if to_delete_ids:
                VideoGroupChatLog.objects.filter(id__in=to_delete_ids).delete()

        # 追加
        VideoGroupChatLog.objects.create(
            group=group,
            owner=owner,
            source=source,
            session_id=session_id,
            question=question,
            answer=answer or "",
            timestamp_results=timestamp_results,
            related_questions=related_questions,
            requester_ip=requester_ip,
            approx_size=approx_size,
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
                    # ベクトル検索サービスを使用
                    search_service = VectorSearchFactory.create_search_service(
                        user_id=user.id, openai_api_key=api_key
                    )
                    # ストリーミングメソッドを使用
                    for chunk in search_service.generate_group_rag_answer_stream(
                        group, query, max_results
                    ):
                        if chunk["type"] == "content":
                            yield f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"
                        elif chunk["type"] == "complete":
                            # 履歴保存（オーナー）
                            try:
                                ip = (
                                    request.META.get("HTTP_X_FORWARDED_FOR") or ""
                                ).split(",")[0] or request.META.get("REMOTE_ADDR")
                                VideoGroupChatView._create_log_with_quota(
                                    group=group,
                                    owner=user,
                                    source="owner",
                                    session_id=None,
                                    question=query,
                                    answer=chunk.get("full_answer", ""),
                                    timestamp_results=chunk.get("timestamp_results"),
                                    related_questions=chunk.get("related_questions"),
                                    requester_ip=ip,
                                )
                            except Exception:
                                pass
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

    def dispatch(self, request, *args, **kwargs):
        # 環境変数でサインアップが無効化されている場合は404
        if not getattr(settings, "SIGNUP_ENABLED", True):
            return redirect("app:login")
        return super().dispatch(request, *args, **kwargs)

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
        return VideoGroup.objects.filter(user=self.request.user).prefetch_related(
            "videos"
        )

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        # video_countプロパティは自動的に計算されるため、手動で設定する必要はありません
        return context


class VideoListView(LoginRequiredMixin, ListView):
    """動画一覧表示"""

    model = Video
    template_name = "app/video_list.html"
    context_object_name = "videos"
    paginate_by = 20  # リスト形式なので1ページあたり20件表示

    def get_queryset(self):
        # ユーザーの表示可能な動画のみ表示（prefetch_relatedでN+1問題を回避）
        queryset = Video.get_visible_videos_for_user(
            self.request.user
        ).prefetch_related("tags")

        # タグでの検索
        tag_filter = self.request.GET.get("tag")
        if tag_filter:
            queryset = queryset.filter(tags__name=tag_filter)

        # ステータスでの検索
        status_filter = self.request.GET.get("status")
        if status_filter:
            queryset = queryset.filter(status=status_filter)

        # アップロード日時で降順ソート
        return queryset.order_by("-uploaded_at")

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)

        # 統計情報を追加（表示可能な動画のみ）
        user_videos = Video.get_visible_videos_for_user(self.request.user)
        context["total_videos"] = user_videos.count()
        context["completed_videos"] = user_videos.filter(status="completed").count()
        context["pending_videos"] = user_videos.filter(status="pending").count()
        context["processing_videos"] = user_videos.filter(status="processing").count()
        context["error_videos"] = user_videos.filter(status="error").count()

        # 非表示動画の数も表示
        hidden_videos = Video.objects.filter(
            user=self.request.user, is_visible=False
        ).count()
        context["hidden_videos"] = hidden_videos

        # 動画上限情報
        try:
            max_allowed = self.request.user.get_video_limit()
        except Exception:
            max_allowed = 0
        context["user_video_limit"] = max_allowed
        context["user_video_remaining"] = max(0, max_allowed - context["total_videos"])
        
        # 既存の動画が上限を超えている場合、古い動画を非表示にする
        if context["total_videos"] > max_allowed:
            hidden_count = Video.check_and_hide_over_limit_videos(self.request.user)
            if hidden_count > 0:
                messages.info(
                    self.request,
                    f"動画の上限({max_allowed}本)を超えていたため、{hidden_count}本の古い動画を非表示にしました。"
                )
                # 統計情報を再取得
                user_videos = Video.get_visible_videos_for_user(self.request.user)
                context["total_videos"] = user_videos.count()
                context["completed_videos"] = user_videos.filter(status="completed").count()
                context["pending_videos"] = user_videos.filter(status="pending").count()
                context["processing_videos"] = user_videos.filter(status="processing").count()
                context["error_videos"] = user_videos.filter(status="error").count()
                context["user_video_remaining"] = max(0, max_allowed - context["total_videos"])
        else:
            # 制限が緩和された場合、非表示動画を復活させる
            restored_count = Video.restore_hidden_videos_if_under_limit(self.request.user)
            if restored_count > 0:
                messages.success(
                    self.request,
                    f"動画の上限が緩和されたため、{restored_count}本の動画を復活させました。"
                )
                # 統計情報を再取得
                user_videos = Video.get_visible_videos_for_user(self.request.user)
                context["total_videos"] = user_videos.count()
                context["completed_videos"] = user_videos.filter(status="completed").count()
                context["pending_videos"] = user_videos.filter(status="pending").count()
                context["processing_videos"] = user_videos.filter(status="processing").count()
                context["error_videos"] = user_videos.filter(status="error").count()
                context["user_video_remaining"] = max(0, max_allowed - context["total_videos"])

        # フィルター適用後の結果数も追加
        filtered_videos = self.get_queryset()
        context["filtered_count"] = filtered_videos.count()

        # 利用可能なタグを追加
        context["available_tags"] = Tag.objects.filter(user=self.request.user).order_by(
            "name"
        )

        # 現在のフィルター状態を追加
        context["current_tag"] = self.request.GET.get("tag", "")
        context["current_status"] = self.request.GET.get("status", "")

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
        # 表示可能な完了動画のみを取得
        completed_videos = group.completed_videos.order_by("title")
        context["completed_videos"] = completed_videos
        context["video_count"] = completed_videos.count()
        context["group_id"] = group.id

        # 非表示動画の数も表示（管理用）
        hidden_videos_count = group.all_completed_videos.filter(
            is_visible=False
        ).count()
        context["hidden_videos_count"] = hidden_videos_count

        return context


class VideoGroupDetailView(LoginRequiredMixin, BaseVideoGroupDetailView):
    """動画グループ詳細表示（認証ユーザー用）"""

    template_name = "app/video_group_detail.html"

    def get_queryset(self):
        return VideoGroup.objects.filter(user=self.request.user).prefetch_related(
            "videos__tags"
        )

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        # 共有URL（絶対パス）をcontextに追加
        if self.get_object().share_token:
            from django.urls import reverse

            share_url = reverse(
                "app:share_video_group", args=[self.get_object().share_token]
            )
            context["share_absolute_url"] = self.request.build_absolute_uri(share_url)

            # 現在のアクセス数を取得
            from .share_access_service import ShareAccessService

            access_service = ShareAccessService()
            context["current_active_count"] = access_service.get_account_active_count(
                self.request.user.id
            )
            context["max_concurrent_users"] = access_service.get_max_concurrent_users()
            context["session_timeout_minutes"] = (
                access_service.get_session_timeout_minutes()
            )
        else:
            context["share_absolute_url"] = ""
            context["current_active_count"] = 0
            context["max_concurrent_users"] = 0
            context["session_timeout_minutes"] = 0

        # 追加可能な動画（表示可能な完了動画のみ）
        all_user_videos = Video.objects.filter(
            user=self.request.user, status="completed", is_visible=True
        ).prefetch_related("tags")
        # グループに既に含まれている動画のIDを取得
        group_video_ids = set(context["completed_videos"].values_list("id", flat=True))
        available_videos = [
            video for video in all_user_videos if video.id not in group_video_ids
        ]
        context["available_videos"] = available_videos
        # 既存タグ一覧（選択UI用）
        context["available_tags"] = Tag.objects.filter(user=self.request.user).order_by(
            "name"
        )
        return context


class VideoGroupAddVideoView(LoginRequiredMixin, View):
    """動画グループに動画を追加"""

    def post(self, request, group_id):
        try:
            group = get_object_or_404(VideoGroup, id=group_id, user=request.user)
            video_id = request.POST.get("video_id")

            if not video_id:
                return JsonResponse({"error": "動画IDが指定されていません"}, status=400)

            # 表示可能な完了動画のみを対象とする
            video = get_object_or_404(
                Video,
                id=video_id,
                user=request.user,
                status="completed",
                is_visible=True,
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


class VideoGroupAddByTagsView(LoginRequiredMixin, View):
    """タグを指定してグループに動画を一括追加（AND条件）"""

    def post(self, request, group_id):
        try:
            group = get_object_or_404(VideoGroup, id=group_id, user=request.user)
            data = json.loads(request.body or "{}")
            raw = data.get("tags", "")
            if isinstance(raw, list):
                tag_names = [str(t).strip() for t in raw]
            else:
                safe = str(raw).replace("\u3000", " ")
                tag_names = [
                    t.strip()
                    for t in safe.replace("\n", ",").replace("，", ",").split(",")
                ]
            tag_names = [t for t in tag_names if t]
            if not tag_names:
                return JsonResponse(
                    {"error": "タグを1つ以上指定してください"}, status=400
                )

            # 指定タグ（ユーザー所有）の取得
            tags = list(Tag.objects.filter(user=request.user, name__in=tag_names))
            if len(tags) != len(set(tag_names)):
                missing = sorted(set(tag_names) - set(t.name for t in tags))
                return JsonResponse(
                    {"error": f"存在しないタグ: {', '.join(missing)}"}, status=400
                )

            # ユーザーの表示可能な完了動画から、全指定タグを持つ動画（AND）を抽出
            qs = Video.objects.filter(
                user=request.user, status="completed", is_visible=True
            ).prefetch_related("tags")
            for tag in tags:
                qs = qs.filter(tags=tag)
            candidate_ids = list(qs.values_list("id", flat=True))
            if not candidate_ids:
                return JsonResponse(
                    {
                        "success": True,
                        "added": 0,
                        "message": "条件に一致する動画はありません",
                    }
                )

            # 既存を除外して一括追加
            existing_ids = set(
                VideoGroupMember.objects.filter(group=group).values_list(
                    "video_id", flat=True
                )
            )
            to_add_ids = [vid for vid in candidate_ids if vid not in existing_ids]

            # 一括作成でN+1問題を回避
            VideoGroupMember.objects.bulk_create(
                [VideoGroupMember(group=group, video_id=vid) for vid in to_add_ids]
            )

            return JsonResponse(
                {
                    "success": True,
                    "added": len(to_add_ids),
                    "total_matched": len(candidate_ids),
                    "message": f"{len(to_add_ids)}本を追加しました（該当 {len(candidate_ids)} 本）",
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


@method_decorator(csrf_exempt, name="dispatch")
class VideoReprocessView(LoginRequiredMixin, View):
    """動画再処理ビュー"""

    def post(self, request, video_id):
        try:
            # ユーザーが所有する動画のみ再処理可能
            video = get_object_or_404(Video, id=video_id, user=request.user)

            # 動画の再処理を実行
            process_video.delay(video.id)

            return JsonResponse(
                {"success": True, "message": "動画の再処理を開始しました。"}
            )
        except Exception as e:
            return JsonResponse(
                {"success": False, "error": f"再処理の開始に失敗しました: {str(e)}"},
                status=500,
            )


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

        # エラー状態の動画があるかチェック
        error_videos = Video.objects.filter(user=user, status="error")
        if error_videos.exists():
            messages.info(
                self.request,
                f"{error_videos.count()}件のエラー状態の動画があります。動画一覧から再処理できます。",
            )

        return redirect(self.get_success_url())


class ShareVideoGroupView(BaseVideoGroupDetailView):
    """共有用URLから動画グループを閲覧（閲覧専用）"""

    template_name = "app/share_video_group_detail.html"
    slug_field = "share_token"
    slug_url_kwarg = "share_token"

    def get_queryset(self):
        # share_tokenが設定されているグループのみ（prefetch_relatedでN+1問題を回避）
        return VideoGroup.objects.exclude(share_token__isnull=True).prefetch_related(
            "videos__tags"
        )

    def get(self, request, *args, **kwargs):
        return super().get(request, *args, **kwargs)

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)

        # 現在のアクセス数を取得
        from .share_access_service import ShareAccessService

        access_service = ShareAccessService()
        group = self.get_object()

        context["current_active_count"] = access_service.get_account_active_count(
            group.user.id
        )
        context["max_concurrent_users"] = access_service.get_max_concurrent_users()
        context["session_timeout_minutes"] = (
            access_service.get_session_timeout_minutes()
        )

        return context


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

            # セッション管理
            from .share_access_service import ShareAccessService

            access_service = ShareAccessService()
            session_id = request.headers.get("X-Share-Session-ID")

            if session_id:
                # セッションアクティビティを更新
                if not access_service.update_session_activity(share_token, session_id):
                    return JsonResponse(
                        {
                            "error": "セッションが無効になりました。ページを再読み込みしてください。"
                        },
                        status=401,
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

            # ベクトル検索サービスを使用
            try:
                search_service = VectorSearchFactory.create_search_service(
                    user_id=user.id, openai_api_key=api_key
                )
                results = search_service.generate_group_rag_answer(
                    group, query, max_results
                )
            except Exception as e:
                return JsonResponse({"error": str(e)}, status=500)

            # 履歴保存（共有）
            try:
                session_id = request.headers.get("X-Share-Session-ID")
                ip = (request.META.get("HTTP_X_FORWARDED_FOR") or "").split(",")[
                    0
                ] or request.META.get("REMOTE_ADDR")
                VideoGroupChatView._create_log_with_quota(
                    group=group,
                    owner=user,
                    source="share",
                    session_id=session_id,
                    question=query,
                    answer=(
                        results.get("rag_answer", "")
                        if isinstance(results, dict)
                        else ""
                    ),
                    timestamp_results=(
                        results.get("timestamp_results")
                        if isinstance(results, dict)
                        else None
                    ),
                    related_questions=(
                        results.get("related_questions")
                        if isinstance(results, dict)
                        else None
                    ),
                    requester_ip=ip,
                )
            except Exception:
                pass

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

            # セッション管理
            from .share_access_service import ShareAccessService

            access_service = ShareAccessService()
            session_id = request.headers.get("X-Share-Session-ID")

            if session_id:
                # セッションアクティビティを更新
                if not access_service.update_session_activity(share_token, session_id):
                    return JsonResponse(
                        {
                            "error": "セッションが無効になりました。ページを再読み込みしてください。"
                        },
                        status=401,
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
                    # ベクトル検索サービスを使用
                    search_service = VectorSearchFactory.create_search_service(
                        user_id=group.user.id, openai_api_key=api_key
                    )
                    # ストリーミングメソッドを使用
                    for chunk in search_service.generate_group_rag_answer_stream(
                        group, query, max_results
                    ):
                        if chunk["type"] == "content":
                            yield f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"
                        elif chunk["type"] == "complete":
                            # 履歴保存（共有）
                            try:
                                session_id_local = request.headers.get(
                                    "X-Share-Session-ID"
                                )
                                ip = (
                                    request.META.get("HTTP_X_FORWARDED_FOR") or ""
                                ).split(",")[0] or request.META.get("REMOTE_ADDR")
                                VideoGroupChatView._create_log_with_quota(
                                    group=group,
                                    owner=group.user,
                                    source="share",
                                    session_id=session_id_local,
                                    question=query,
                                    answer=chunk.get("full_answer", ""),
                                    timestamp_results=chunk.get("timestamp_results"),
                                    related_questions=chunk.get("related_questions"),
                                    requester_ip=ip,
                                )
                            except Exception:
                                pass
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


class VideoGroupChatLogListView(LoginRequiredMixin, View):
    """動画グループのチャット履歴(JSON)を返す（オーナーのみ）"""

    def get(self, request, group_id):
        try:
            group = VideoGroup.objects.get(id=group_id, user=request.user)
        except VideoGroup.DoesNotExist:
            return JsonResponse({"error": "動画グループが見つかりません"}, status=404)

        try:
            limit = int(request.GET.get("limit", "100"))
            limit = max(1, min(limit, 500))
        except Exception:
            limit = 100

        # select_relatedでグループ情報を事前取得してN+1問題を回避
        logs = group.chat_logs.select_related("group").order_by("-created_at")[:limit]
        data = [
            {
                "id": log.id,
                "source": log.source,
                "session_id": log.session_id,
                "question": log.question,
                "answer": log.answer,
                "timestamp_results": log.timestamp_results,
                "related_questions": log.related_questions,
                "requester_ip": log.requester_ip,
                "created_at": timezone.localtime(log.created_at).isoformat(),
            }
            for log in logs
        ]
        return JsonResponse({"success": True, "logs": data})


class LoginView(AuthLoginView):
    """カスタムログインビュー"""

    template_name = "app/login.html"


class TermsView(TemplateView):
    template_name = "app/terms.html"


class PrivacyView(TemplateView):
    template_name = "app/privacy.html"


def protected_media(request, path):
    share_token = request.GET.get("share_token")
    user_authenticated = request.user.is_authenticated

    # 1. ログインユーザーは許可
    if user_authenticated:
        pass
    # 2. share_tokenが有効な場合は許可
    elif share_token:
        from app.models import Video, VideoGroup

        try:
            filename = os.path.basename(path)
            video = Video.objects.get(file__endswith=filename)
            if VideoGroup.objects.filter(
                share_token=share_token, videos=video
            ).exists():
                pass  # 許可
            else:
                from django.http import HttpResponseForbidden

                return HttpResponseForbidden("Invalid share token for this video.")
        except Exception as e:
            from django.http import HttpResponseForbidden

            return HttpResponseForbidden("Invalid share token or video.")
    else:
        from django.contrib.auth.views import redirect_to_login

        return redirect_to_login(request.get_full_path())

    file_path = os.path.join(settings.MEDIA_ROOT, path)
    if not os.path.exists(file_path):
        raise Http404()
    response = HttpResponse()
    content_type, _ = mimetypes.guess_type(file_path)
    if content_type:
        response["Content-Type"] = content_type
    response["X-Accel-Redirect"] = f"/protected_media/{path}"
    return response


class ChatLogDashboardView(LoginRequiredMixin, TemplateView):
    template_name = "app/chat_logs_dashboard.html"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        # フィルタパラメータ
        group_id = self.request.GET.get("group_id")
        source = self.request.GET.get("source")
        query = (self.request.GET.get("q") or "").strip()
        page = int(self.request.GET.get("page", "1") or 1)
        per_page = int(self.request.GET.get("per_page", "20") or 20)
        per_page = max(5, min(per_page, 100))

        # 期間フィルタ
        from django.utils.dateparse import parse_date, parse_datetime
        import datetime as _dt

        start_param = self.request.GET.get("start") or ""
        end_param = self.request.GET.get("end") or ""

        start_dt = parse_datetime(start_param) if start_param else None
        end_dt = parse_datetime(end_param) if end_param else None

        if not start_dt and start_param:
            d = parse_date(start_param)
            if d:
                start_dt = timezone.make_aware(_dt.datetime.combine(d, _dt.time.min))
        if not end_dt and end_param:
            d = parse_date(end_param)
            if d:
                end_dt = timezone.make_aware(_dt.datetime.combine(d, _dt.time.max))

        # naiveなdatetimeが来た場合はデフォルトタイムゾーン(Asia/Tokyo)でaware化
        if start_dt and timezone.is_naive(start_dt):
            start_dt = timezone.make_aware(start_dt)
        if end_dt and timezone.is_naive(end_dt):
            end_dt = timezone.make_aware(end_dt)

        # 対象グループ一覧（オーナーのもの）
        user_groups = VideoGroup.objects.filter(user=self.request.user).order_by(
            "-created_at"
        )
        logs_qs = (
            VideoGroupChatLog.objects.filter(owner=self.request.user)
            .select_related("group")
            .order_by("-created_at")
        )

        # キーワード検索（質問・回答に対して）
        if query:
            from django.db.models import Q

            logs_qs = logs_qs.filter(
                Q(question__icontains=query) | Q(answer__icontains=query)
            )
            context["current_query"] = query

        if group_id:
            try:
                group_obj = user_groups.get(id=group_id)
                logs_qs = logs_qs.filter(group=group_obj)
                context["current_group"] = group_obj
            except VideoGroup.DoesNotExist:
                pass
        if source in ("owner", "share"):
            logs_qs = logs_qs.filter(source=source)
            context["current_source"] = source

        if start_dt:
            logs_qs = logs_qs.filter(created_at__gte=start_dt)
        if end_dt:
            logs_qs = logs_qs.filter(created_at__lte=end_dt)

        paginator = Paginator(logs_qs, per_page)
        page_obj = paginator.get_page(page)

        # datetime-local の初期値整形（ローカルタイムの分まで）
        def _fmt_dt_local(dt):
            if not dt:
                return ""
            local_dt = timezone.localtime(dt)
            return local_dt.strftime("%Y-%m-%dT%H:%M")

        context.update(
            {
                "groups": user_groups,
                "page_obj": page_obj,
                "paginator": paginator,
                "logs": page_obj.object_list,
                "per_page": per_page,
                "per_page_options": [10, 20, 50, 100],
                "current_start": _fmt_dt_local(start_dt) if start_dt else "",
                "current_end": _fmt_dt_local(end_dt) if end_dt else "",
            }
        )
        return context


class ChatLogDeleteView(LoginRequiredMixin, View):
    """チャット履歴を1件削除（オーナーのみ）"""

    def post(self, request, log_id):
        log = get_object_or_404(VideoGroupChatLog, id=log_id, owner=request.user)
        log.delete()
        try:
            messages.success(request, "チャット履歴を削除しました。")
        except Exception:
            pass
        redirect_url = request.META.get("HTTP_REFERER") or reverse_lazy(
            "app:chat_logs_dashboard"
        )
        return redirect(redirect_url)


class ChatLogBulkDeleteView(LoginRequiredMixin, View):
    """チャット履歴を一括削除（ダッシュボードの表示条件に一致するもの、オーナーのみ）"""

    def post(self, request):
        from django.db.models import Q
        from django.utils.dateparse import parse_date, parse_datetime
        import datetime as _dt

        logs_qs = VideoGroupChatLog.objects.filter(owner=request.user)

        group_id = request.POST.get("group_id")
        source = request.POST.get("source")
        query = (request.POST.get("q") or "").strip()

        # 期間条件
        start_param = request.POST.get("start") or ""
        end_param = request.POST.get("end") or ""
        start_dt = parse_datetime(start_param) if start_param else None
        end_dt = parse_datetime(end_param) if end_param else None
        if not start_dt and start_param:
            d = parse_date(start_param)
            if d:
                start_dt = timezone.make_aware(_dt.datetime.combine(d, _dt.time.min))
        if not end_dt and end_param:
            d = parse_date(end_param)
            if d:
                end_dt = timezone.make_aware(_dt.datetime.combine(d, _dt.time.max))

        if start_dt and timezone.is_naive(start_dt):
            start_dt = timezone.make_aware(start_dt)
        if end_dt and timezone.is_naive(end_dt):
            end_dt = timezone.make_aware(end_dt)

        # グループ条件
        if group_id:
            try:
                group = VideoGroup.objects.get(id=int(group_id), user=request.user)
                logs_qs = logs_qs.filter(group=group)
            except Exception:
                pass

        # ソース条件
        if source in ("owner", "share"):
            logs_qs = logs_qs.filter(source=source)

        # キーワード条件
        if query:
            logs_qs = logs_qs.filter(
                Q(question__icontains=query) | Q(answer__icontains=query)
            )

        if start_dt:
            logs_qs = logs_qs.filter(created_at__gte=start_dt)
        if end_dt:
            logs_qs = logs_qs.filter(created_at__lte=end_dt)

        delete_count = logs_qs.count()
        logs_qs.delete()

        try:
            messages.success(request, f"{delete_count}件のチャット履歴を削除しました。")
        except Exception:
            pass

        redirect_url = request.META.get("HTTP_REFERER") or reverse_lazy(
            "app:chat_logs_dashboard"
        )
        return redirect(redirect_url)


class ChatLogExportView(LoginRequiredMixin, View):
    """チャット履歴をエクスポート（CSV/JSONL）。ダッシュボードと同一のフィルタを適用。"""

    def get(self, request):
        from django.db.models import Q
        from django.utils.dateparse import parse_date, parse_datetime
        import datetime as _dt
        import csv
        import json
        from django.http import HttpResponse

        fmt = (request.GET.get("format") or "csv").lower()
        if fmt not in ("csv", "jsonl"):
            fmt = "csv"

        logs_qs = VideoGroupChatLog.objects.filter(owner=request.user).select_related(
            "group"
        )

        group_id = request.GET.get("group_id")
        source = request.GET.get("source")
        query = (request.GET.get("q") or "").strip()

        start_param = request.GET.get("start") or ""
        end_param = request.GET.get("end") or ""
        start_dt = parse_datetime(start_param) if start_param else None
        end_dt = parse_datetime(end_param) if end_param else None
        if not start_dt and start_param:
            d = parse_date(start_param)
            if d:
                start_dt = timezone.make_aware(_dt.datetime.combine(d, _dt.time.min))
        if not end_dt and end_param:
            d = parse_date(end_param)
            if d:
                end_dt = timezone.make_aware(_dt.datetime.combine(d, _dt.time.max))

        if start_dt and timezone.is_naive(start_dt):
            start_dt = timezone.make_aware(start_dt)
        if end_dt and timezone.is_naive(end_dt):
            end_dt = timezone.make_aware(end_dt)

        if group_id:
            try:
                group = VideoGroup.objects.get(id=int(group_id), user=request.user)
                logs_qs = logs_qs.filter(group=group)
            except Exception:
                pass

        if source in ("owner", "share"):
            logs_qs = logs_qs.filter(source=source)

        if query:
            logs_qs = logs_qs.filter(
                Q(question__icontains=query) | Q(answer__icontains=query)
            )

        if start_dt:
            logs_qs = logs_qs.filter(created_at__gte=start_dt)
        if end_dt:
            logs_qs = logs_qs.filter(created_at__lte=end_dt)

        logs_qs = logs_qs.order_by("created_at")

        ts = timezone.now().strftime("%Y%m%d_%H%M%S")
        base = f"chat_logs_{request.user.id}_{ts}"

        if fmt == "jsonl":
            resp = HttpResponse(content_type="application/x-ndjson; charset=utf-8")
            resp["Content-Disposition"] = f'attachment; filename="{base}.jsonl"'
            for log in logs_qs.iterator(chunk_size=1000):
                # LLMのSFT用の形式: {"messages": [{"role": "user", "content": "質問"}, {"role": "assistant", "content": "回答"}]}
                obj = {
                    "messages": [
                        {"role": "user", "content": log.question or ""},
                        {"role": "assistant", "content": log.answer or ""},
                    ]
                }
                resp.write(json.dumps(obj, ensure_ascii=False) + "\n")
            return resp

        # CSV 出力
        resp = HttpResponse(content_type="text/csv; charset=utf-8")
        resp["Content-Disposition"] = f'attachment; filename="{base}.csv"'
        writer = csv.writer(resp)
        writer.writerow(
            [
                "id",
                "created_at",
                "group_id",
                "group_name",
                "source",
                "session_id",
                "question",
                "answer",
                "timestamp_results",
                "related_questions",
                "requester_ip",
            ]
        )
        for log in logs_qs.iterator(chunk_size=1000):
            writer.writerow(
                [
                    log.id,
                    timezone.localtime(log.created_at).isoformat(),
                    log.group_id,
                    log.group.name if log.group_id else "",
                    log.source,
                    (log.session_id or ""),
                    (log.question or ""),
                    (log.answer or ""),
                    (
                        json.dumps(log.timestamp_results, ensure_ascii=False)
                        if log.timestamp_results is not None
                        else ""
                    ),
                    (
                        json.dumps(log.related_questions, ensure_ascii=False)
                        if log.related_questions is not None
                        else ""
                    ),
                    (log.requester_ip or ""),
                ]
            )
        return resp


# タグ管理関連のビュー
class TagManagementView(LoginRequiredMixin, ListView):
    """タグ管理画面"""

    model = Tag
    template_name = "app/tag_management.html"
    context_object_name = "tags"
    paginate_by = 20

    def get_queryset(self):
        return (
            Tag.objects.filter(user=self.request.user)
            .annotate(video_count=Count("videos"))
            .order_by("-created_at")
        )

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        # クエリを再利用してN+1問題を回避
        queryset = self.get_queryset()
        context["total_tags"] = queryset.count()
        context["total_videos_with_tags"] = (
            Video.objects.filter(user=self.request.user, tags__isnull=False)
            .distinct()
            .count()
        )
        return context


class TagCreateView(LoginRequiredMixin, CreateView):
    """タグ作成画面"""

    model = Tag
    template_name = "app/tag_form.html"
    form_class = TagForm
    success_url = reverse_lazy("app:tag_management")

    def form_valid(self, form):
        form.instance.user = self.request.user
        messages.success(self.request, f"タグ「{form.instance.name}」を作成しました。")
        return super().form_valid(form)

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["title"] = "新規タグ作成"
        context["submit_text"] = "作成"
        return context


class TagEditView(LoginRequiredMixin, UpdateView):
    """タグ編集画面"""

    model = Tag
    template_name = "app/tag_form.html"
    form_class = TagForm
    success_url = reverse_lazy("app:tag_management")

    def get_queryset(self):
        return Tag.objects.filter(user=self.request.user)

    def form_valid(self, form):
        messages.success(self.request, f"タグ「{form.instance.name}」を更新しました。")
        return super().form_valid(form)

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["title"] = "タグ編集"
        context["submit_text"] = "更新"
        return context


class TagDeleteView(LoginRequiredMixin, DeleteView):
    """タグ削除画面"""

    model = Tag
    template_name = "app/tag_confirm_delete.html"
    success_url = reverse_lazy("app:tag_management")

    def get_queryset(self):
        return Tag.objects.filter(user=self.request.user)

    def delete(self, request, *args, **kwargs):
        tag = self.get_object()
        messages.success(request, f"タグ「{tag.name}」を削除しました。")
        return super().delete(request, *args, **kwargs)
