import json
import unittest
from unittest.mock import MagicMock, patch
from audit_ai_credentials import audit, PROJECT_ID, router_configuration, selected_presence


class AuditTests(unittest.TestCase):
    def test_inventory_redacts_ssm_and_cloudflare_values_and_provider_metadata(self):
        session, client = MagicMock(), MagicMock()
        session.client.return_value = client
        client.get_parameter.return_value = {"Parameter": {"Value": json.dumps({"OPENAI_API_KEY": "PRIVATE", "R2_SECRET_ACCESS_KEY": "PRIVATE"}), "Version": 3}}
        client.get_function_configuration.return_value = {"Environment": {"Variables": {"OPENROUTER_FEDERATION_POLICY_ID": "policy", "OPENAI_BASE_URL": "https://openrouter.ai/api/v1"}}}
        responses = [{"success": True, "result": {"bindings": [{"name": "OPENAI_API_KEY", "type": "secret_text", "text": "PRIVATE"}, {"name": "BETTER_AUTH_SECRET", "type": "secret_text", "text": "PRIVATE"}]}},
                     {"id": PROJECT_ID, "name": "videoq-prod"}, {"data": [{"id": "key_abc", "name": "PRIVATE", "redacted_value": "PRIVATE"}], "has_more": False}]
        with patch("audit_ai_credentials.api_json", side_effect=responses):
            result = audit(session, {"CLOUDFLARE_ACCOUNT_ID": "a"*32, "CLOUDFLARE_API_TOKEN": "PRIVATE", "OPENAI_ADMIN_KEY": "PRIVATE"})
        self.assertNotIn("PRIVATE", json.dumps(result))
        self.assertTrue(result["workerSecretCopies"]["present"]["OPENAI_API_KEY"])
        self.assertTrue(result["api"]["secretCopies"]["OPENAI_API_KEY"])
        self.assertEqual(result["openaiProject"]["keyIds"], ["key_abc"])
        self.assertTrue(result["readOnly"])

    def test_errors_never_expose_secrets_and_unrelated_project_is_not_inventoried(self):
        session = MagicMock()
        session.client.side_effect = RuntimeError("PRIVATE")
        with patch("audit_ai_credentials.api_json", return_value={"id": "other", "name": "other"}) as request:
            result = audit(session, {"OPENAI_ADMIN_KEY": "PRIVATE"})
        self.assertNotIn("PRIVATE", json.dumps(result))
        self.assertEqual(result["openaiProject"], {"errorType": "ValueError"})
        self.assertEqual(request.call_count, 1)

    def test_workflow_retains_main_and_environment_gates_without_artifacts(self):
        from pathlib import Path
        source = (Path(__file__).resolve().parents[2] / ".github/workflows/ai-credential-audit.yml").read_text()
        self.assertIn("github.ref == 'refs/heads/main'", source)
        self.assertIn("environment: production-infra", source)
        self.assertIn("persist-credentials: false", source)
        self.assertNotIn("upload-artifact", source)
        self.assertNotIn("pull_request_target", source)
        self.assertNotIn("contents: write", source)
        self.assertLess(source.index("Install AWS SDK"), source.index("aws-actions/configure-aws-credentials"))

    def test_router_override_is_visible_without_printing_its_url(self):
        result = router_configuration({"OPENROUTER_FEDERATION_POLICY_ID": "PRIVATE", "LLM_BASE_URL": "PRIVATE"})
        self.assertEqual(result["purposeBaseOverrides"], ["LLM_BASE_URL"])
        self.assertFalse(result["openRouterBase"])
        self.assertNotIn("PRIVATE", json.dumps(result))
        self.assertEqual(selected_presence({"OPENAI_API_KEY": ""})["OPENAI_API_KEY"], False)


if __name__ == "__main__":
    unittest.main()
