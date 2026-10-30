import base64
import contextlib
import io
import json
from types import SimpleNamespace
import unittest
from unittest.mock import MagicMock, patch

import openrouter_identity


class IdentityTests(unittest.TestCase):
    def session(self, enabled=True):
        session = MagicMock(region_name="ap-northeast-1")
        iam = MagicMock()
        iam.get_outbound_web_identity_federation_info.return_value = {
            "JwtVendingEnabled": enabled, "IssuerIdentifier": "https://account.tokens.sts.global.api.aws"}
        iam.enable_outbound_web_identity_federation.return_value = {
            "IssuerIdentifier": "https://account.tokens.sts.global.api.aws"}
        sts = MagicMock()
        claims = {"iss": "https://account.tokens.sts.global.api.aws", "aud": "https://openrouter.ai",
                  "sub": "arn:aws:iam::123456789012:role/videoq-worker-prod", "exp": 2000000000}
        payload = base64.urlsafe_b64encode(json.dumps(claims).encode()).decode().rstrip("=")
        sts.get_web_identity_token.return_value = {"WebIdentityToken": f"PRIVATE.{payload}.PRIVATE"}
        session.client.side_effect = lambda service, **kw: iam if service == "iam" else sts
        return session, iam, sts

    def inspect(self, session, **kwargs):
        with patch.dict("sys.modules", {"botocore.config": SimpleNamespace(Config=lambda **kw: kw)}):
            return openrouter_identity.inspect_identity(session, **kwargs)

    def test_missing_credentials_does_not_call_aws(self):
        session, iam, sts = self.session()
        session.get_credentials.return_value = None
        self.assertEqual(self.inspect(session), {"status": "missing_aws_credentials"})
        session.client.assert_not_called()

    def test_disabled_is_read_only_by_default(self):
        session, iam, sts = self.session(False)
        self.assertEqual(self.inspect(session)["status"], "aws_federation_disabled")
        iam.enable_outbound_web_identity_federation.assert_not_called()
        sts.get_web_identity_token.assert_not_called()
        iam.close.assert_called_once()

    def test_feature_disabled_404_can_be_enabled(self):
        class DisabledError(Exception):
            response = {"Error": {"Code": "FeatureDisabled"}}
        session, iam, sts = self.session()
        iam.get_outbound_web_identity_federation_info.side_effect = DisabledError()
        self.assertEqual(self.inspect(session)["status"], "aws_federation_disabled")
        iam.enable_outbound_web_identity_federation.assert_not_called()
        self.assertEqual(self.inspect(session, enable=True)["status"], "issuer_ready")
        iam.enable_outbound_web_identity_federation.assert_called_once()

    def test_enable_is_explicit_and_idempotent(self):
        session, iam, sts = self.session(False)
        self.assertEqual(self.inspect(session, enable=True)["status"], "issuer_ready")
        iam.enable_outbound_web_identity_federation.assert_called_once()
        session, iam, sts = self.session(True)
        self.inspect(session, enable=True)
        iam.enable_outbound_web_identity_federation.assert_not_called()

    def test_probe_reports_exact_subject_without_token(self):
        session, iam, sts = self.session()
        result = self.inspect(session, probe=True)
        self.assertEqual(result["subject"], "arn:aws:iam::123456789012:role/videoq-worker-prod")
        self.assertNotIn("PRIVATE", json.dumps(result))
        sts.get_web_identity_token.assert_called_once_with(Audience=["https://openrouter.ai"], SigningAlgorithm="RS256", DurationSeconds=900)
        self.assertEqual(session.client.call_args.kwargs["endpoint_url"], "https://sts.ap-northeast-1.amazonaws.com")
        sts.close.assert_called_once()

    def test_inventory_excludes_unrelated_principals_and_never_prints_key_ids(self):
        session, iam, sts = self.session()
        iam.get_role.return_value = {"Role": {"Arn": "arn:aws:iam::123456789012:role/videoq-worker-prod"}}
        iam.get_paginator.return_value.paginate.return_value = [{"Users": [
            {"UserName": "cloudflare", "Arn": "arn:aws:iam::123456789012:user/cloudflare"},
            {"UserName": "other", "Arn": "arn:aws:iam::123456789012:user/other"},
        ]}]
        iam.list_user_policies.return_value = {"PolicyNames": []}
        iam.list_attached_user_policies.return_value = {"AttachedPolicies": []}
        iam.list_access_keys.return_value = {"AccessKeyMetadata": [{"AccessKeyId": "PRIVATE_KEY_ID", "Status": "Active"}]}
        iam.get_access_key_last_used.return_value = {"AccessKeyLastUsed": {"ServiceName": "sqs"}}
        result = self.inspect(session, workloads=True)["workloads"]
        self.assertEqual(len(result["apiCandidates"]), 1)
        self.assertEqual(result["apiCandidates"][0]["lastUsedServices"], ["sqs"])
        self.assertNotIn("PRIVATE", json.dumps(result))
        self.assertNotIn("user/other", json.dumps(result))
        sts.get_web_identity_token.assert_not_called()

    def test_main_redacts_sdk_error_details(self):
        session = MagicMock()
        session.get_credentials.side_effect = RuntimeError("PRIVATE_CREDENTIALS")
        with patch.dict("sys.modules", {"boto3": SimpleNamespace(Session=lambda: session)}), \
                patch("sys.argv", ["openrouter_identity.py"]), contextlib.redirect_stdout(io.StringIO()) as output:
            code = openrouter_identity.main()
        self.assertEqual(code, 1)
        self.assertNotIn("PRIVATE", output.getvalue())
        self.assertEqual(json.loads(output.getvalue())["errorType"], "RuntimeError")


if __name__ == "__main__":
    unittest.main()
