"""Create four migration namespaces from a verified release; never build or run images."""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess

SPEC = importlib.util.spec_from_file_location('release', Path(__file__).with_name('onprem-release.py'))
release = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(release)
REPO = 'yukiharada1228/videoq'
PREFIX = 'ghcr.io/' + REPO + '-'
ROLES = ('api', 'web', 'worker', 'transcription-gateway')


def positive_id(value):
    if not isinstance(value, str) or not re.fullmatch(r'[1-9][0-9]*', value):
        raise ValueError('A positive GitHub run ID is required')
    return value


def source_run(run_id):
    positive_id(run_id)
    data = json.loads(subprocess.check_output(['gh', 'api', f'repos/{REPO}/actions/runs/{run_id}'], text=True))
    if (data.get('repository', {}).get('full_name') != REPO or
        data.get('path') != '.github/workflows/onprem-release.yml' or
        data.get('head_branch') != 'main' or data.get('event') not in ('workflow_run', 'workflow_dispatch') or
        data.get('status') != 'completed' or data.get('conclusion') != 'success'):
        raise ValueError('Bootstrap requires a successful canonical main release run')
    source = release.sha(data.get('head_sha'))
    attempt = data.get('run_attempt')
    if type(attempt) is not int or attempt < 1:
        raise ValueError('Invalid release attempt')
    return {'run_id': run_id, 'source_sha': source,
            'artifact': f'onprem-release-{source}-attempt-{attempt}'}


def publish_context(env):
    if (env.get('GITHUB_REPOSITORY') != REPO or env.get('GITHUB_REF') != 'refs/heads/main' or
        env.get('GITHUB_EVENT_NAME') != 'workflow_dispatch' or
        env.get('GITHUB_SHA') != env.get('BOOTSTRAP_WORKFLOW_SHA')):
        raise ValueError('Publication is restricted to the canonical main workflow')
    release.sha(env.get('GITHUB_SHA'))
    return positive_id(env.get('GITHUB_RUN_ID')), positive_id(env.get('GITHUB_RUN_ATTEMPT'))


def plan(source, application, inference, identity):
    release.sha(source)
    result = []
    for role in ROLES:
        image = inference['whisper']['image'] if role == 'transcription-gateway' else application[role]['image']
        legacy = 'whisper' if role == 'transcription-gateway' else role
        if image['repository'] not in (PREFIX + 'onprem-' + legacy, PREFIX + role):
            raise ValueError('Unexpected bootstrap source repository')
        digest = release.digest(image['digest'])
        result.append({'role': role, 'source': image['repository'] + '@' + digest,
                       'digest': digest, 'destination': PREFIX + role + ':bootstrap-' + source + '-' + identity,
                       'packagePage': 'https://github.com/users/yukiharada1228/packages/container/package/videoq-' + role})
    return result


def copy_image(item):
    inspect = ['docker', 'buildx', 'imagetools', 'inspect', item['destination'], '--format', '{{.Manifest.Digest}}']
    current = subprocess.run(inspect, capture_output=True, text=True)
    if current.returncode == 0:
        if current.stdout.strip() != item['digest']:
            raise ValueError('Refusing to overwrite a bootstrap tag with different content')
        return 'already-present'
    # Unique run/attempt tag; no latest, release tag, package deletion or image execution.
    subprocess.run(['docker', 'buildx', 'imagetools', 'create', '--prefer-index=false',
                    '--tag', item['destination'], item['source']], check=True)
    actual = subprocess.check_output(inspect, text=True).strip()
    if actual != item['digest']:
        raise ValueError('Copied manifest digest differs from the verified source')
    return 'copied'


def package_metadata(role):
    if role not in ROLES:
        raise ValueError('Unexpected package role')
    package = 'videoq-' + role
    data = json.loads(subprocess.check_output(['gh', 'api', 'users/yukiharada1228/packages/container/' + package], text=True))
    if data.get('name') != package or data.get('visibility') not in ('private', 'public', 'internal'):
        raise ValueError('Cannot confirm copied package metadata')
    return {'visibility': data['visibility'], 'repository': (data.get('repository') or {}).get('full_name')}


def bootstrap(source, directory, output, publish=False):
    if publish or os.environ.get('GITHUB_ACTIONS') == 'true':
        run_id, attempt = publish_context(os.environ)
        identity = run_id + '-' + attempt
    else:
        identity = 'preview'
    if output.resolve() == (directory / 'release.json').resolve() or output.suffix == '.tgz':
        raise ValueError('The report must not overwrite signed release artifacts')
    # Verify manifest, both chart archives and every original image attestation.
    application, inference = release.verify(directory / 'release.json', source)
    items = plan(source, application, inference, identity)
    report = {'sourceSha': source, 'mode': 'publish' if publish else 'preview', 'images': items,
              'scope': 'Namespace bootstrap only; not a newly signed release. Do not deploy bootstrap tags.',
              'nextStep': 'Set the four packages Public, confirm repository Actions Write access, then use the normal signed release workflow.'}
    output.parent.mkdir(parents=True, exist_ok=True)
    release.write_atomic(output, report)
    if publish:
        for item in items:
            try:
                item['result'] = copy_image(item)
                item.update(package_metadata(item['role']))
            except Exception:
                item['result'] = 'failed; earlier successful copies are retained'
                release.write_atomic(output, report)
                raise
            release.write_atomic(output, report)
    print(json.dumps(report, indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    src = sub.add_parser('source-run')
    src.add_argument('run_id')
    boot = sub.add_parser('bootstrap')
    boot.add_argument('source')
    boot.add_argument('directory', type=Path)
    boot.add_argument('output', type=Path)
    boot.add_argument('--publish', action='store_true')
    args = parser.parse_args()
    if args.command == 'source-run':
        for key, value in source_run(args.run_id).items():
            print(key + '=' + value)
    else:
        bootstrap(args.source, args.directory, args.output, args.publish)


if __name__ == '__main__':
    main()
