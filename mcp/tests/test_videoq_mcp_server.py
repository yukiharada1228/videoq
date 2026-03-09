import json
import os
import sys
import unittest
from unittest.mock import patch

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

    def test_tool_definitions_include_expected_tools(self):
        server = VideoQMcpServer()
        self.assertIn("list_videos", server.tools)
        self.assertIn("get_chat_history", server.tools)
        self.assertEqual(len(server.tools), 6)


if __name__ == "__main__":
    unittest.main()
