import datetime
import json
import unittest
from unittest.mock import MagicMock
from audit_api_iam import audit_api_iam, ARN


class IamAuditTests(unittest.TestCase):
    def test_policies_and_key_age_are_reported_without_access_key_identifiers(self):
        session, iam = MagicMock(), MagicMock()
        session.client.return_value = iam
        iam.get_user.return_value = {"User": {"Arn": ARN}}
        pages = {
            "list_user_policies": [{"PolicyNames": ["sqs"]}],
            "list_attached_user_policies": [{"AttachedPolicies": [{"PolicyArn": "arn:policy/read"}]}],
            "list_access_keys": [{"AccessKeyMetadata": [{"AccessKeyId": "PRIVATE_KEY_ID", "Status": "Active", "CreateDate": datetime.datetime.now(datetime.timezone.utc)-datetime.timedelta(days=40)}]}],
        }
        iam.get_paginator.side_effect = lambda name: MagicMock(paginate=MagicMock(return_value=pages[name]))
        document = {"Statement": [{"Effect": "Allow", "Action": "sqs:SendMessage", "Resource": "arn:queue"}]}
        iam.get_user_policy.return_value = {"PolicyDocument": document}
        iam.get_policy.return_value = {"Policy": {"DefaultVersionId": "v1"}}
        iam.get_policy_version.return_value = {"PolicyVersion": {"Document": document}}
        iam.get_access_key_last_used.return_value = {"AccessKeyLastUsed": {"ServiceName": "sqs"}}
        result = audit_api_iam(session)
        self.assertEqual(len(result['policies']), 2)
        self.assertEqual(result['keys'][0]['ageDays'], 40)
        self.assertNotIn('PRIVATE', json.dumps(result))
        iam.create_access_key.assert_not_called()
        iam.put_user_policy.assert_not_called()

    def test_another_principal_is_rejected_before_reading_its_policies(self):
        session, iam = MagicMock(), MagicMock()
        session.client.return_value = iam
        iam.get_user.return_value = {"User": {"Arn": "arn:other"}}
        with self.assertRaises(ValueError):
            audit_api_iam(session)
        iam.get_paginator.assert_not_called()


if __name__ == '__main__':
    unittest.main()
