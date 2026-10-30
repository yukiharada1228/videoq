import json
import unittest
from unittest.mock import MagicMock, patch
from types import SimpleNamespace
from openrouter_runtime_diagnostics import summarize_logs, diagnose


class DiagnosticsTests(unittest.TestCase):
    def test_no_raw_logs_or_content_are_returned(self):
        result = summarize_logs([{"message": "JWT PRIVATE_SECRET transcription\nRuntimeError: OpenRouter workload identity exchange rejected PRIVATE_CONTENT"}])
        self.assertEqual(result["markers"]["OpenRouter workload identity exchange rejected"], 1)
        self.assertEqual(result["exceptionTypes"], {"RuntimeError": 1})
        self.assertNotIn("PRIVATE", json.dumps(result))

    def test_config_and_sdk_errors_are_redacted(self):
        session, client = MagicMock(), MagicMock()
        session.client.return_value = client
        client.get_function_configuration.return_value = {"State": "Active", "Environment": {"Variables": {"OPENAI_API_KEY": "PRIVATE", "DATABASE_URL": "PRIVATE", "WHISPER_BACKEND": "openrouter"}}}
        client.get_queue_url.side_effect = RuntimeError("PRIVATE")
        client.get_paginator.return_value.paginate.return_value = []
        with patch.dict("sys.modules", {"botocore.config": SimpleNamespace(Config=lambda **kw: kw)}):
            result = diagnose(session, "ap-northeast-1")
        self.assertEqual(result["worker"]["config"], {"WHISPER_BACKEND": "openrouter"})
        self.assertEqual(result["queue"], {"errorType": "RuntimeError"})
        self.assertNotIn("PRIVATE", json.dumps(result))
        self.assertTrue(result["readOnly"])
        client.get_paginator.assert_called_once_with("filter_log_events")


if __name__ == "__main__":
    unittest.main()
