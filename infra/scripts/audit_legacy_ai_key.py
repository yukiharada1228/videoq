"""Locate the stored legacy worker key without printing keys or unrelated metadata."""
import json
import os
import re
import sys
from contextlib import closing
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, build_opener
from audit_ai_credentials import NoRedirect, api_json, error_summary
from retire_ai_credentials import credential_kind, masked_match

ROOT = "https://api.openai.com/v1/organization/projects"


def pages(url, token, prefix):
    after = None
    for _ in range(20):
        query = {"limit": 100}
        if after:
            query['after'] = after
        data = api_json(url+'?'+urlencode(query), token)
        yield from data['data']
        if not data.get('has_more'):
            return
        after = data['last_id']
        if not isinstance(after, str) or not re.fullmatch(prefix+r'[A-Za-z0-9_-]+', after):
            raise ValueError('Invalid pagination cursor')
    raise ValueError('Inventory exceeds page limit')


def probe_key(value):
    request = Request('https://api.openai.com/v1/models', headers={'Authorization': 'Bearer '+value}, method='GET')
    try:
        with build_opener(NoRedirect).open(request, timeout=20) as response:
            return response.status
    except HTTPError as error:
        status = error.code
        error.close()
        return status


def audit_legacy(session, environ):
    with closing(session.client('ssm')) as ssm:
        parameter = ssm.get_parameter(Name='/videoq/prod/app', WithDecryption=True)['Parameter']
        payload = json.loads(parameter['Value'])
    value = payload.get('OPENAI_API_KEY', '')
    kind = credential_kind(value)
    result = {'status': 'legacy_ai_key_audit', 'readOnly': True, 'ssmVersion': parameter['Version'], 'credentialKind': kind, 'matches': []}
    if kind == 'empty':
        return result
    if kind not in {'openai_project', 'openai_legacy'}:
        raise ValueError('Refusing to send an unrecognized credential to OpenAI')
    result['modelsAuthHttpStatus'] = probe_key(value.strip())
    project_count = 0
    for project in pages(ROOT, environ['OPENAI_ADMIN_KEY'], 'proj_'):
        project_count += 1
        if project_count > 50:
            raise ValueError('Too many projects for bounded key search')
        project_id = project['id']
        if not re.fullmatch(r'proj_[A-Za-z0-9_-]+', project_id):
            raise ValueError('Invalid project ID')
        for key in pages(ROOT+'/'+project_id+'/api_keys', environ['OPENAI_ADMIN_KEY'], 'key_'):
            if masked_match(key.get('redacted_value'), value.strip()):
                if not re.fullmatch(r'key_[A-Za-z0-9_-]+', key['id']):
                    raise ValueError('Invalid key ID')
                result['matches'].append({'projectId': project_id, 'keyId': key['id'], 'name': key.get('name', '')})
    result['projectsExamined'] = project_count
    return result


if __name__ == '__main__':
    import boto3
    try:
        result = audit_legacy(boto3.Session(), os.environ)
    except Exception as error:
        print(json.dumps({'status': 'legacy_ai_key_audit_failed', **error_summary(error)}))
        sys.exit(1)
    print(json.dumps(result))
