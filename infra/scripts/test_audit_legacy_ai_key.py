import json
import unittest
from unittest.mock import MagicMock, patch
from audit_legacy_ai_key import audit_legacy


class LegacyAuditTests(unittest.TestCase):
    def test_scan_only_reports_matches_and_probe_never_infers_payment_success(self):
        session = MagicMock()
        session.client.return_value.get_parameter.return_value = {'Parameter': {'Version': 5, 'Value': json.dumps({'OPENAI_API_KEY': 'sk-proj-PRIVATE1234', 'OTHER_SECRET': 'PRIVATE'})}}
        responses = [
            {'data': [{'id': 'proj_other', 'name': 'PRIVATE_OTHER_PROJECT'}, {'id': 'proj_matching'}], 'has_more': False},
            {'data': [{'id': 'key_unrelated', 'name': 'PRIVATE_OTHER_KEY', 'redacted_value': 'sk-proj-...5555'}], 'has_more': False},
            {'data': [{'id': 'key_matching', 'name': 'videoq', 'redacted_value': 'sk-proj-...1234'}], 'has_more': False},
        ]
        with patch('audit_legacy_ai_key.api_json', side_effect=responses), patch('audit_legacy_ai_key.probe_key', return_value=401) as probe:
            result = audit_legacy(session, {'OPENAI_ADMIN_KEY': 'PRIVATE_ADMIN'})
        self.assertEqual(result['modelsAuthHttpStatus'], 401)
        self.assertEqual(result['matches'], [{'projectId': 'proj_matching', 'keyId': 'key_matching', 'name': 'videoq'}])
        self.assertNotIn('PRIVATE', json.dumps(result))
        probe.assert_called_once_with('sk-proj-PRIVATE1234')

    def test_openrouter_key_is_never_sent_to_openai(self):
        session = MagicMock()
        session.client.return_value.get_parameter.return_value = {'Parameter': {'Version': 5, 'Value': json.dumps({'OPENAI_API_KEY': 'sk-or-PRIVATE'})}}
        with patch('audit_legacy_ai_key.probe_key') as probe, self.assertRaises(ValueError):
            audit_legacy(session, {})
        probe.assert_not_called()


if __name__ == '__main__':
    unittest.main()
