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
from django.db.models import Prefetch
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
    process_stripe_webhook,
    sync_specific_user_subscription,
)
from .services import VectorSearchService
from app.opensearch_service import OpenSearchService
import numpy as np
from openai import OpenAI
import os
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
from datetime import datetime, timezone as dt_timezone
import logging
from django.utils import timezone
from .plan_constants import PLAN_INFO, DEFAULT_PLAN_KEY
from django.http import HttpResponseForbidden

# Create your views here.


def health_check(request):
    """ヘルスチェック用エンドポイント"""
    return HttpResponse("OK", status=200)


def disable_user_sharing(user):
    """ユーザーが所有するすべての動画グループの共有URLを無効化"""
    from app.models import VideoGroup

    shared_groups = VideoGroup.objects.filter(user=user, share_token__isnull=False)
    for group in shared_groups:
        # 共有URLの履歴を保存
        group.save_share_token_history()
        group.share_token = None
        group.save()
        print(f"Disabled sharing for group: {group.name} (saved history)")


def restore_user_sharing(user):
    """ユーザーが所有する動画グループの共有URLを履歴から復活"""
    from app.models import VideoGroup

    groups_with_history = VideoGroup.objects.filter(
        user=user, previous_share_token__isnull=False, share_token__isnull=True
    )
    restored_count = 0
    for group in groups_with_history:
        if group.restore_share_token():
            group.save()
            restored_count += 1
            print(f"Restored sharing for group: {group.name}")

    if restored_count > 0:
        print(f"Restored {restored_count} shared groups for user {user.id}")

    return restored_count


@login_required
def create_checkout_session(request):
    print("=== create_checkout_session called ===")
    # プラン名をPOST/GETから取得（現状はbasic固定、将来UIで選択可能に）
    plan = (
        request.POST.get("plan") or request.GET.get("plan") or list(PLAN_INFO.keys())[0]
    )
    if plan == DEFAULT_PLAN_KEY:
        # サブスク解除処理に統一
        from app.stripe_service import StripeService

        stripe_service = StripeService()
        result = stripe_service.cancel_user_subscription(request.user, logging)

        if result["status"] == "success" and result["canceled"]:
            print(f"Subscription canceled successfully for user: {request.user.id}")
        elif result["status"] == "success" and not result["canceled"]:
            print(f"No active subscription found for user: {request.user.id}")
        else:
            print(f"Failed to cancel subscription for user: {request.user.id}")

        # 無料プラン変更時は専用完了画面に遷移（そこで同期処理を実行）
        return redirect("app:subscription_downgrade_success")

    price_id = settings.STRIPE_PRICE_IDS.get(plan)
    if not price_id:
        return JsonResponse({"error": f"プランIDが不正です: {plan}"}, status=400)

    try:
        customer_id = request.user.stripe_customer_id

        checkout_params = {
            "payment_method_types": ["card"],
            "line_items": [
                {
                    "price": price_id,
                    "quantity": 1,
                }
            ],
            "mode": "subscription",
            "success_url": settings.DOMAIN + "/subscription/success/",
            "cancel_url": settings.DOMAIN + "/subscription/cancel/",
            "client_reference_id": request.user.id,
            "metadata": {"plan_name": plan},
        }
        if customer_id:
            checkout_params["customer"] = customer_id
        else:
            checkout_params["customer_email"] = request.user.email

        from app.stripe_service import StripeService

        stripe_service = StripeService()
        result = stripe_service.create_checkout_session(checkout_params, logging)
        if result["status"] == "success":
            session = result["session"]
            print("=== Stripe Session created ===")
            return redirect(session.url)
        else:
            print(f"=== Stripe Session creation failed: {result['message']} ===")
            return JsonResponse({"error": result["message"]}, status=500)
    except Exception as e:
        print(f"=== Stripe Exception: {e} ===")
        logging.exception("Stripe Checkout Session作成時にエラー発生")
        return JsonResponse({"error": str(e)}, status=500)


@csrf_exempt
def stripe_webhook_test(request):
    """Webhookのテスト用エンドポイント"""
    print("=== Webhook Test Endpoint ===")
    print(f"Method: {request.method}")
    print(f"Headers: {dict(request.META)}")
    print(f"Body: {request.body.decode('utf-8')}")

    # 実際のWebhook処理を呼び出し
    return stripe_webhook(request)


@csrf_exempt
def stripe_webhook(request):
    payload = request.body
    sig_header = request.META.get("HTTP_STRIPE_SIGNATURE")

    # デバッグログ
    print(f"Webhook received: {request.method}")
    print(f"Content-Type: {request.META.get('CONTENT_TYPE', 'Not set')}")
    print(f"Stripe-Signature: {sig_header}")
    print(f"Payload length: {len(payload)}")

    # StripeServiceを使用してWebhook署名を検証
    from app.stripe_service import StripeService
    from django.conf import settings

    stripe_service = StripeService()
    result = stripe_service.verify_webhook_signature(
        payload, sig_header, settings.STRIPE_WEBHOOK_SECRET, logging
    )

    if result["status"] != "success":
        return JsonResponse({"status": result["message"]}, status=400)

    event = result["event"]
    print(f"Event type: {event['type']}")
    print(f"Event ID: {event['id']}")

    # イベントを非同期タスクで処理
    try:
        # イベントIDを取得して冪等性チェック
        event_id = event.get("id")
        if not event_id:
            print("No event ID found in webhook payload")
            return JsonResponse(
                {"status": "error", "message": "No event ID"}, status=400
            )

        # タスクをキューイング
        task_result = process_stripe_webhook.delay(
            event["type"], event  # event全体を渡す
        )
        print(
            f"Webhook event {event['type']} (ID: {event_id}) queued for processing with task ID: {task_result.id}"
        )

        # タスクIDをログに記録（後で追跡可能）
        logging.info(f"Webhook event {event_id} queued with task ID: {task_result.id}")

    except Exception as e:
        print(f"Error queuing webhook task: {e}")
        logging.error(f"Failed to queue webhook task for event {event.get('id')}: {e}")
        # タスクのキューイングに失敗した場合でも、Stripeには成功レスポンスを返す
        # 後で手動で同期できるようにする

    # 即座に成功レスポンスを返す
    return JsonResponse({"status": "success", "event_id": event.get("id")})


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

        # プラン情報
        plan = getattr(self.request.user, "subscription_plan", DEFAULT_PLAN_KEY)
        plan_info = PLAN_INFO.get(plan, PLAN_INFO[DEFAULT_PLAN_KEY])
        plan_display = plan_info["display"]
        plan_limit = plan_info["limit"]
        context["plan_display_name"] = plan_display
        context["plan_limit"] = plan_limit
        context["remaining_videos"] = max(0, plan_limit - context["total_videos"])
        context["PLAN_INFO"] = PLAN_INFO
        return context


class VideoUploadView(LoginRequiredMixin, CreateView):
    form_class = VideoUploadForm
    template_name = "app/upload_video.html"
    success_url = reverse_lazy("app:home")

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        user = self.request.user
        video_count = user.videos.count()
        context["current_plan"] = PLAN_INFO.get(
            user.subscription_plan, PLAN_INFO[DEFAULT_PLAN_KEY]
        )
        # プラン情報
        plan = getattr(self.request.user, "subscription_plan", DEFAULT_PLAN_KEY)
        plan_info = PLAN_INFO.get(plan, PLAN_INFO[DEFAULT_PLAN_KEY])
        plan_display = plan_info["display"]
        plan_limit = plan_info["limit"]
        context["plan_display_name"] = plan_display
        context["plan_limit"] = plan_limit
        context["remaining_videos"] = max(0, plan_limit - video_count)
        context["PLAN_INFO"] = PLAN_INFO
        return context

    def form_valid(self, form):

        # 動画アップロード数の制限チェック
        user = self.request.user
        video_count = user.videos.count()

        # プランごとの動画アップロード上限を取得
        plan_limit = PLAN_INFO.get(user.subscription_plan, PLAN_INFO[DEFAULT_PLAN_KEY])[
            "limit"
        ]
        if video_count >= plan_limit:
            return self.form_invalid(
                form,
                message=f"アップロード制限に達しました。現在{video_count}本の動画が登録されており、{PLAN_INFO[user.subscription_plan]['display']}では合計{plan_limit}本までしかアップロードできません。",
            )

        form.instance.user = user
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
            search_service = OpenSearchService(openai_api_key=api_key, user_id=request.user.id)
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
                    search_service = OpenSearchService(openai_api_key=api_key, user_id=user.id)
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
        terms_md_path = os.path.join(settings.BASE_DIR, "app", "templates", "app", "terms.md")
        privacy_md_path = os.path.join(settings.BASE_DIR, "app", "templates", "app", "privacy.md")
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
        # プラン情報
        plan = getattr(self.request.user, "subscription_plan", DEFAULT_PLAN_KEY)
        plan_info = PLAN_INFO.get(plan, PLAN_INFO[DEFAULT_PLAN_KEY])
        plan_display = plan_info["display"]
        plan_limit = plan_info["limit"]
        context["plan_display_name"] = plan_display
        context["plan_limit"] = plan_limit
        context["remaining_videos"] = max(0, plan_limit - context["total_videos"])
        context["PLAN_INFO"] = PLAN_INFO
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
        # 共有元ユーザーのサブスクリプション状態をチェック
        group = self.get_object()
        if not group.user.is_subscribed:
            # 共有元ユーザーが無料プランの場合、共有URLを無効化
            group.share_token = None
            group.save()
            return HttpResponseForbidden("この共有URLは無効です。")

        return super().get(request, *args, **kwargs)


class VideoGroupShareToggleView(LoginRequiredMixin, View):
    """動画グループの共有URL発行・無効化"""

    def post(self, request, pk):
        if not request.user.is_subscribed:
            return HttpResponseForbidden("有料プラン契約が必要です。")
        group = get_object_or_404(VideoGroup, pk=pk, user=request.user)
        action = request.POST.get("action")
        if action == "enable":
            # 現在の共有トークンを履歴として保存
            group.save_share_token_history()
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
            # 現在の共有トークンを履歴として保存
            group.save_share_token_history()
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

            # 共有元ユーザーのサブスクリプション状態をチェック
            if not group.user.is_subscribed:
                # 共有元ユーザーが無料プランの場合、共有URLを無効化
                group.share_token = None
                group.save()
                return JsonResponse({"error": "この共有URLは無効です。"}, status=403)

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
                search_service = OpenSearchService(openai_api_key=api_key, user_id=user.id)
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

            # 共有元ユーザーのサブスクリプション状態をチェック
            if not group.user.is_subscribed:
                # 共有元ユーザーが無料プランの場合、共有URLを無効化
                group.share_token = None
                group.save()
                return JsonResponse({"error": "この共有URLは無効です。"}, status=403)

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


class SubscriptionSuccessView(TemplateView):
    template_name = "app/subscription_success.html"

    def get(self, request, *args, **kwargs):
        if request.user.is_authenticated:
            # Webhookが来るまで少し待ってから同期処理を実行
            import time
            from app.stripe_service import StripeService
            from app.plan_utils import (
                get_plan_name_from_product_id,
                restore_user_sharing,
                disable_user_sharing,
                enforce_video_limit_for_plan,
            )

            # 最大10秒間、Webhookが来るまで待つ
            max_attempts = 10
            for attempt in range(max_attempts):
                try:
                    # StripeServiceの統一された同期処理を使用
                    stripe_service = StripeService()
                    plan_utils = type(
                        "PlanUtils",
                        (),
                        {
                            "get_plan_name_from_product_id": staticmethod(
                                get_plan_name_from_product_id
                            ),
                            "restore_user_sharing": staticmethod(restore_user_sharing),
                            "disable_user_sharing": staticmethod(disable_user_sharing),
                            "enforce_video_limit_for_plan": staticmethod(
                                enforce_video_limit_for_plan
                            ),
                        },
                    )()

                    result = stripe_service.sync_user_subscription(
                        request.user, plan_utils, logging
                    )

                    if result["status"] == "success" and result["synced"]:
                        messages.success(
                            request, "サブスクリプションが正常に開始されました。"
                        )
                        break
                    elif result["status"] == "success" and not result["synced"]:
                        messages.info(request, "サブスクリプション状況を確認しました。")
                        break
                    else:
                        print(f"=== Attempt {attempt + 1}: Sync failed, waiting... ===")
                        if attempt < max_attempts - 1:
                            time.sleep(1)  # 1秒待つ
                        else:
                            messages.warning(
                                request,
                                "サブスクリプション情報の確認に時間がかかっています。しばらくしてから再度確認してください。",
                            )
                except Exception as e:
                    print(f"=== Subscription success sync error: {e} ===")
                    if attempt < max_attempts - 1:
                        time.sleep(1)
                    else:
                        messages.warning(
                            request, "サブスクリプション状況の確認に失敗しました。"
                        )

            request.user.refresh_from_db()
        return super().get(request, *args, **kwargs)


class SubscriptionCancelView(TemplateView):
    template_name = "app/subscription_cancel.html"


class SubscriptionDowngradeSuccessView(LoginRequiredMixin, TemplateView):
    """無料プラン変更完了画面"""

    template_name = "app/subscription_downgrade_success.html"

    def get(self, request, *args, **kwargs):
        # 無料プラン変更完了時に同期処理を実行
        if request.user.stripe_customer_id:
            try:
                # StripeServiceの統一された同期処理を使用
                from app.stripe_service import StripeService
                from app.plan_utils import (
                    get_plan_name_from_product_id,
                    restore_user_sharing,
                    disable_user_sharing,
                    enforce_video_limit_for_plan,
                    log_subscription_change,
                    handle_plan_change,
                )

                stripe_service = StripeService()
                plan_utils = type(
                    "PlanUtils",
                    (),
                    {
                        "get_plan_name_from_product_id": staticmethod(
                            get_plan_name_from_product_id
                        ),
                        "restore_user_sharing": staticmethod(restore_user_sharing),
                        "disable_user_sharing": staticmethod(disable_user_sharing),
                        "enforce_video_limit_for_plan": staticmethod(
                            enforce_video_limit_for_plan
                        ),
                        "log_subscription_change": staticmethod(
                            log_subscription_change
                        ),
                        "handle_plan_change": staticmethod(handle_plan_change),
                    },
                )()

                result = stripe_service.sync_user_subscription(
                    request.user, plan_utils, logging
                )

                if result["status"] == "success" and result["synced"]:
                    messages.success(request, "無料プランへの変更が完了しました。")
                elif result["status"] == "success" and not result["synced"]:
                    messages.info(request, "プラン変更状況を確認しました。")
                else:
                    messages.warning(
                        request,
                        f"プラン変更状況の確認に失敗しました: {result['message']}",
                    )

            except Exception as e:
                print(f"=== Subscription downgrade sync error: {e} ===")
                messages.warning(request, "プラン変更状況の確認に失敗しました。")

            request.user.refresh_from_db()
        return super().get(request, *args, **kwargs)


class SubscriptionManagementView(LoginRequiredMixin, TemplateView):
    """サブスクリプション管理画面"""

    template_name = "app/subscription_management.html"

    def get_context_data(self, **kwargs):
        # サブスクリプション管理画面アクセス時にStripe同期を実行（特定ユーザーのみ）
        print(
            f"[DEBUG] SubscriptionManagementView.get_context_data called for user {self.request.user.id}"
        )
        print(
            f"[DEBUG] User stripe_customer_id: {self.request.user.stripe_customer_id}"
        )

        try:
            print(f"[DEBUG] Starting sync for user {self.request.user.id}")
            # 特定のユーザーのみ同期処理を実行
            from app.tasks import sync_specific_user_subscription

            task_result = sync_specific_user_subscription.delay(self.request.user.id)
            print(f"[DEBUG] Sync task queued with ID: {task_result.id}")

            # タスクの結果を待機（最大5秒）
            import time

            max_wait = 5
            for i in range(max_wait):
                if task_result.ready():
                    result = task_result.get()
                    print(f"[DEBUG] Sync task completed: {result}")
                    if result.get("status") == "success" and result.get("synced"):
                        messages.success(
                            self.request, "サブスクリプション状況を自動同期しました。"
                        )
                        logging.info(
                            f"Subscription management sync completed for user {self.request.user.id}"
                        )
                    elif result.get("status") == "success" and not result.get("synced"):
                        messages.info(
                            self.request,
                            "サブスクリプション状況に変更はありませんでした。",
                        )
                        logging.info(
                            f"No subscription changes for user {self.request.user.id}"
                        )
                    else:
                        messages.warning(
                            self.request,
                            f"同期処理で問題が発生しました: {result.get('message', 'Unknown error')}",
                        )
                        logging.warning(
                            f"Sync issue for user {self.request.user.id}: {result}"
                        )
                    break
                time.sleep(1)
            else:
                # タイムアウトの場合
                messages.info(
                    self.request, "同期処理を開始しました。しばらくお待ちください。"
                )
                logging.info(
                    f"Sync task started for user {self.request.user.id} (timeout)"
                )

        except Exception as e:
            print(f"[DEBUG] Sync error: {e}")
            messages.error(self.request, f"自動同期に失敗しました: {str(e)}")
            logging.error(
                f"Failed to sync subscription for user {self.request.user.id}: {e}"
            )

        context = super().get_context_data(**kwargs)
        context["is_subscribed"] = self.request.user.is_subscribed
        context["subscription_plan"] = self.request.user.subscription_plan
        context["PLAN_INFO"] = PLAN_INFO

        # Stripeからの詳細情報を取得
        subscription_info = None
        if self.request.user.stripe_customer_id:
            try:
                print(
                    f"Fetching subscription info for customer: {self.request.user.stripe_customer_id}"
                )

                # StripeServiceを使用してサブスクリプション情報を取得
                from app.stripe_service import StripeService

                stripe_service = StripeService()
                subscription = stripe_service.get_subscription(
                    self.request.user.stripe_customer_id
                )

                if subscription:
                    if isinstance(subscription, dict):
                        if "id" in subscription:
                            sub_id = subscription["id"]
                            print(f"Found subscription: {sub_id}")
                        else:
                            print("Subscription dictに'id'キーがありません（サブスクリプションが存在しないかエラー）")
                            sub_id = None
                    else:
                        sub_id = subscription.id
                        print(f"Found subscription: {sub_id}")

                    # 個別のサブスクリプションを直接取得して詳細情報を取得
                    try:
                        result = stripe_service.get_subscription_details(
                            subscription.id,
                            expand=["default_payment_method"],
                            logger=logging,
                        )
                        if result["status"] == "success":
                            detailed_subscription = result["subscription"]
                            print("Detailed subscription retrieved")
                            detailed_dict = detailed_subscription.to_dict()
                            print("Detailed subscription as dict:")
                            for key, value in detailed_dict.items():
                                if not key.startswith("_"):
                                    print(f"  {key}: {value}")
                        else:
                            print(
                                f"Error retrieving detailed subscription: {result['message']}"
                            )
                            detailed_dict = subscription.to_dict()
                    except Exception as retrieve_error:
                        print(
                            f"Error retrieving detailed subscription: {retrieve_error}"
                        )
                        detailed_dict = subscription.to_dict()

                    # 辞書形式でアクセスしてみる
                    subscription_dict = subscription.to_dict()
                    print("Subscription as dict:")
                    for key, value in subscription_dict.items():
                        if not key.startswith("_"):
                            print(f"  {key}: {value}")

                    # 安全にサブスクリプション情報を取得
                    try:
                        # Stripe公式ドキュメントに基づいて正確な日付情報を取得
                        # https://docs.stripe.com/api/subscriptions/object
                        created = detailed_dict.get("created")
                        cancel_at = detailed_dict.get("cancel_at")
                        billing_cycle_anchor = detailed_dict.get("billing_cycle_anchor")
                        cancel_at_period_end = detailed_dict.get(
                            "cancel_at_period_end", False
                        )

                        # Stripeオブジェクトから直接取得（公式ドキュメント準拠）
                        current_period_start_stripe = None
                        current_period_end_stripe = None

                        # 1. Subscriptionオブジェクトから直接取得を試行
                        if hasattr(detailed_subscription, "current_period_start"):
                            current_period_start_stripe = (
                                detailed_subscription.current_period_start
                            )
                            print(
                                f"Retrieved current_period_start from detailed_subscription: {current_period_start_stripe}"
                            )

                        if hasattr(detailed_subscription, "current_period_end"):
                            current_period_end_stripe = (
                                detailed_subscription.current_period_end
                            )
                            print(
                                f"Retrieved current_period_end from detailed_subscription: {current_period_end_stripe}"
                            )

                        # 2. フォールバック: 元のsubscriptionオブジェクトから取得
                        if not current_period_start_stripe and hasattr(
                            subscription, "current_period_start"
                        ):
                            current_period_start_stripe = (
                                subscription.current_period_start
                            )
                            print(
                                f"Retrieved current_period_start from subscription: {current_period_start_stripe}"
                            )

                        if not current_period_end_stripe and hasattr(
                            subscription, "current_period_end"
                        ):
                            current_period_end_stripe = subscription.current_period_end
                            print(
                                f"Retrieved current_period_end from subscription: {current_period_end_stripe}"
                            )

                        # 3. フォールバック: subscription_itemから取得
                        if (
                            not current_period_start_stripe
                            or not current_period_end_stripe
                        ):
                            items = detailed_dict.get("items", {}).get("data", [])
                            if items:
                                first_item = items[0]
                                if (
                                    not current_period_start_stripe
                                    and "current_period_start" in first_item
                                ):
                                    current_period_start_stripe = first_item[
                                        "current_period_start"
                                    ]
                                    print(
                                        f"Retrieved current_period_start from subscription_item: {current_period_start_stripe}"
                                    )

                                if (
                                    not current_period_end_stripe
                                    and "current_period_end" in first_item
                                ):
                                    current_period_end_stripe = first_item[
                                        "current_period_end"
                                    ]
                                    print(
                                        f"Retrieved current_period_end from subscription_item: {current_period_end_stripe}"
                                    )

                        # デバッグ情報を出力
                        print(f"Stripe subscription dates:")
                        print(f"  created: {created}")
                        print(f"  billing_cycle_anchor: {billing_cycle_anchor}")
                        print(
                            f"  current_period_start_stripe: {current_period_start_stripe}"
                        )
                        print(
                            f"  current_period_end_stripe: {current_period_end_stripe}"
                        )
                        print(f"  cancel_at: {cancel_at}")
                        print(f"  cancel_at_period_end: {cancel_at_period_end}")

                        # Stripeオブジェクトの属性を確認
                        print(f"Stripe object attributes:")
                        print(
                            f"  detailed_subscription.current_period_start: {getattr(detailed_subscription, 'current_period_start', 'Not found')}"
                        )
                        print(
                            f"  detailed_subscription.current_period_end: {getattr(detailed_subscription, 'current_period_end', 'Not found')}"
                        )
                        print(
                            f"  subscription.current_period_start: {getattr(subscription, 'current_period_start', 'Not found')}"
                        )
                        print(
                            f"  subscription.current_period_end: {getattr(subscription, 'current_period_end', 'Not found')}"
                        )

                        # subscription_itemの情報も確認
                        items = detailed_dict.get("items", {}).get("data", [])
                        if items:
                            first_item = items[0]
                            print(f"Subscription item attributes:")
                            print(
                                f"  subscription_item.current_period_start: {first_item.get('current_period_start', 'Not found')}"
                            )
                            print(
                                f"  subscription_item.current_period_end: {first_item.get('current_period_end', 'Not found')}"
                            )
                        else:
                            print("No subscription items found")

                        # 契約開始日: Stripeの正確な期間開始日を優先
                        current_period_start = (
                            current_period_start_stripe
                            or created
                            or billing_cycle_anchor
                        )

                        # 次回更新日: Stripeの正確な期間終了日を使用
                        if cancel_at_period_end and cancel_at:
                            current_period_end = cancel_at
                            print(f"Using cancel_at: {cancel_at}")
                        elif current_period_end_stripe:
                            # Stripeの正確な期間終了日を使用
                            current_period_end = current_period_end_stripe
                            print(
                                f"Using current_period_end_stripe: {current_period_end_stripe}"
                            )
                        elif current_period_start:
                            # フォールバック: 開始日から30日後
                            current_period_end = current_period_start + (
                                30 * 24 * 60 * 60
                            )  # 30日後
                            print(f"Using fallback calculation: {current_period_end}")
                        else:
                            current_period_end = None
                            print("No current_period_end calculated")

                        print(f"Final current_period_end: {current_period_end}")

                        # --- UTC aware datetimeに変換（Stripe公式ドキュメント準拠） ---
                        def to_utc_datetime(ts):
                            if ts is None:
                                return None
                            from datetime import datetime, timezone

                            dt = datetime.fromtimestamp(ts, tz=timezone.utc)
                            print(f"Converting timestamp {ts} to datetime: {dt}")
                            return dt

                        converted_start = to_utc_datetime(current_period_start)
                        converted_end = to_utc_datetime(current_period_end)

                        subscription_info = {
                            "id": detailed_dict.get("id"),
                            "status": detailed_dict.get("status"),
                            "current_period_start": converted_start,
                            "current_period_end": converted_end,
                            "cancel_at_period_end": cancel_at_period_end,
                        }
                        print(f"Subscription info created: {subscription_info}")
                    except Exception as attr_error:
                        print(f"Error accessing subscription attributes: {attr_error}")
                        # 基本的な情報のみ取得
                        subscription_info = {
                            "id": detailed_dict.get("id", "Unknown"),
                            "status": detailed_dict.get("status", "Unknown"),
                            "cancel_at_period_end": detailed_dict.get(
                                "cancel_at_period_end", False
                            ),
                        }
                else:
                    print("No active subscription found")
            except Exception as e:
                print(f"Error fetching subscription info: {e}")
                import traceback

                traceback.print_exc()
                pass

        context["subscription_info"] = subscription_info
        return context


@login_required
def sync_subscription_status(request):
    """手動でサブスクリプション状況を同期"""
    if request.method == "POST":
        try:
            # 特定のユーザーのみ同期処理を実行
            from app.tasks import sync_specific_user_subscription

            task_result = sync_specific_user_subscription.delay(request.user.id)

            # タスクの結果を待機（最大10秒）
            import time

            max_wait = 10
            for i in range(max_wait):
                if task_result.ready():
                    result = task_result.get()
                    if result.get("status") == "success" and result.get("synced"):
                        messages.success(
                            request, "サブスクリプション状況を同期しました。"
                        )
                    elif result.get("status") == "success" and not result.get("synced"):
                        messages.info(
                            request, "サブスクリプション状況に変更はありませんでした。"
                        )
                    else:
                        messages.warning(
                            request,
                            f"同期処理で問題が発生しました: {result.get('message', 'Unknown error')}",
                        )
                    break
                time.sleep(1)
            else:
                # タイムアウトの場合
                messages.info(
                    request, "同期処理を開始しました。しばらくお待ちください。"
                )

        except Exception as e:
            print(f"Error in sync_subscription_status: {str(e)}")
            messages.error(request, f"同期に失敗しました: {str(e)}")

        return redirect("app:subscription_management")

    return redirect("app:subscription_management")


@login_required
def cancel_subscription(request):
    """サブスクリプション解除"""
    if request.method == "POST":
        try:
            # StripeServiceの統一されたキャンセル処理を使用
            from app.stripe_service import StripeService

            stripe_service = StripeService()
            result = stripe_service.cancel_user_subscription(request.user, logging)

            if result["status"] == "success" and result["canceled"]:
                print(f"Subscription canceled successfully for user: {request.user.id}")
                # サブスクリプション解除完了画面に遷移（そこで同期処理を実行）
                return redirect("app:subscription_downgrade_success")
            elif result["status"] == "success" and not result["canceled"]:
                print(f"No active subscription found for user: {request.user.id}")
                messages.success(request, result["message"])
            else:
                print(f"Failed to cancel subscription for user: {request.user.id}")
                messages.warning(request, result["message"])

        except Exception as e:
            print(f"Error in cancel_subscription: {str(e)}")
            print(f"Error type: {type(e)}")
            import traceback

            traceback.print_exc()
            messages.error(request, f"サブスクリプション解除に失敗しました: {str(e)}")

        return redirect("app:subscription_management")

    return redirect("app:subscription_management")


class CommercialDisclosureView(TemplateView):
    """特定商取引法に基づく表記ページ"""

    template_name = "app/commercial_disclosure.html"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["PLAN_INFO"] = PLAN_INFO
        return context


class LoginView(AuthLoginView):
    """カスタムログインビュー - ログイン成功時にStripe同期を実行"""

    template_name = "app/login.html"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["PLAN_INFO"] = PLAN_INFO
        return context

    def form_valid(self, form):
        response = super().form_valid(form)
        return response


class TermsView(TemplateView):
    template_name = "app/terms.html"


class PrivacyView(TemplateView):
    template_name = "app/privacy.html"
