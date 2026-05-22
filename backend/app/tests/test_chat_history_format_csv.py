"""TDD tests for GET /chat/history/?download=csv endpoint.

Issue #459: /export/ エンドポイントをクエリパラメータに変更する
- GET /api/chat/history/?download=csv&group_id=1 → CSV response
- GET /api/chat/history/?group_id=1              → JSON response (unchanged)
"""

import unittest
from unittest.mock import MagicMock

from django.test import RequestFactory
from rest_framework.request import Request


def _make_drf_request(params):
    """Build a DRF Request with an authenticated user, bypassing auth middleware."""
    # group_id is now a URL path param, not a query param
    query_params = {k: v for k, v in params.items() if k != "group_id"}
    django_request = RequestFactory().get("/chat/groups/1/history/", query_params)
    drf_request = Request(django_request)
    user = MagicMock()
    user.id = 1
    user.is_authenticated = True
    drf_request._user = user  # set private attr to skip authenticator pipeline
    return drf_request


def _make_export_use_case(group_id=42):
    use_case = MagicMock()
    use_case.execute.return_value = (group_id, iter([]))
    return use_case


def _make_history_use_case():
    use_case = MagicMock()
    use_case.execute.return_value = []
    return use_case


def _call_get(view_class, use_cases, params):
    """Instantiate view, inject use cases, and call get() directly."""
    instance = view_class()
    for attr, val in use_cases.items():
        setattr(instance, attr, val)
    instance.kwargs = {}
    group_id_str = params.get("group_id")
    group_id = int(group_id_str) if group_id_str is not None else None
    return instance.get(_make_drf_request(params), group_id=group_id)


class ChatHistoryDownloadCsvTests(unittest.TestCase):
    """ChatHistoryView handles ?download=csv to return CSV export."""

    def test_download_csv_returns_200(self):
        from app.presentation.chat.views import ChatGroupHistoryView as ChatHistoryView

        response = _call_get(
            ChatHistoryView,
            {
                "chat_history_use_case": _make_history_use_case(),
                "export_history_use_case": _make_export_use_case(),
            },
            {"group_id": "42", "download": "csv"},
        )
        self.assertEqual(response.status_code, 200)

    def test_download_csv_content_type_is_text_csv(self):
        from app.presentation.chat.views import ChatGroupHistoryView as ChatHistoryView

        response = _call_get(
            ChatHistoryView,
            {
                "chat_history_use_case": _make_history_use_case(),
                "export_history_use_case": _make_export_use_case(),
            },
            {"group_id": "42", "download": "csv"},
        )
        self.assertIn("text/csv", response.get("Content-Type", ""))

    def test_download_csv_content_disposition_contains_filename(self):
        from app.presentation.chat.views import ChatGroupHistoryView as ChatHistoryView

        response = _call_get(
            ChatHistoryView,
            {
                "chat_history_use_case": _make_history_use_case(),
                "export_history_use_case": _make_export_use_case(group_id=42),
            },
            {"group_id": "42", "download": "csv"},
        )
        self.assertIn("chat_history_group_42.csv", response.get("Content-Disposition", ""))

    def test_download_csv_calls_export_use_case_not_history_use_case(self):
        from app.presentation.chat.views import ChatGroupHistoryView as ChatHistoryView

        history_uc = _make_history_use_case()
        export_uc = _make_export_use_case()
        _call_get(
            ChatHistoryView,
            {
                "chat_history_use_case": history_uc,
                "export_history_use_case": export_uc,
            },
            {"group_id": "42", "download": "csv"},
        )
        export_uc.execute.assert_called_once_with(group_id=42, user_id=1)
        history_uc.execute.assert_not_called()

    def test_no_download_param_returns_json(self):
        from app.presentation.chat.views import ChatGroupHistoryView as ChatHistoryView

        history_uc = _make_history_use_case()
        response = _call_get(
            ChatHistoryView,
            {
                "chat_history_use_case": history_uc,
                "export_history_use_case": _make_export_use_case(),
            },
            {"group_id": "42"},
        )
        self.assertEqual(response.status_code, 200)
        history_uc.execute.assert_called_once()

    def test_download_csv_with_group_id_calls_export_use_case(self):
        from app.presentation.chat.views import ChatGroupHistoryView as ChatHistoryView

        export_uc = _make_export_use_case(group_id=99)
        _call_get(
            ChatHistoryView,
            {
                "chat_history_use_case": _make_history_use_case(),
                "export_history_use_case": export_uc,
            },
            {"group_id": "99", "download": "csv"},
        )
        export_uc.execute.assert_called_once_with(group_id=99, user_id=1)


class ChatHistoryDownloadCsvDispatchTests(unittest.TestCase):
    """Ensure ?download=csv works through DRF's full dispatch pipeline (not just get())."""

    def _make_view_and_request(self, params):
        from rest_framework.test import APIRequestFactory, force_authenticate
        from app.presentation.chat.views import ChatGroupHistoryView

        export_uc = _make_export_use_case()
        view = ChatGroupHistoryView.as_view(
            chat_history_use_case=_make_history_use_case(),
            export_history_use_case=export_uc,
        )
        factory = APIRequestFactory()
        group_id = int(params.pop("group_id", "1"))
        req = factory.get(f"/chat/groups/{group_id}/history/", params, HTTP_ACCEPT="application/json")
        user = MagicMock()
        user.id = 1
        user.is_authenticated = True
        force_authenticate(req, user=user)
        return view, req, export_uc, group_id

    def test_dispatch_download_csv_returns_200(self):
        view, req, _, group_id = self._make_view_and_request({"group_id": "1", "download": "csv"})
        resp = view(req, group_id=group_id)
        self.assertEqual(resp.status_code, 200)

    def test_dispatch_download_csv_content_type_is_text_csv(self):
        view, req, _, group_id = self._make_view_and_request({"group_id": "1", "download": "csv"})
        resp = view(req, group_id=group_id)
        self.assertIn("text/csv", resp.get("Content-Type", ""))

    def test_dispatch_no_download_returns_json(self):
        view, req, _, group_id = self._make_view_and_request({"group_id": "1"})
        resp = view(req, group_id=group_id)
        self.assertEqual(resp.status_code, 200)
        self.assertIn("application/json", getattr(resp, "accepted_media_type", ""))


class ChatHistoryExportViewRemovedTests(unittest.TestCase):
    """ChatHistoryExportView must no longer exist in views module."""

    def test_chat_history_export_view_not_exported(self):
        import app.presentation.chat.views as views_module

        self.assertFalse(
            hasattr(views_module, "ChatHistoryExportView"),
            "ChatHistoryExportView should be removed from views.py",
        )


if __name__ == "__main__":
    unittest.main()
