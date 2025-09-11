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
from django.db.models import Sum, Count, Q
import logging
from .exceptions import (
    VideoQException,
    VideoProcessingError,
    VectorSearchError,
    ValidationError,
)
from .utils import ErrorResponseHandler, log_operation, log_error

# Logger configuration
logger = logging.getLogger("app")


def health_check(request):
    """Health check endpoint"""
    return HttpResponse("OK", status=200)


class HomeView(LoginRequiredMixin, TemplateView):
    template_name = "app/home.html"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        # Get user's video groups (avoid N+1 with prefetch_related)
        video_groups = (
            VideoGroup.objects.filter(user=self.request.user)
            .prefetch_related("videos")
            .order_by("-created_at")
        )
        context["video_groups"] = video_groups

        # Recent videos (latest 5) - only visible videos
        recent_videos = (
            Video.get_visible_videos_for_user(self.request.user)
            .prefetch_related("tags")
            .order_by("-uploaded_at")[:5]
        )
        context["recent_videos"] = recent_videos

        # Statistics (visible videos only) - optimized with single query
        visible_videos = Video.get_visible_videos_for_user(self.request.user)
        video_stats = visible_videos.aggregate(
            total=Count("id"),
            completed=Count("id", filter=Q(status="completed")),
            pending=Count("id", filter=Q(status="pending")),
            processing=Count("id", filter=Q(status="processing")),
            error=Count("id", filter=Q(status="error")),
        )
        context["total_videos"] = video_stats["total"]
        context["completed_videos"] = video_stats["completed"]
        context["total_groups"] = video_groups.count()

        # Video limit/remaining count
        try:
            video_limit = self.request.user.get_video_limit()
        except Exception:
            video_limit = 0
        context["video_limit"] = video_limit
        context["video_remaining"] = max(0, video_limit - context["total_videos"])

        # Hide oldest videos if existing videos exceed limit
        if context["total_videos"] > video_limit:
            hidden_count = Video.check_and_hide_over_limit_videos(self.request.user)
            if hidden_count > 0:
                messages.info(
                    self.request,
                    f"Video limit ({video_limit} videos) exceeded, hid {hidden_count} old videos.",
                )
                # Re-fetch statistics
                visible_videos = Video.get_visible_videos_for_user(self.request.user)
                video_stats = visible_videos.aggregate(
                    total=Count("id"),
                    completed=Count("id", filter=Q(status="completed")),
                )
                context["total_videos"] = video_stats["total"]
                context["completed_videos"] = video_stats["completed"]
                context["video_remaining"] = max(
                    0, video_limit - context["total_videos"]
                )
        else:
            # Restore hidden videos if limit is relaxed
            restored_count = Video.restore_hidden_videos_if_under_limit(
                self.request.user
            )
            if restored_count > 0:
                messages.success(
                    self.request,
                    f"Video limit was relaxed, restored {restored_count} videos.",
                )
                # Re-fetch statistics
                visible_videos = Video.get_visible_videos_for_user(self.request.user)
                video_stats = visible_videos.aggregate(
                    total=Count("id"),
                    completed=Count("id", filter=Q(status="completed")),
                )
                context["total_videos"] = video_stats["total"]
                context["completed_videos"] = video_stats["completed"]
                context["video_remaining"] = max(
                    0, video_limit - context["total_videos"]
                )

        # API configuration status and onboarding information
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
        # Pass video upload size limit to template
        from django.conf import settings

        context["video_upload_max_size_mb"] = getattr(
            settings, "VIDEO_UPLOAD_MAX_SIZE_MB", 100
        )
        # Pass API configuration status to template
        context["api_key_configured"] = bool(self.request.user.encrypted_openai_api_key)
        # Add existing tags to context
        context["existing_tags"] = Tag.objects.filter(user=self.request.user).order_by(
            "name"
        )

        # Recent videos (latest 5) - only visible videos, avoid N+1 with prefetch_related
        context["recent_videos"] = (
            Video.get_visible_videos_for_user(self.request.user)
            .prefetch_related("tags")
            .order_by("-uploaded_at")[:5]
        )

        # Video limit information
        user = self.request.user
        current_total = Video.get_visible_videos_for_user(user).count()
        max_allowed = user.get_video_limit()
        context["user_video_limit"] = max_allowed
        context["user_video_count"] = current_total
        context["user_video_remaining"] = max(0, max_allowed - current_total)

        # Information when over limit
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
        # Execute normal save first
        response = super().form_valid(form)

        # Check limit after save and hide old videos if necessary
        # Exclude newly uploaded video
        hidden_count = Video.hide_oldest_videos_for_user(
            user, max_allowed, exclude_video_id=self.object.id
        )

        # Show message if videos were hidden
        if hidden_count > 0:
            messages.info(
                self.request,
                f"Video limit ({max_allowed} videos) exceeded, hid {hidden_count} old videos.",
            )
        else:
            # Restore hidden videos if there's room in the limit
            restored_count = Video.restore_hidden_videos_if_under_limit(user)
            if restored_count > 0:
                messages.success(
                    self.request,
                    f"Video limit has room, restored {restored_count} videos.",
                )

        # Start background processing
        process_video.delay(self.object.id)
        # Return JSON success for AJAX (no redirect)
        if self.request.headers.get("X-Requested-With") == "XMLHttpRequest":
            return JsonResponse({"success": True, "video_id": self.object.id})
        return response

    def form_invalid(self, form):
        # Return validation errors as JSON for AJAX (XHR) requests
        if self.request.headers.get("X-Requested-With") == "XMLHttpRequest":
            return JsonResponse({"success": False, "errors": form.errors}, status=400)
        return super().form_invalid(form)


class VideoDetailView(LoginRequiredMixin, DetailView):
    model = Video
    template_name = "app/video_detail.html"
    context_object_name = "video"

    def get_queryset(self):
        # Show only user's videos (avoid N+1 with prefetch_related)
        return Video.objects.filter(user=self.request.user).prefetch_related("tags")

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        video = self.get_object()

        # Get time from URL parameter
        jump_time = self.request.GET.get("time")
        if jump_time:
            try:
                context["jump_time"] = float(jump_time)
            except ValueError:
                context["jump_time"] = None
        else:
            context["jump_time"] = None

        # Removed context generation dependent on VideoFeature/VideoChunk
        # Unified design to get subtitles, features, chunks etc. from Pinecone
        return context


class VideoEditView(LoginRequiredMixin, UpdateView):
    """Video edit view"""

    model = Video
    form_class = VideoEditForm
    template_name = "app/video_edit.html"

    def get_queryset(self):
        # Only user's videos can be edited (avoid N+1 with prefetch_related)
        return Video.objects.filter(user=self.request.user).prefetch_related("tags")

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        # Add existing tags to context
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
    """Base class for video group chat functionality"""

    def validate_query(self, data):
        """Query validation"""
        query = data.get("query", "").strip()
        max_results = data.get("max_results", 5)

        if not query:
            return (
                None,
                None,
                JsonResponse({"error": "Please enter a search query"}, status=400),
            )

        return query, max_results, None

    def get_api_key(self, user):
        """Get and validate API key"""
        if not user.encrypted_openai_api_key:
            return None, JsonResponse(
                {
                    "error": "OpenAI API key is not registered. Please register it from the settings page."
                },
                status=400,
            )
        try:
            api_key = decrypt_api_key(user.encrypted_openai_api_key)
            return api_key, None
        except Exception:
            return None, JsonResponse(
                {"error": "Failed to decrypt API key. Please re-register."},
                status=400,
            )

    def perform_search(self, search_service, group, query, max_results):
        """Execute search"""
        try:
            return (
                search_service.generate_group_rag_answer(group, query, max_results),
                None,
            )
        except Exception as e:
            print(f"Group Vector error: {e}")
            return None, JsonResponse(
                {"error": "An error occurred during search"}, status=500
            )


@method_decorator(csrf_exempt, name="dispatch")
class VideoGroupChatView(LoginRequiredMixin, BaseVideoGroupChatView):
    """Chat search API for video groups"""

    def post(self, request, group_id):
        try:
            data = json.loads(request.body)

            # Query validation
            query, max_results, error_response = self.validate_query(data)
            if error_response:
                return error_response

            # Check group existence
            try:
                group = VideoGroup.objects.get(id=group_id, user=request.user)
            except VideoGroup.DoesNotExist:
                return JsonResponse(
                    {"error": "Video group not found"},
                    status=404,
                )

            # Get API key
            api_key, error_response = self.get_api_key(request.user)
            if error_response:
                return error_response

            # Execute search
            search_service = VectorSearchFactory.create_search_service(
                user_id=request.user.id, openai_api_key=api_key
            )
            results, error_response = self.perform_search(
                search_service, group, query, max_results
            )
            if error_response:
                return error_response

            # Save history (owner)
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
            return ErrorResponseHandler.create_error_response(
                message="Invalid JSON data",
                error_code="INVALID_JSON",
                status_code=400,
                user_message="Invalid JSON data",
            )
        except VideoQException as e:
            log_error(
                f"VideoQ error in group chat search: {e.message}",
                user_id=request.user.id,
                group_id=group_id,
            )
            return ErrorResponseHandler.handle_videoq_exception(e)
        except Exception as e:
            log_error(
                f"Unexpected error in group chat search: {str(e)}",
                user_id=request.user.id,
                group_id=group_id,
            )
            return ErrorResponseHandler.handle_general_exception(e)

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
        # Approximate size (bytes). JSON approximation based on string length is OK
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
        )  # Buffer for metadata

        # Quota: 10MB per account
        QUOTA_BYTES = 10 * 1024 * 1024
        current_total = (
            VideoGroupChatLog.objects.filter(owner=owner).aggregate(
                total=Sum("approx_size")
            )["total"]
            or 0
        )

        # Delete old ones to make space
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

        # Add
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
    """Streaming chat search API for video groups (SSE support)"""

    def post(self, request, group_id):
        try:
            data = json.loads(request.body)
            query = data.get("query", "").strip()
            max_results = data.get("max_results", 5)

            if not query:
                return JsonResponse(
                    {"error": "Please enter a search query"}, status=400
                )

            # Check group existence and get API key
            try:
                group = VideoGroup.objects.get(id=group_id, user=request.user)
            except VideoGroup.DoesNotExist:
                return JsonResponse(
                    {"error": "Video group not found"},
                    status=404,
                )

            # Get API key per user
            user = request.user
            if not user.encrypted_openai_api_key:
                return JsonResponse(
                    {
                        "error": "OpenAI API key is not registered. Please register it from the settings page."
                    },
                    status=400,
                )
            try:
                api_key = decrypt_api_key(user.encrypted_openai_api_key)
            except Exception:
                return JsonResponse(
                    {"error": "Failed to decrypt API key. Please re-register."},
                    status=400,
                )

            def generate_stream():
                try:
                    # Use vector search service
                    search_service = VectorSearchFactory.create_search_service(
                        user_id=user.id, openai_api_key=api_key
                    )
                    # Use streaming method
                    for chunk in search_service.generate_group_rag_answer_stream(
                        group, query, max_results
                    ):
                        if chunk["type"] == "content":
                            yield f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"
                        elif chunk["type"] == "complete":
                            # Save history (owner)
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
                        "message": f"An error occurred during streaming: {str(e)}",
                    }
                    yield f"data: {json.dumps(error_chunk, ensure_ascii=False)}\n\n"
                finally:
                    # Stream end
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
            return ErrorResponseHandler.create_error_response(
                message="Invalid JSON data",
                error_code="INVALID_JSON",
                status_code=400,
                user_message="Invalid JSON data",
            )
        except VideoQException as e:
            log_error(
                f"VideoQ error in group chat stream: {e.message}",
                user_id=request.user.id,
                group_id=group_id,
            )
            return ErrorResponseHandler.handle_videoq_exception(e)
        except Exception as e:
            log_error(
                f"Unexpected error in group chat stream: {str(e)}",
                user_id=request.user.id,
                group_id=group_id,
            )
            return ErrorResponseHandler.handle_general_exception(e)


class VideoDeleteView(LoginRequiredMixin, DeleteView):
    model = Video
    template_name = "app/delete_video.html"
    success_url = reverse_lazy("app:home")

    def get_queryset(self):
        # Only user's videos can be deleted
        return Video.objects.filter(user=self.request.user)

    def delete(self, request, *args, **kwargs):
        video = self.get_object()
        # Complete deletion using Video model's delete method (Pinecone + S3 + DB)
        return super().delete(request, *args, **kwargs)


class SignUpView(CreateView):
    form_class = SignUpForm
    success_url = reverse_lazy("app:signup_done")  # Login URL to be set later
    template_name = "app/signup.html"

    def dispatch(self, request, *args, **kwargs):
        # Return 404 if signup is disabled by environment variable
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
    """Video group list display"""

    model = VideoGroup
    template_name = "app/video_group_list.html"
    context_object_name = "video_groups"

    def get_queryset(self):
        return VideoGroup.objects.filter(user=self.request.user).prefetch_related(
            "videos", "videos__tags"
        )

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        # video_count property is automatically calculated, no need to set manually
        return context


class VideoListView(LoginRequiredMixin, ListView):
    """Video list display"""

    model = Video
    template_name = "app/video_list.html"
    context_object_name = "videos"
    paginate_by = 20  # 20 items per page for list format

    def get_queryset(self):
        # Show only user's visible videos (avoid N+1 with prefetch_related)
        queryset = Video.get_visible_videos_for_user(
            self.request.user
        ).prefetch_related("tags")

        # Search by tag
        tag_filter = self.request.GET.get("tag")
        if tag_filter:
            queryset = queryset.filter(tags__name=tag_filter)

        # Search by status
        status_filter = self.request.GET.get("status")
        if status_filter:
            queryset = queryset.filter(status=status_filter)

        # Sort by upload date in descending order
        return queryset.order_by("-uploaded_at")

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)

        # Add statistics (visible videos only) - optimized with single query
        user_videos = Video.get_visible_videos_for_user(self.request.user)
        video_stats = user_videos.aggregate(
            total=Count("id"),
            completed=Count("id", filter=Q(status="completed")),
            pending=Count("id", filter=Q(status="pending")),
            processing=Count("id", filter=Q(status="processing")),
            error=Count("id", filter=Q(status="error")),
        )
        context["total_videos"] = video_stats["total"]
        context["completed_videos"] = video_stats["completed"]
        context["pending_videos"] = video_stats["pending"]
        context["processing_videos"] = video_stats["processing"]
        context["error_videos"] = video_stats["error"]

        # Also show count of hidden videos
        hidden_videos = Video.objects.filter(
            user=self.request.user, is_visible=False
        ).count()
        context["hidden_videos"] = hidden_videos

        # Video limit information
        try:
            max_allowed = self.request.user.get_video_limit()
        except Exception:
            max_allowed = 0
        context["user_video_limit"] = max_allowed
        context["user_video_remaining"] = max(0, max_allowed - context["total_videos"])

        # Hide oldest videos if existing videos exceed limit
        if context["total_videos"] > max_allowed:
            hidden_count = Video.check_and_hide_over_limit_videos(self.request.user)
            if hidden_count > 0:
                messages.info(
                    self.request,
                    f"Video limit ({max_allowed} videos) exceeded, hid {hidden_count} old videos.",
                )
                # Re-fetch statistics
                user_videos = Video.get_visible_videos_for_user(self.request.user)
                video_stats = user_videos.aggregate(
                    total=Count("id"),
                    completed=Count("id", filter=Q(status="completed")),
                    pending=Count("id", filter=Q(status="pending")),
                    processing=Count("id", filter=Q(status="processing")),
                    error=Count("id", filter=Q(status="error")),
                )
                context["total_videos"] = video_stats["total"]
                context["completed_videos"] = video_stats["completed"]
                context["pending_videos"] = video_stats["pending"]
                context["processing_videos"] = video_stats["processing"]
                context["error_videos"] = video_stats["error"]
                context["user_video_remaining"] = max(
                    0, max_allowed - context["total_videos"]
                )
        else:
            # Restore hidden videos if limit is relaxed
            restored_count = Video.restore_hidden_videos_if_under_limit(
                self.request.user
            )
            if restored_count > 0:
                messages.success(
                    self.request,
                    f"Video limit was relaxed, restored {restored_count} videos.",
                )
                # Re-fetch statistics
                user_videos = Video.get_visible_videos_for_user(self.request.user)
                video_stats = user_videos.aggregate(
                    total=Count("id"),
                    completed=Count("id", filter=Q(status="completed")),
                    pending=Count("id", filter=Q(status="pending")),
                    processing=Count("id", filter=Q(status="processing")),
                    error=Count("id", filter=Q(status="error")),
                )
                context["total_videos"] = video_stats["total"]
                context["completed_videos"] = video_stats["completed"]
                context["pending_videos"] = video_stats["pending"]
                context["processing_videos"] = video_stats["processing"]
                context["error_videos"] = video_stats["error"]
                context["user_video_remaining"] = max(
                    0, max_allowed - context["total_videos"]
                )

        # Also add filtered result count
        filtered_videos = self.get_queryset()
        context["filtered_count"] = filtered_videos.count()

        # Add available tags
        context["available_tags"] = Tag.objects.filter(user=self.request.user).order_by(
            "name"
        )

        # Add current filter state
        context["current_tag"] = self.request.GET.get("tag", "")
        context["current_status"] = self.request.GET.get("status", "")

        return context


class VideoGroupCreateView(LoginRequiredMixin, CreateView):
    """Video group creation"""

    model = VideoGroup
    form_class = VideoGroupForm
    template_name = "app/video_group_create.html"
    success_url = reverse_lazy("app:video_group_list")

    def form_valid(self, form):
        form.instance.user = self.request.user
        return super().form_valid(form)


class BaseVideoGroupDetailView(DetailView):
    """Base class for video group detail display"""

    model = VideoGroup
    context_object_name = "group"

    def get_queryset(self):
        return VideoGroup.objects.prefetch_related("videos", "videos__tags")

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        group = self.get_object()
        # Get only completed visible videos
        completed_videos = group.completed_videos.order_by("title")
        context["completed_videos"] = completed_videos
        context["video_count"] = completed_videos.count()
        context["group_id"] = group.id

        # Also show count of hidden videos (for management)
        hidden_videos_count = group.all_completed_videos.filter(
            is_visible=False
        ).count()
        context["hidden_videos_count"] = hidden_videos_count

        return context


class VideoGroupDetailView(LoginRequiredMixin, BaseVideoGroupDetailView):
    """Video group detail display (for authenticated users)"""

    template_name = "app/video_group_detail.html"

    def get_queryset(self):
        return VideoGroup.objects.filter(user=self.request.user).prefetch_related(
            "videos", "videos__tags"
        )

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        # Add share URL (absolute path) to context
        if self.get_object().share_token:
            from django.urls import reverse

            share_url = reverse(
                "app:share_video_group", args=[self.get_object().share_token]
            )
            context["share_absolute_url"] = self.request.build_absolute_uri(share_url)

            # Get current access count
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

        # Addable videos (only visible completed videos)
        all_user_videos = Video.objects.filter(
            user=self.request.user, status="completed", is_visible=True
        ).prefetch_related("tags")
        # Get IDs of videos already included in the group
        group_video_ids = set(context["completed_videos"].values_list("id", flat=True))
        available_videos = [
            video for video in all_user_videos if video.id not in group_video_ids
        ]
        context["available_videos"] = available_videos
        # Existing tag list (for selection UI)
        context["available_tags"] = Tag.objects.filter(user=self.request.user).order_by(
            "name"
        )
        return context


class VideoGroupAddVideoView(LoginRequiredMixin, View):
    """Add video to video group"""

    def post(self, request, group_id):
        try:
            group = get_object_or_404(VideoGroup, id=group_id, user=request.user)
            video_id = request.POST.get("video_id")

            if not video_id:
                return JsonResponse({"error": "Video ID not specified"}, status=400)

            # Only target completed visible videos
            video = get_object_or_404(
                Video,
                id=video_id,
                user=request.user,
                status="completed",
                is_visible=True,
            )

            # Check if already added to group
            if VideoGroupMember.objects.filter(group=group, video=video).exists():
                return JsonResponse(
                    {"error": "This video is already added to the group"}, status=400
                )

            # Add video to group
            VideoGroupMember.objects.create(group=group, video=video)

            return JsonResponse(
                {
                    "success": True,
                    "message": f"Added video '{video.title}' to group '{group.name}'",
                }
            )

        except Exception as e:
            return JsonResponse({"error": str(e)}, status=500)


class VideoGroupRemoveVideoView(LoginRequiredMixin, View):
    """Remove video from video group"""

    def post(self, request, group_id, video_id):
        try:
            group = get_object_or_404(VideoGroup, id=group_id, user=request.user)
            video = get_object_or_404(Video, id=video_id, user=request.user)

            # Remove video from group
            VideoGroupMember.objects.filter(group=group, video=video).delete()

            return JsonResponse(
                {
                    "success": True,
                    "message": f"Removed video '{video.title}' from group '{group.name}'",
                }
            )

        except Exception as e:
            return JsonResponse({"error": str(e)}, status=500)


class VideoGroupAddByTagsView(LoginRequiredMixin, View):
    """Bulk add videos to group by tags (AND condition)"""

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
                    {"error": "Please specify at least one tag"}, status=400
                )

            # Get specified tags (user-owned)
            tags = list(Tag.objects.filter(user=request.user, name__in=tag_names))
            if len(tags) != len(set(tag_names)):
                missing = sorted(set(tag_names) - set(t.name for t in tags))
                return JsonResponse(
                    {"error": f"Non-existent tags: {', '.join(missing)}"}, status=400
                )

            # Extract videos with all specified tags (AND) from user's visible completed videos
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
                        "message": "No videos match the criteria",
                    }
                )

            # Bulk add excluding existing ones
            existing_ids = set(
                VideoGroupMember.objects.filter(group=group).values_list(
                    "video_id", flat=True
                )
            )
            to_add_ids = [vid for vid in candidate_ids if vid not in existing_ids]

            # Avoid N+1 with bulk create
            VideoGroupMember.objects.bulk_create(
                [VideoGroupMember(group=group, video_id=vid) for vid in to_add_ids]
            )

            return JsonResponse(
                {
                    "success": True,
                    "added": len(to_add_ids),
                    "total_matched": len(candidate_ids),
                    "message": f"Added {len(to_add_ids)} videos (matched {len(candidate_ids)} videos)",
                }
            )

        except Exception as e:
            return JsonResponse({"error": str(e)}, status=500)


class VideoGroupDeleteView(LoginRequiredMixin, DeleteView):
    model = VideoGroup
    template_name = "app/delete_video_group.html"
    success_url = reverse_lazy("app:video_group_list")

    def get_queryset(self):
        # Only user's groups can be deleted
        return VideoGroup.objects.filter(user=self.request.user)


# For encryption
def get_fernet():
    # Hash SECRET_KEY to 32 bytes for Fernet key
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
    """Video reprocessing view"""

    def post(self, request, video_id):
        try:
            # Only user's videos can be reprocessed
            video = get_object_or_404(Video, id=video_id, user=request.user)

            # Execute video reprocessing
            process_video.delay(video.id)

            return JsonResponse(
                {"success": True, "message": "Video reprocessing started."}
            )
        except Exception as e:
            return JsonResponse(
                {"success": False, "error": f"Failed to start reprocessing: {str(e)}"},
                status=500,
            )


class OpenAIKeyUpdateView(LoginRequiredMixin, FormView):
    template_name = "app/openai_key_form.html"
    form_class = OpenAIKeyForm
    success_url = "/"  # Redirect to my page etc. recommended

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
        messages.success(self.request, "OpenAI API key saved.")

        # Check if there are error state videos
        error_videos = Video.objects.filter(user=user, status="error")
        if error_videos.exists():
            messages.info(
                self.request,
                f"There are {error_videos.count()} videos in error state. You can reprocess them from the video list.",
            )

        return redirect(self.get_success_url())


class ShareVideoGroupView(BaseVideoGroupDetailView):
    """View video group from sharing URL (read-only)"""

    template_name = "app/share_video_group_detail.html"
    slug_field = "share_token"
    slug_url_kwarg = "share_token"

    def get_queryset(self):
        # Only groups with share_token set (avoid N+1 with prefetch_related)
        return VideoGroup.objects.exclude(share_token__isnull=True).prefetch_related(
            "videos", "videos__tags"
        )

    def get(self, request, *args, **kwargs):
        return super().get(request, *args, **kwargs)

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)

        # Get current access count
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
    """Video group share URL generation and deactivation"""

    def post(self, request, pk):
        group = get_object_or_404(VideoGroup, pk=pk, user=request.user)
        action = request.POST.get("action")
        if action == "enable":
            # Generate token
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
        return JsonResponse({"success": False, "error": "Invalid action"}, status=400)


@method_decorator(csrf_exempt, name="dispatch")
class ShareVideoGroupChatView(BaseVideoGroupChatView):
    """Shared video group chat API (no authentication required, uses share owner's API key)"""

    def post(self, request, share_token):
        try:
            data = json.loads(request.body)

            # Query validation
            query, max_results, error_response = self.validate_query(data)
            if error_response:
                return error_response

            # Identify group
            try:
                group = VideoGroup.objects.get(share_token=share_token)
            except VideoGroup.DoesNotExist:
                return JsonResponse({"error": "Video group not found"}, status=404)

            # Session management
            from .share_access_service import ShareAccessService

            access_service = ShareAccessService()
            session_id = request.headers.get("X-Share-Session-ID")

            if session_id:
                # Update session activity
                if not access_service.update_session_activity(share_token, session_id):
                    return JsonResponse(
                        {"error": "Session has expired. Please refresh the page."},
                        status=401,
                    )

            # Get share owner's API key
            user = group.user
            if not user.encrypted_openai_api_key:
                return JsonResponse(
                    {"error": "OpenAI API key is not registered."}, status=400
                )
            try:
                api_key = decrypt_api_key(user.encrypted_openai_api_key)
            except Exception:
                return JsonResponse({"error": "Failed to decrypt API key."}, status=400)

            # Use vector search service
            try:
                search_service = VectorSearchFactory.create_search_service(
                    user_id=user.id, openai_api_key=api_key
                )
                results = search_service.generate_group_rag_answer(
                    group, query, max_results
                )
            except Exception as e:
                return JsonResponse({"error": str(e)}, status=500)

            # Save history (shared)
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
    """Shared video group streaming chat API (SSE support)"""

    def post(self, request, share_token):
        try:
            data = json.loads(request.body)
            query = data.get("query", "").strip()
            max_results = data.get("max_results", 5)

            if not query:
                return JsonResponse(
                    {"error": "Please enter a search query"}, status=400
                )

            # Identify group
            try:
                group = VideoGroup.objects.get(share_token=share_token)
            except VideoGroup.DoesNotExist:
                return JsonResponse({"error": "Video group not found"}, status=404)

            # Session management
            from .share_access_service import ShareAccessService

            access_service = ShareAccessService()
            session_id = request.headers.get("X-Share-Session-ID")

            if session_id:
                # Update session activity
                if not access_service.update_session_activity(share_token, session_id):
                    return JsonResponse(
                        {"error": "Session has expired. Please refresh the page."},
                        status=401,
                    )

            # Get share owner's API key
            user = group.user
            if not user.encrypted_openai_api_key:
                return JsonResponse(
                    {"error": "OpenAI API key is not registered."}, status=400
                )
            try:
                api_key = decrypt_api_key(user.encrypted_openai_api_key)
            except Exception:
                return JsonResponse({"error": "Failed to decrypt API key."}, status=400)

            def generate_stream():
                try:
                    # Use vector search service
                    search_service = VectorSearchFactory.create_search_service(
                        user_id=group.user.id, openai_api_key=api_key
                    )
                    # Use streaming method
                    for chunk in search_service.generate_group_rag_answer_stream(
                        group, query, max_results
                    ):
                        if chunk["type"] == "content":
                            yield f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"
                        elif chunk["type"] == "complete":
                            # Save history (shared)
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
                        "message": f"An error occurred during streaming: {str(e)}",
                    }
                    yield f"data: {json.dumps(error_chunk, ensure_ascii=False)}\n\n"
                finally:
                    # Stream end
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
            return JsonResponse({"error": "Invalid JSON data"}, status=400)
        except Exception as e:
            print(f"Share group chat stream error: {e}")
            return JsonResponse(
                {"error": f"An error occurred during streaming: {str(e)}"},
                status=500,
            )


class VideoGroupChatLogListView(LoginRequiredMixin, View):
    """Return video group chat history (JSON) (owner only)"""

    def get(self, request, group_id):
        try:
            group = VideoGroup.objects.get(id=group_id, user=request.user)
        except VideoGroup.DoesNotExist:
            return JsonResponse({"error": "Video group not found"}, status=404)

        try:
            limit = int(request.GET.get("limit", "100"))
            limit = max(1, min(limit, 500))
        except Exception:
            limit = 100

        # Pre-fetch group information with select_related to avoid N+1
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
    """Custom login view"""

    template_name = "app/login.html"


class TermsView(TemplateView):
    template_name = "app/terms.html"


class PrivacyView(TemplateView):
    template_name = "app/privacy.html"


def protected_media(request, path):
    share_token = request.GET.get("share_token")
    user_authenticated = request.user.is_authenticated

    # 1. Allow logged-in users
    if user_authenticated:
        pass
    # 2. Allow if share_token is valid
    elif share_token:
        from app.models import Video, VideoGroup

        try:
            filename = os.path.basename(path)
            video = Video.objects.get(file__endswith=filename)
            if VideoGroup.objects.filter(
                share_token=share_token, videos=video
            ).exists():
                pass  # Allow
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
        # Filter parameters
        group_id = self.request.GET.get("group_id")
        source = self.request.GET.get("source")
        query = (self.request.GET.get("q") or "").strip()
        page = int(self.request.GET.get("page", "1") or 1)
        per_page = int(self.request.GET.get("per_page", "20") or 20)
        per_page = max(5, min(per_page, 100))

        # Date range filter
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

        # Make naive datetime aware with default timezone (UTC)
        if start_dt and timezone.is_naive(start_dt):
            start_dt = timezone.make_aware(start_dt)
        if end_dt and timezone.is_naive(end_dt):
            end_dt = timezone.make_aware(end_dt)

        # Target group list (owner's groups)
        user_groups = VideoGroup.objects.filter(user=self.request.user).order_by(
            "-created_at"
        )
        logs_qs = (
            VideoGroupChatLog.objects.filter(owner=self.request.user)
            .select_related("group")
            .order_by("-created_at")
        )

        # Keyword search (for questions and answers)
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

        # Format datetime-local initial value (up to minutes in local time)
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
    """Delete single chat history (owner only)"""

    def post(self, request, log_id):
        log = get_object_or_404(VideoGroupChatLog, id=log_id, owner=request.user)
        log.delete()
        try:
            messages.success(request, "Chat history deleted.")
        except Exception:
            pass
        redirect_url = request.META.get("HTTP_REFERER") or reverse_lazy(
            "app:chat_logs_dashboard"
        )
        return redirect(redirect_url)


class ChatLogBulkDeleteView(LoginRequiredMixin, View):
    """Bulk delete chat history (matching dashboard display conditions, owner only)"""

    def post(self, request):
        from django.db.models import Q
        from django.utils.dateparse import parse_date, parse_datetime
        import datetime as _dt

        logs_qs = VideoGroupChatLog.objects.filter(owner=request.user)

        group_id = request.POST.get("group_id")
        source = request.POST.get("source")
        query = (request.POST.get("q") or "").strip()

        # Date range conditions
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

        # Group conditions
        if group_id:
            try:
                group = VideoGroup.objects.get(id=int(group_id), user=request.user)
                logs_qs = logs_qs.filter(group=group)
            except Exception:
                pass

        # Source conditions
        if source in ("owner", "share"):
            logs_qs = logs_qs.filter(source=source)

        # Keyword conditions
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
            messages.success(request, f"Deleted {delete_count} chat history records.")
        except Exception:
            pass

        redirect_url = request.META.get("HTTP_REFERER") or reverse_lazy(
            "app:chat_logs_dashboard"
        )
        return redirect(redirect_url)


class ChatLogExportView(LoginRequiredMixin, View):
    """Export chat history (CSV/JSONL). Apply same filters as dashboard."""

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
                # Format for LLM SFT: {"messages": [{"role": "user", "content": "question"}, {"role": "assistant", "content": "answer"}]}
                obj = {
                    "messages": [
                        {"role": "user", "content": log.question or ""},
                        {"role": "assistant", "content": log.answer or ""},
                    ]
                }
                resp.write(json.dumps(obj, ensure_ascii=False) + "\n")
            return resp

        # CSV output
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


# Tag management related views
class TagManagementView(LoginRequiredMixin, ListView):
    """Tag management screen"""

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
        # Reuse query to avoid N+1
        queryset = self.get_queryset()
        context["total_tags"] = queryset.count()
        context["total_videos_with_tags"] = (
            Video.objects.filter(user=self.request.user, tags__isnull=False)
            .distinct()
            .count()
        )
        return context


class TagCreateView(LoginRequiredMixin, CreateView):
    """Tag creation screen"""

    model = Tag
    template_name = "app/tag_form.html"
    form_class = TagForm
    success_url = reverse_lazy("app:tag_management")

    def form_valid(self, form):
        form.instance.user = self.request.user
        messages.success(self.request, f"Created tag '{form.instance.name}'.")
        return super().form_valid(form)

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["title"] = "Create New Tag"
        context["submit_text"] = "Create"
        return context


class TagEditView(LoginRequiredMixin, UpdateView):
    """Tag edit screen"""

    model = Tag
    template_name = "app/tag_form.html"
    form_class = TagForm
    success_url = reverse_lazy("app:tag_management")

    def get_queryset(self):
        return Tag.objects.filter(user=self.request.user)

    def form_valid(self, form):
        messages.success(self.request, f"Updated tag '{form.instance.name}'.")
        return super().form_valid(form)

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["title"] = "Edit Tag"
        context["submit_text"] = "Update"
        return context


class TagDeleteView(LoginRequiredMixin, DeleteView):
    """Tag deletion screen"""

    model = Tag
    template_name = "app/tag_confirm_delete.html"
    success_url = reverse_lazy("app:tag_management")

    def get_queryset(self):
        return Tag.objects.filter(user=self.request.user)

    def delete(self, request, *args, **kwargs):
        tag = self.get_object()
        messages.success(request, f"Deleted tag '{tag.name}'.")
        return super().delete(request, *args, **kwargs)
