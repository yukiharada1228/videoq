import json
import os
import sys
import unittest
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from videoq_mcp_server import VideoQApiClient, VideoQMcpServer


class _FakeResponse:
    def __init__(self, payload):
        self.payload = payload

    def read(self):
        return json.dumps(self.payload).encode("utf-8")

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


class VideoQApiClientTests(unittest.TestCase):
    def test_base_url_normalization_appends_api(self):
        client = VideoQApiClient(base_url="http://localhost", api_key="vq_test", timeout_seconds=5)
        self.assertEqual(client.base_url, "http://localhost/api")

    @patch("videoq_mcp_server.request.urlopen")
    def test_get_sends_x_api_key_and_query(self, mock_urlopen):
        mock_urlopen.return_value = _FakeResponse([{"id": 1}])
        client = VideoQApiClient(base_url="http://localhost/api", api_key="vq_test", timeout_seconds=5)

        result = client.get("/videos/", query={"q": "demo", "tags": "1,2"})

        self.assertEqual(result, [{"id": 1}])
        req = mock_urlopen.call_args.args[0]
        self.assertEqual(req.headers["X-api-key"], "vq_test")
        self.assertIn("q=demo", req.full_url)
        self.assertIn("tags=1%2C2", req.full_url)


class VideoQMcpServerTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(
            os.environ,
            {
                "VIDEOQ_API_KEY": "vq_test",
                "VIDEOQ_BASE_URL": "http://localhost/api",
            },
            clear=False,
        )
        self.env.start()
        self.addCleanup(self.env.stop)
        self.server = VideoQMcpServer()
        self.server.api = MagicMock()

    def test_tool_definitions_include_expected_tools(self):
        expected = {
            "list_videos",
            "get_video",
            "list_groups",
            "get_group",
            "list_tags",
            "get_chat_history",
            "get_chat_analytics",
            "get_chat_analytics_keywords",
            "get_evaluation_summary",
            "list_evaluation_logs",
        }
        self.assertEqual(set(self.server.tools), expected)

    def test_list_videos_forwards_pagination_and_returns_envelope(self):
        self.server.api.get.return_value = {
            "count": 42,
            "next": "http://x/?offset=20",
            "previous": None,
            "results": [{"id": 1}],
        }

        result = self.server._list_videos({"limit": 10, "offset": 20, "tags": [3, 4]})

        self.server.api.get.assert_called_once()
        call = self.server.api.get.call_args
        self.assertEqual(call.args[0], "/videos/")
        query = call.kwargs["query"]
        self.assertEqual(query["limit"], 10)
        self.assertEqual(query["offset"], 20)
        self.assertEqual(query["tags"], "3,4")
        self.assertEqual(
            result,
            {
                "count": 42,
                "next": "http://x/?offset=20",
                "previous": None,
                "videos": [{"id": 1}],
            },
        )

    def test_get_chat_history_paginates(self):
        self.server.api.get.return_value = {
            "count": 5,
            "next": None,
            "previous": None,
            "results": [{"id": 1, "feedback": "good"}],
        }

        result = self.server._get_chat_history({"group_id": 7, "limit": 50})

        self.server.api.get.assert_called_once_with(
            "/chat/groups/7/history/",
            query={"limit": 50},
        )
        self.assertEqual(result["history"], [{"id": 1, "feedback": "good"}])
        self.assertEqual(result["count"], 5)

    def test_get_chat_analytics_returns_payload(self):
        payload = {
            "summary": {"total_questions": 12, "date_range": {"first": "2026-01-01", "last": "2026-06-01"}},
            "time_series": [{"date": "2026-06-01", "count": 3}],
            "feedback": {"good": 5, "bad": 1, "none": 6},
        }
        self.server.api.get.return_value = payload

        result = self.server._get_chat_analytics({"group_id": 3})

        self.server.api.get.assert_called_once_with("/chat/groups/3/analytics/")
        self.assertEqual(result, {"analytics": payload})

    def test_get_chat_analytics_keywords_returns_list(self):
        self.server.api.get.return_value = {"keywords": [{"word": "deploy", "count": 4}]}

        result = self.server._get_chat_analytics_keywords({"group_id": 9})

        self.server.api.get.assert_called_once_with("/chat/groups/9/analytics/keywords/")
        self.assertEqual(result, {"keywords": [{"word": "deploy", "count": 4}]})

    def test_get_evaluation_summary_returns_payload(self):
        payload = {
            "group_id": 11,
            "evaluated_count": 8,
            "avg_faithfulness": 0.91,
            "avg_answer_relevancy": 0.84,
            "avg_context_precision": 0.77,
        }
        self.server.api.get.return_value = payload

        result = self.server._get_evaluation_summary({"group_id": 11})

        self.server.api.get.assert_called_once_with("/evaluation/groups/11/summary/")
        self.assertEqual(result, {"summary": payload})

    def test_list_evaluation_logs_paginates(self):
        self.server.api.get.return_value = {
            "count": 2,
            "next": None,
            "previous": None,
            "results": [
                {"chat_log_id": 1, "status": "succeeded", "faithfulness": 0.9},
            ],
        }

        result = self.server._list_evaluation_logs({"group_id": 4, "limit": 5, "offset": 0})

        self.server.api.get.assert_called_once_with(
            "/evaluation/groups/4/logs/",
            query={"limit": 5, "offset": 0},
        )
        self.assertEqual(result["count"], 2)
        self.assertEqual(result["logs"][0]["chat_log_id"], 1)

    def test_list_groups_without_pagination_args_sends_empty_query(self):
        self.server.api.get.return_value = {"count": 0, "next": None, "previous": None, "results": []}

        result = self.server._list_groups({})

        self.server.api.get.assert_called_once_with("/videos/groups/", query={})
        self.assertEqual(result, {"count": 0, "next": None, "previous": None, "groups": []})


if __name__ == "__main__":
    unittest.main()
