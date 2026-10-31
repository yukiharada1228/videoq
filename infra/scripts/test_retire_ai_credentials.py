import copy
import json
import unittest
from unittest.mock import MagicMock, patch
from retire_ai_credentials import maintain, key_ids, masked_match, PROJECT_ID, WORKER_POLICY, API_POLICY, redaction_shape, credential_kind


class RetirementTests(unittest.TestCase):
    def setup(self):
        self.payload = {"OPENAI_API_KEY": "sk-proj-PRIVATE1234", "R2_SECRET_ACCESS_KEY": "PRIVATE_R2", "USER_SECRET_ENCRYPTION_KEY": "PRIVATE_ENCRYPTION"}
        self.bindings = [{"type": "plain_text", "name": "OPENAI_BASE_URL", "text": "https://openrouter.ai/api/v1"},
                         {"type": "plain_text", "name": "OPENROUTER_FEDERATION_POLICY_ID", "text": API_POLICY},
                         {"type": "secret_text", "name": "OPENAI_API_KEY"}, {"type": "secret_text", "name": "AWS_SECRET_ACCESS_KEY"}]
        self.keys = [{"id": "key_worker", "redacted_value": "sk-proj-...1234", "name": "worker"}, {"id": "key_api", "name": "api"}]
        self.session, self.ssm, self.worker = MagicMock(), MagicMock(), MagicMock()
        self.session.client.side_effect = lambda name: self.ssm if name == "ssm" else self.worker
        self.ssm.get_parameter.side_effect = lambda **kw: {"Parameter": {"Value": json.dumps(self.payload), "Type": "SecureString", "Version": 5}}
        self.ssm.describe_parameters.return_value = {"Parameters": [{"KeyId": "alias/existing-key"}]}
        def put(**kw):
            self.payload = json.loads(kw["Value"])
            return {"Version": 6}
        self.ssm.put_parameter.side_effect = put
        self.worker.get_function_configuration.return_value = {"LastUpdateStatus": "Successful", "Environment": {"Variables": {"OPENROUTER_FEDERATION_POLICY_ID": WORKER_POLICY, "OPENAI_BASE_URL": "https://openrouter.ai/api/v1", "WHISPER_BACKEND": "openrouter"}}}
        self.env = {"CLOUDFLARE_ACCOUNT_ID": "a"*32, "CLOUDFLARE_API_TOKEN": "PRIVATE_CF", "OPENAI_ADMIN_KEY": "PRIVATE_ADMIN"}
        def read(url, token):
            if url.endswith('/settings'):
                return {"success": True, "result": {"bindings": copy.deepcopy(self.bindings)}}
            if '/api_keys?' in url:
                return {"data": copy.deepcopy(self.keys), "has_more": False}
            return {"id": PROJECT_ID, "name": "videoq-prod"}
        def write(url, token, method):
            self.assertEqual(method, "DELETE")
            if '/secrets/' in url:
                self.bindings = [b for b in self.bindings if b['name'] != 'OPENAI_API_KEY']
                return {"success": True}
            self.assertNotIn('OPENAI_API_KEY', self.payload)
            self.assertFalse(any(b['name'] == 'OPENAI_API_KEY' for b in self.bindings))
            identifier = url.rsplit('/', 1)[-1]
            self.keys = [k for k in self.keys if k['id'] != identifier]
            return {"id": identifier, "deleted": True}
        return patch('retire_ai_credentials.api_json', side_effect=read), patch('retire_ai_credentials.write_json', side_effect=write)

    def test_plan_only_exposes_metadata_and_performs_no_writes(self):
        read, write = self.setup()
        with read, write as mutate:
            result = maintain(self.session, self.env)
        mutate.assert_not_called()
        self.ssm.put_parameter.assert_not_called()
        self.assertEqual(result['workerMatchingKeyIds'], ['key_worker'])
        self.assertNotIn('PRIVATE', json.dumps(result))

    def test_retirement_preserves_other_secrets_encryption_and_openrouter_targets(self):
        read, write = self.setup()
        with read, write as mutate:
            result = maintain(self.session, self.env, 'retire', ['key_worker', 'key_api'], 5)
        self.assertTrue(result['runtimeCopiesRemoved'])
        self.assertEqual(self.payload, {'R2_SECRET_ACCESS_KEY': 'PRIVATE_R2', 'USER_SECRET_ENCRYPTION_KEY': 'PRIVATE_ENCRYPTION'})
        self.assertEqual(self.ssm.put_parameter.call_args.kwargs['KeyId'], 'alias/existing-key')
        self.assertFalse(any('openrouter.ai' in call.args[0] for call in mutate.call_args_list))
        self.assertNotIn('PRIVATE', json.dumps(result))
        self.assertTrue(any(b['name'] == 'AWS_SECRET_ACCESS_KEY' for b in self.bindings))

    def test_stale_parameter_version_prevents_every_mutation(self):
        read, write = self.setup()
        with read, write as mutate, self.assertRaises(ValueError):
            maintain(self.session, self.env, 'retire', ['key_worker'], 4)
        mutate.assert_not_called()
        self.ssm.put_parameter.assert_not_called()

    def test_unmatched_worker_key_prevents_mutation(self):
        read, write = self.setup()
        self.payload['OPENAI_API_KEY'] = 'PRIVATE_UNMATCHED'
        with read, write as mutate, self.assertRaises(ValueError):
            maintain(self.session, self.env, 'retire', ['key_api'], 5)
        mutate.assert_not_called()

    def test_already_retired_keys_and_copies_can_be_reverified(self):
        read, write = self.setup()
        self.payload.pop('OPENAI_API_KEY')
        self.bindings = [b for b in self.bindings if b['name'] != 'OPENAI_API_KEY']
        self.keys = []
        with read, write as mutate:
            result = maintain(self.session, self.env, 'retire', ['key_worker'], 5)
        mutate.assert_not_called()
        self.assertEqual(result['alreadyAbsentKeyIds'], ['key_worker'])

    def test_workflow_defaults_to_plan_and_keeps_retirement_behind_review(self):
        from pathlib import Path
        source = (Path(__file__).resolve().parents[2] / '.github/workflows/retire-ai-credentials.yml').read_text()
        self.assertIn('default: plan', source)
        self.assertIn('environment: production-infra', source)
        self.assertIn("github.ref == 'refs/heads/main'", source)
        self.assertIn('KEY_IDS: ${{ inputs.key_ids }}', source)
        self.assertNotIn('upload-artifact', source)
        self.assertNotIn('pull_request_target', source)
        import re
        for command in re.findall(r'^\s+run: (.+)$', source, re.MULTILINE):
            self.assertNotIn('${{', command)

    def test_diagnostic_shape_does_not_expose_fragments_or_weaken_matching(self):
        shape = redaction_shape('sk-PRIVATE...TAIL')
        self.assertEqual(shape, {'present': True, 'maskCount': 1, 'prefixLength': 10, 'suffixLength': 4})
        self.assertNotIn('PRIVATE', json.dumps(shape))
        self.assertEqual(credential_kind(' sk-proj-PRIVATE '), 'openai_project')
        self.assertFalse(masked_match('sk-...ab', 'sk-PRIVATEab'))

    def test_iam_audit_uses_the_existing_read_only_role_without_secrets(self):
        from pathlib import Path
        source = (Path(__file__).resolve().parents[2] / '.github/workflows/retire-ai-credentials.yml').read_text().split('  iam-audit:')[1]
        self.assertIn('AWS_GITHUB_ACTIONS_PLAN_ROLE_ARN', source)
        self.assertNotIn('DEPLOY_ROLE_ARN', source)
        self.assertNotIn('environment:', source)
        self.assertNotIn('OPENAI_ADMIN_KEY', source)
        self.assertIn("inputs.operation == 'plan'", source)

    def test_inputs_cannot_escape_the_exact_project_endpoint(self):
        for raw in ('[]', '["../other"]', '["key_a", "key_a"]', '"key_a"'):
            with self.assertRaises(ValueError):
                key_ids(raw)
        self.assertEqual(key_ids('["key_a"]'), ['key_a'])
        self.assertFalse(masked_match('...1234', 'PRIVATE1234'))
        self.assertFalse(masked_match('sk-...12', 'sk-PRIVATE12'))


if __name__ == '__main__':
    unittest.main()
